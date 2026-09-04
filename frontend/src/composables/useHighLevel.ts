import { computed, ref, watch } from 'vue'
import type { CalendarEvent, Connection, Contact, Conversation } from '@/types'
import * as hl from '@/services/highlevel'
import { useAuth } from './useAuth'

const connection = ref<Connection>({ status: 'disconnected' })
let stop: (() => void) | null = null

const { user } = useAuth()
watch(
  user,
  (next) => {
    stop?.()
    stop = null
    if (!next) {
      connection.value = { status: 'disconnected' }
      return
    }
    stop = hl.watchConnection(next.id, (c) => {
      connection.value = c
    })
  },
  { immediate: true },
)

export function useHighLevel() {
  const connected = computed(() => connection.value.status === 'connected')
  const connecting = computed(() => connection.value.status === 'connecting')
  const lost = computed(() => connection.value.status === 'lost')

  // Leaves the page. The Firestore listener picks the connection up on return,
  // so there is nothing to resolve here.
  async function connect() {
    if (connection.value.status === 'connecting') return
    connection.value = { ...connection.value, status: 'connecting' }
    try {
      await hl.startOAuth()
    } catch (e) {
      connection.value = { status: 'disconnected' }
      throw e
    }
  }

  async function disconnect() {
    await hl.disconnect()
  }

  function dropConnection() {
    if (connection.value.status !== 'connected') return
    connection.value = { ...connection.value, status: 'lost' }
  }

  return {
    connection,
    connected,
    connecting,
    lost,
    connect,
    disconnect,
    dropConnection,
    contacts: hl.listContacts,
    conversations: hl.listConversations,
    events: hl.listEvents,
  }
}

export type { CalendarEvent, Contact, Conversation }

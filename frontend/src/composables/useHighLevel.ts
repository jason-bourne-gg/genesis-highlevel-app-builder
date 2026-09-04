import { computed, ref, watch } from 'vue'
import type { CalendarEvent, Connection, Contact, Conversation } from '@/types'
import * as hl from '@/services/highlevel'
import { ApiError } from '@/services/api'
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

  // A 401 from the proxy means HighLevel rejected the token, so the connection is
  // dead until it is redone. Without this the "lost" state only ever came from the
  // dev menu and a real expiry looked like an empty location.
  const guard =
    <T,>(call: () => Promise<T>) =>
    async (): Promise<T> => {
      try {
        return await call()
      } catch (e) {
        if (e instanceof ApiError && e.code === 'connection_lost') dropConnection()
        throw e
      }
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
    contacts: guard(hl.listContacts),
    conversations: guard(hl.listConversations),
    events: guard(hl.listEvents),
  }
}

export type { CalendarEvent, Contact, Conversation }

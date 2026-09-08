import { computed, ref, watch } from 'vue'
import type { CalendarEvent, Connection, Contact, Conversation } from '@/types'
import * as hl from '@/services/highlevel'
import { ApiError } from '@/services/api'
import { useAuth } from './useAuth'

const connection = ref<Connection>({ status: 'disconnected' })
const listenerFailed = ref(false)
let stop: (() => void) | null = null

const { user } = useAuth()
watch(
  user,
  (next) => {
    stop?.()
    stop = null
    if (!next) {
      connection.value = { status: 'disconnected' }
      listenerFailed.value = false
      return
    }
    listenerFailed.value = false
    stop = hl.watchConnection(
      next.id,
      (c) => {
        connection.value = c
      },
      (e) => {
        // Leave the last known state alone: a dropped listener is not evidence the
        // connection went away, and flipping to disconnected would be a lie.
        console.error('HighLevel connection listener failed', e)
        listenerFailed.value = true
      },
    )
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

  // Reflects its own result rather than waiting to be told. The listener is still the
  // source of truth, but an action that succeeded should not look like it did nothing if
  // that listener is slow or has dropped.
  async function disconnect() {
    await hl.disconnect()
    connection.value = { status: 'disconnected' }
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
    listenerFailed,
    connect,
    disconnect,
    dropConnection,
    contacts: guard(hl.listContacts),
    conversations: guard(hl.listConversations),
    events: guard(hl.listEvents),
  }
}

export type { CalendarEvent, Contact, Conversation }

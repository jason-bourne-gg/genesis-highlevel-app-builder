export interface User {
  id: string
  email: string
}

export interface Project {
  id: string
  name: string
  description: string
  // The HighLevel location this project was created against. Recorded at creation
  // so a project stays associated with one sub-account's data even if the user
  // later reconnects to a different one.
  locationId: string
  createdAt: number
  updatedAt: number
}

export interface ProjectFile {
  path: string
  content: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  status: 'complete' | 'streaming' | 'stopped' | 'failed'
  error?: string
}

export interface Snapshot {
  id: string
  prompt: string
  createdAt: number
  files: ProjectFile[]
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'lost'

export interface Connection {
  status: ConnectionStatus
  locationId?: string
  locationName?: string
  connectedAt?: number
}

export interface Contact {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  tags: string[]
}

export interface Conversation {
  id: string
  contactId: string
  lastMessage: string
  unread: number
  updatedAt: string
}

export interface CalendarEvent {
  id: string
  title: string
  contactId: string
  startTime: string
  endTime: string
  status: 'confirmed' | 'pending' | 'cancelled'
}

export type StreamEvent =
  | { type: 'text'; text: string }
  // Summarised model reasoning. Transient — it is shown while a generation runs
  // and never stored, which is why it is not part of Message.
  | { type: 'status'; text: string }
  | { type: 'file'; path: string }
  | { type: 'token'; path: string; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

export interface User {
  id: string
  email: string
}

export interface Project {
  id: string
  name: string
  description: string
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
  | { type: 'file'; path: string }
  | { type: 'token'; path: string; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

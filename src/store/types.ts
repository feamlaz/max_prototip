export type Direction = 'in' | 'out'

/** Ordered by progression; `failed` may always override (see chatReducer). */
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'

export interface ChatMessage {
  id: string
  direction: Direction
  text: string
  timestamp: number
  status: MessageStatus
  isEdited?: boolean
}

export interface ChatState {
  chatId: string | null
  peerName: string | null
  peerPhone: string | null
  messages: ChatMessage[]
}

export const initialChatState: ChatState = {
  chatId: null,
  peerName: null,
  peerPhone: null,
  messages: [],
}

export type ChatAction =
  | { type: 'chatCreated'; payload: { chatId: string; peerName: string | null; peerPhone: string | null } }
  | { type: 'chatCleared' }
  | { type: 'messagesLoaded'; payload: ChatMessage[] }
  | { type: 'messageAdded'; payload: ChatMessage }
  | { type: 'messageStatusUpdated'; payload: { id: string; status: MessageStatus } }
  | {
      type: 'incomingReceived'
      payload: { id: string; text: string; timestamp: number; senderName?: string | null }
    }
  | {
      type: 'messageReconciled'
      payload: { localId: string; serverId: string; status?: MessageStatus }
    }
  | { type: 'historyMerged'; payload: ChatMessage[] }

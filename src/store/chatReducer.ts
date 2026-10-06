import type { ChatAction, ChatMessage, ChatState, MessageStatus } from './types'

/** `failed` has no rank on purpose: it always overrides (see canApplyStatus). */
const STATUS_RANK: Record<Exclude<MessageStatus, 'failed'>, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
}

function canApplyStatus(current: MessageStatus, next: MessageStatus): boolean {
  if (next === 'failed') return current !== 'failed'
  if (current === 'failed') return false
  return STATUS_RANK[next] > STATUS_RANK[current]
}

function sortAscending(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) =>
    a.timestamp === b.timestamp
      ? a.id.localeCompare(b.id)
      : a.timestamp - b.timestamp,
  )
}

/** Reference equality for the whole list, so no-ops never re-render. */
function sameMessages(a: ChatMessage[], b: ChatMessage[]): boolean {
  return a.length === b.length && a.every((message, i) => message === b[i])
}

/**
 * Upsert by idMessage. Existing messages are never replaced by a duplicate,
 * and the original array is returned untouched when nothing changed.
 */
function upsert(messages: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  const index = messages.findIndex((message) => message.id === incoming.id)
  if (index === -1) return sortAscending([...messages, incoming])

  const current = messages[index] as ChatMessage
  const status = canApplyStatus(current.status, incoming.status)
    ? incoming.status
    : current.status
  const isEdited = Boolean(current.isEdited || incoming.isEdited)
  if (status === current.status && isEdited === Boolean(current.isEdited)) {
    return messages
  }

  const next = [...messages]
  next[index] = { ...current, status, isEdited }
  return next
}

/**
 * Pure reducer for the chat view.
 *
 * Reference equality is preserved whenever nothing actually changes, so React
 * can skip re-renders on webhook echoes and out-of-order status updates.
 */
export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'chatCreated': {
      const { chatId, peerName, peerPhone } = action.payload
      const sameChat = state.chatId === chatId
      return {
        chatId,
        peerName,
        peerPhone,
        // Keep already received messages when re-opening the same chat.
        messages: sameChat ? state.messages : [],
      }
    }

    case 'chatCleared':
      return { chatId: null, peerName: null, peerPhone: null, messages: [] }

    case 'messagesLoaded': {
      if (state.chatId === null) return state
      const messages = sortAscending(action.payload)
      if (sameMessages(messages, state.messages)) return state
      return { ...state, messages }
    }

    
    case 'messageAdded':
      return { ...state, messages: upsert(state.messages, action.payload) }

    case 'messageStatusUpdated': {
      const { id, status } = action.payload
      const index = state.messages.findIndex((message) => message.id === id)
      // Unknown id: nothing to update.
      if (index === -1) return state
      const current = state.messages[index] as ChatMessage
      if (!canApplyStatus(current.status, status)) return state
      const messages = [...state.messages]
      messages[index] = { ...current, status }
      return { ...state, messages }
    }

    case 'incomingReceived': {
      const { id, text, timestamp } = action.payload
      const existing = state.messages.find((message) => message.id === id)
      const message: ChatMessage = {
        id,
        // The webhook may echo a message we sent ourselves — keep it outgoing.
        direction: existing?.direction ?? 'in',
        text,
        timestamp: existing?.timestamp ?? timestamp,
        status: existing?.status ?? 'read',
        isEdited: existing?.isEdited,
      }
      return { ...state, messages: upsert(state.messages, message) }
    }

    case 'messageReconciled': {
      // Swap the optimistic local id for the idMessage returned by sendMessage.
      const { localId, serverId, status } = action.payload
      const index = state.messages.findIndex((message) => message.id === localId)
      if (index === -1) return state
      const current = state.messages[index] as ChatMessage
      // The server id may already be present (echo raced in) — then merge.
      if (state.messages.some((message) => message.id === serverId && message.id !== localId)) {
        const messages = state.messages.filter((message) => message.id !== localId)
        return { ...state, messages }
      }
      const messages = [...state.messages]
      messages[index] = {
        ...current,
        id: serverId,
        status: status ?? current.status,
      }
      return { ...state, messages }
    }

    case 'historyMerged': {
      if (state.chatId === null) return state
      // Merge (not replace): messages added while the history request was in
      // flight must survive.
      let messages = state.messages
      for (const item of action.payload) {
        messages = upsert(messages, item)
      }
      if (sameMessages(messages, state.messages)) return state
      return { ...state, messages }
    }

    default:
      return state
  }
}

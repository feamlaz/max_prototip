import { describe, expect, it } from 'vitest'
import { chatReducer } from './chatReducer'
import { initialChatState } from './types'
import type { ChatMessage, ChatState } from './types'

const chat: ChatState = {
  chatId: '11001234567@c.us',
  peerName: 'Анна',
  peerPhone: '+7 900 123-45-67',
  messages: [],
}

const message = (overrides: Partial<ChatMessage> & { id: string }): ChatMessage => ({
  direction: 'out',
  text: 'text',
  timestamp: 1000,
  status: 'sent',
  ...overrides,
})

describe('chatReducer', () => {
  it('starts from the initial state', () => {
    expect(chatReducer(initialChatState, { type: 'chatCleared' })).toEqual({
      chatId: null,
      peerName: null,
      peerPhone: null,
      messages: [],
    })
  })

  it('creates a chat and clears messages when switching peer', () => {
    const withMessages = chatReducer(chat, {
      type: 'messageAdded',
      payload: message({ id: '1' }),
    })
    const switched = chatReducer(withMessages, {
      type: 'chatCreated',
      payload: { chatId: 'other@c.us', peerName: 'Иван', peerPhone: null },
    })
    expect(switched.chatId).toBe('other@c.us')
    expect(switched.messages).toEqual([])
  })

  describe('rule 1 — dedupe by idMessage', () => {
    it('does not append a duplicate incoming echo', () => {
      const sent = chatReducer(chat, {
        type: 'messageAdded',
        payload: message({ id: 'ABC', direction: 'out', status: 'sent' }),
      })

      // outgoingMessageReceived echo of our own message
      const echo = chatReducer(sent, {
        type: 'incomingReceived',
        payload: { id: 'ABC', text: 'text', timestamp: 1000 },
      })

      expect(echo.messages).toHaveLength(1)
      expect(echo.messages[0]?.direction).toBe('out')
    })

    it('upserts an incoming message by id instead of duplicating it', () => {
      const once = chatReducer(chat, {
        type: 'incomingReceived',
        payload: { id: 'X1', text: 'Привет', timestamp: 2000 },
      })
      const twice = chatReducer(once, {
        type: 'incomingReceived',
        payload: { id: 'X1', text: 'Привет', timestamp: 2000 },
      })
      expect(twice.messages).toHaveLength(1)
    })

    it('adds a genuinely new incoming message', () => {
      const result = chatReducer(chat, {
        type: 'incomingReceived',
        payload: { id: 'NEW', text: 'Привет', timestamp: 2000 },
      })
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toMatchObject({ id: 'NEW', direction: 'in', status: 'read' })
    })
  })

  describe('rule 2 — unknown id is a no-op', () => {
    it('returns the same state object', () => {
      const withMessage = chatReducer(chat, {
        type: 'messageAdded',
        payload: message({ id: '1' }),
      })
      const result = chatReducer(withMessage, {
        type: 'messageStatusUpdated',
        payload: { id: 'missing', status: 'read' },
      })
      expect(result).toBe(withMessage)
    })
  })

  describe('rule 3 — historyMerged keeps messages added after the fetch', () => {
    it('merges without duplicates and sorts ascending', () => {
      const state: ChatState = {
        ...chat,
        messages: [message({ id: 'local', timestamp: 3000, status: 'pending' })],
      }
      const result = chatReducer(state, {
        type: 'historyMerged',
        payload: [
          message({ id: 'h2', direction: 'in', timestamp: 1000, status: 'read' }),
          message({ id: 'local', timestamp: 3000, status: 'read' }),
          message({ id: 'h1', timestamp: 2000, status: 'read' }),
        ],
      })

      expect(result.messages.map((m) => m.id)).toEqual(['h2', 'h1', 'local'])
      // History confirmed our local message — status advanced, count unchanged.
      expect(result.messages).toHaveLength(3)
      expect(result.messages[2]?.status).toBe('read')
    })

    it('returns the same state object when history adds nothing new', () => {
      const state: ChatState = {
        ...chat,
        messages: [message({ id: 'a', timestamp: 1000, status: 'read' })],
      }
      const result = chatReducer(state, {
        type: 'historyMerged',
        payload: [message({ id: 'a', timestamp: 1000, status: 'read' })],
      })
      expect(result).toBe(state)
    })
  })

  describe('rule 4 — status never regresses', () => {
    const withRead = chatReducer(chat, {
      type: 'messageAdded',
      payload: message({ id: '1', status: 'read' }),
    })

    it('never downgrades read to delivered', () => {
      const result = chatReducer(withRead, {
        type: 'messageStatusUpdated',
        payload: { id: '1', status: 'delivered' },
      })
      expect(result).toBe(withRead)
      expect(result.messages[0]?.status).toBe('read')
    })

    it('advances pending -> sent -> delivered -> read', () => {
      let state = chatReducer(chat, {
        type: 'messageAdded',
        payload: message({ id: '1', status: 'pending' }),
      })
      for (const status of ['sent', 'delivered', 'read'] as const) {
        const next = chatReducer(state, {
          type: 'messageStatusUpdated',
          payload: { id: '1', status },
        })
        expect(next.messages[0]?.status).toBe(status)
        state = next
      }
    })

    it('allows failed to override any status, but not another failed', () => {
      const failed = chatReducer(withRead, {
        type: 'messageStatusUpdated',
        payload: { id: '1', status: 'failed' },
      })
      expect(failed.messages[0]?.status).toBe('failed')

      const again = chatReducer(failed, {
        type: 'messageStatusUpdated',
        payload: { id: '1', status: 'failed' },
      })
      expect(again).toBe(failed)
    })
  })

  describe('rule 5 — reference equality', () => {
    it('returns the same object for a no-op action', () => {
      expect(chatReducer(chat, { type: 'chatCreated', payload: { chatId: 'unknown@c.us', peerName: null, peerPhone: null } })).not.toBe(chat)
      expect(chatReducer(chat, { type: 'messagesLoaded', payload: [] })).toBe(chat)
    })
  })

  describe('messageReconciled', () => {
    it('replaces the optimistic id with the server idMessage', () => {
      const state = chatReducer(chat, {
        type: 'messageAdded',
        payload: message({ id: 'local-1', status: 'pending' }),
      })
      const result = chatReducer(state, {
        type: 'messageReconciled',
        payload: { localId: 'local-1', serverId: 'SRV-1', status: 'sent' },
      })
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toMatchObject({ id: 'SRV-1', status: 'sent' })
    })
  })
})

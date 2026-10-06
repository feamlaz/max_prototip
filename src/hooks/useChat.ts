import { useCallback, useMemo, useReducer, useRef, useState } from 'react'
import { normalizePhone } from '../api/client'
import type { GreenApiLike } from '../api/interface'
import { chatReducer } from '../store/chatReducer'
import { initialChatState } from '../store/types'
import type { ChatMessage, ChatState, MessageStatus } from '../store/types'
import type { ChatHistoryItem, WebhookBody } from '../api/types'

const HISTORY_PAGE_SIZE = 50

/** GetChatHistory uses `statusMessage` and `senderId`, unlike the webhooks. */
function fromHistory(item: ChatHistoryItem): ChatMessage {
  return {
    id: item.idMessage,
    direction: item.type === 'outgoing' ? 'out' : 'in',
    text: item.textMessage ?? '',
    timestamp: item.timestamp,
    status: item.statusMessage ?? (item.type === 'outgoing' ? 'sent' : 'read'),
    isEdited: item.isEdited,
  }
}

/**
 * `outgoingAPIMessageReceived` is documented as a webhook type but has no
 * dedicated interface in the union, so it is compared on the raw string.
 */
const OUTGOING_API_ECHO = 'outgoingAPIMessageReceived'

function textFromWebhook(body: WebhookBody): string | null {
  if (
    body.typeWebhook === 'incomingMessageReceived' ||
    body.typeWebhook === 'outgoingMessageReceived'
  ) {
    return body.messageData.textMessageData?.textMessage ?? null
  }
  return null
}

function outgoingEchoText(body: WebhookBody): string | null {
  const type: string = body.typeWebhook
  if (type !== OUTGOING_API_ECHO) return null
  const data = (
    body as { messageData?: { textMessageData?: { textMessage?: string } } }
  ).messageData
  return data?.textMessageData?.textMessage ?? null
}

export interface UseChatResult {
  state: ChatState
  openChat: (phone: string) => Promise<boolean>
  send: (text: string) => Promise<void>
  loadHistory: () => Promise<void>
  /** Feed a webhook here to fold it into the chat state. */
  handleWebhook: (body: WebhookBody) => void
  busy: boolean
  error: string | null
}

/**
 * Chat orchestration: owns the reducer state and maps GREEN-API webhooks and
 * API results onto it. All I/O goes through `GreenApiLike`, so demo mode and
 * the real client behave identically from the UI's point of view.
 */
export function useChat(client: GreenApiLike | null): UseChatResult {
  const [state, dispatch] = useReducer(chatReducer, initialChatState)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const localIdCounter = useRef(0)
  // Last send per chat, used to match outgoing webhooks to optimistic messages.
  const pendingLocalIds = useRef(new Map<string, string>())

  const openChat = useCallback(
    async (phone: string) => {
      const digits = normalizePhone(phone)
      if (!digits) {
        setError('Нужен номер из 11–12 цифр (Россия или Беларусь).')
        return false
      }
      if (!client) {
        setError('Нет подключения к GREEN-API.')
        return false
      }

      setBusy(true)
      setError(null)
      try {
        const account = await client.checkAccount({ phoneNumber: Number(digits) })
        if (!account.exists) {
          setError('Аккаунт с таким номером не найден в MAX.')
          dispatch({ type: 'chatCleared' })
          return false
        }
        dispatch({
          type: 'chatCreated',
          payload: {
            chatId: account.chatId,
            peerName: null,
            peerPhone: digits,
          },
        })
        return true
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Не удалось проверить номер')
        return false
      } finally {
        setBusy(false)
      }
    },
    [client],
  )

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (trimmed === '' || !client || state.chatId === null) return

      const chatId = state.chatId
      localIdCounter.current += 1
      const localId = `local-${localIdCounter.current}`

      // Optimistic append: the bubble appears immediately as `pending`.
      dispatch({
        type: 'messageAdded',
        payload: {
          id: localId,
          direction: 'out',
          text: trimmed,
          timestamp: Date.now(),
          status: 'pending',
        },
      })

      try {
        const serverId = await client.sendMessage({ chatId, message: trimmed })
        pendingLocalIds.current.set(serverId, localId)
        dispatch({
          type: 'messageReconciled',
          payload: { localId, serverId, status: 'sent' },
        })
      } catch (caught) {
        dispatch({
          type: 'messageStatusUpdated',
          payload: { id: localId, status: 'failed' },
        })
        setError(caught instanceof Error ? caught.message : 'Сообщение не отправлено')
      }
    },
    [client, state.chatId],
  )

  const loadHistory = useCallback(async () => {
    if (!client || state.chatId === null) return
    setBusy(true)
    try {
      const items = await client.getChatHistory(state.chatId, HISTORY_PAGE_SIZE)
      // History carries the only human-readable peer name we get for free.
      const peerName =
        state.peerName ??
        items.find((item) => item.type === 'incoming')?.senderName ??
        null
      dispatch({ type: 'historyMerged', payload: items.map(fromHistory) })
      dispatch({
        type: 'chatCreated',
        payload: { chatId: state.chatId, peerName, peerPhone: state.peerPhone },
      })
      setError(null)
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Не удалось загрузить историю',
      )
    } finally {
      setBusy(false)
    }
  }, [client, state.chatId, state.peerName, state.peerPhone])

  /** Folds an outgoing echo into the state, reconciling optimistic messages. */
  const dispatchOutgoing = useCallback(
    (body: WebhookBody, status: MessageStatus) => {
      const { idMessage, timestamp } = body as { idMessage: string; timestamp: number }
      if (idMessage === '') return
      const localId = pendingLocalIds.current.get(idMessage)
      if (localId) {
        // Echo of our own message — reconcile instead of duplicating.
        pendingLocalIds.current.delete(idMessage)
        dispatch({
          type: 'messageReconciled',
          payload: { localId, serverId: idMessage, status },
        })
        return
      }
      const text = textFromWebhook(body) ?? outgoingEchoText(body)
      if (text === null) return
      dispatch({
        type: 'messageAdded',
        payload: { id: idMessage, direction: 'out', text, timestamp, status },
      })
    },
    [],
  )

  const handleWebhook = useCallback(
    (body: WebhookBody) => {
      // `outgoingAPIMessageReceived` has no interface in the union, so it is
      // matched before the typed switch.
      if ((body.typeWebhook as string) === OUTGOING_API_ECHO) {
        dispatchOutgoing(body, 'delivered')
        return
      }

      switch (body.typeWebhook) {
        case 'incomingMessageReceived': {
          const text = textFromWebhook(body)
          if (text === null) return
          dispatch({
            type: 'incomingReceived',
            payload: {
              id: body.idMessage,
              text,
              timestamp: body.timestamp,
              senderName: body.senderData.senderName,
            },
          })
          return
        }
        case 'outgoingMessageReceived': {
          dispatchOutgoing(body, 'delivered')
          return
        }
        case 'outgoingMessageStatus': {
          const { idMessage, status } = body
          const mapped =
            status === 'failed' || status === 'noAccount' || status === 'notInGroup'
              ? ('failed' as const)
              : status === 'read'
                ? ('read' as const)
                : ('delivered' as const)
          dispatch({ type: 'messageStatusUpdated', payload: { id: idMessage, status: mapped } })
          return
        }
        default:
          return
      }
    },
    [dispatchOutgoing],
  )

  return useMemo(
    () => ({ state, openChat, send, loadHistory, handleWebhook, busy, error }),
    [state, openChat, send, loadHistory, handleWebhook, busy, error],
  )
}

/**
 * Self-contained in-memory GREEN-API fake so the whole flow can be reviewed
 * without real credentials. Deterministic by design: one deterministic emitter,
 * timers tracked so tests can drain them, and no randomness anywhere.
 */
import { GreenApiError } from '../api/errors'
import { normalizePhone, sleep } from '../api/client'
import type {
  CheckAccountResult,
  GreenApiLike,
  NotificationWithReceipt,
} from '../api/interface'
import type {
  ChatHistoryItem,
  CheckAccountRequest,
  InstanceState,
  SendMessageRequest,
  WebhookBody,
} from '../api/types'

/** Artificial latency so the pending -> sent transition is visible in the UI. */
export const DEMO_SEND_LATENCY_MS = 600
/**
 * Staggered status webhooks after a send, so the full
 * `pending -> sent -> delivered -> read` lifecycle is observable in the demo
 * exactly like on a live instance. Delays are measured from the moment
 * `sendMessage` resolved.
 */
export const DEMO_ECHO_DELAY_MS = 400
export const DEMO_DELIVERED_DELAY_MS = 1200
export const DEMO_READ_DELAY_MS = 2200
/** Long-poll feel: resolve on emit, otherwise give up after this. */
export const DEMO_POLL_MS = 1000

const DEMO_CHAT_ID = '10000000'
const DEMO_PEER = 'Демо-контакт'

/** Deterministic id generator — no Math.random, no Date.now for ids. */
function nextId(): string {
  counter += 1
  return `DEMO${counter}`
}

let counter = 0
let receiptCounter = 0

export class DemoGreenApiClient implements GreenApiLike {
  private readonly queue: NotificationWithReceipt[] = []
  private readonly waiters: Array<(result: NotificationWithReceipt | null) => void> = []
  private readonly timers = new Set<ReturnType<typeof setTimeout>>()
  private readonly history: ChatHistoryItem[] = []
  /** Resolves when `dispose()` is called, to release pending long-polls. */
  private disposed = false

  constructor() {
    const now = Date.now()
    this.history.push(
      {
        type: 'incoming',
        idMessage: 'DEMOH1',
        timestamp: now - 120_000,
        statusMessage: 'read',
        typeMessage: 'textMessage',
        chatId: DEMO_CHAT_ID,
        chatType: 'user',
        senderId: DEMO_CHAT_ID,
        senderName: DEMO_PEER,
        senderType: 'user',
        textMessage: 'Привет! Это демо-режим MAX — можешь писать без учётных данных.',
      },
      {
        type: 'outgoing',
        idMessage: 'DEMOH2',
        timestamp: now - 60_000,
        statusMessage: 'read',
        sendByApi: true,
        typeMessage: 'textMessage',
        chatId: DEMO_CHAT_ID,
        chatType: 'user',
        senderId: 'me',
        senderName: 'Я',
        senderType: 'user',
        textMessage: 'Отлично, проверяю прототип.',
      },
      {
        type: 'incoming',
        idMessage: 'DEMOH3',
        timestamp: now - 30_000,
        statusMessage: 'read',
        typeMessage: 'textMessage',
        chatId: DEMO_CHAT_ID,
        chatType: 'user',
        senderId: DEMO_CHAT_ID,
        senderName: DEMO_PEER,
        senderType: 'user',
        textMessage: 'Отправь мне сообщение — автоответ придёт сюда.',
      },
    )
  }

  /** Schedules an emit on the tracked timer set so `dispose()` cleans it up. */
  private schedule(delayMs: number, run: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer)
      if (this.disposed) return
      run()
    }, delayMs)
    this.timers.add(timer)
  }

  /** Exposed for tests: push a webhook as if it arrived from the instance. */
  emit(body: WebhookBody, receiptId = ++receiptCounter): NotificationWithReceipt {
    const waiter = this.waiters.shift()
    if (waiter) {
      waiter({ receiptId, body })
    } else {
      this.queue.push({ receiptId, body })
    }
    return { receiptId, body }
  }

  /** Waits for all scheduled timers to fire (tests). */
  async drain(): Promise<void> {
    await sleep(0)
  }

  async dispose(): Promise<void> {
    this.disposed = true
    for (const timer of this.timers) clearTimeout(timer)
    this.timers.clear()
    for (const waiter of this.waiters.splice(0)) waiter(null)
    this.queue.length = 0
  }

  async getStateInstance(): Promise<InstanceState> {
    return 'authorized'
  }

  async checkAccount(request: CheckAccountRequest): Promise<CheckAccountResult> {
    const digits = normalizePhone(String(request.phoneNumber))
    if (!digits) {
      throw new GreenApiError('Нужен номер из 11–12 цифр (Россия или Беларусь).')
    }
    return { exists: true, chatId: DEMO_CHAT_ID }
  }

  async sendMessage(request: SendMessageRequest): Promise<string> {
    if (request.message.trim() === '') {
      throw new GreenApiError('Сообщение пустое.')
    }
    await sleep(DEMO_SEND_LATENCY_MS)

    const idMessage = nextId()
    const text = request.message
    const instanceData = { idInstance: 0, wid: 'demo@max.ru', typeInstance: 'max' }

    // A live instance echoes the message we just sent, then reports delivery and
    // read receipts. Emulate all three so the status lifecycle is reviewable
    // without real credentials. `chatId` on outgoingMessageStatus is top-level
    // per the webhook contract — it is NOT inside senderData.
    this.schedule(DEMO_ECHO_DELAY_MS, () => {
      this.emit({
        typeWebhook: 'outgoingMessageReceived',
        instanceData,
        timestamp: Date.now(),
        idMessage,
        senderData: {
          chatId: request.chatId,
          chatName: DEMO_PEER,
          chatType: 'user',
          sender: DEMO_CHAT_ID,
          senderName: DEMO_PEER,
          senderType: 'user',
        },
        messageData: {
          typeMessage: 'textMessage',
          textMessageData: { textMessage: text },
        },
      })
    })

    const statusWebhook = (status: 'delivered' | 'read') =>
      this.emit({
        typeWebhook: 'outgoingMessageStatus',
        instanceData,
        timestamp: Date.now(),
        idMessage,
        chatId: request.chatId,
        status,
      })

    this.schedule(DEMO_DELIVERED_DELAY_MS, () => statusWebhook('delivered'))
    this.schedule(DEMO_READ_DELAY_MS, () => statusWebhook('read'))

    // Auto-reply arrives a moment later, like a real peer response.
    const timer = setTimeout(() => {
      this.timers.delete(timer)
      if (this.disposed) return
      this.emit({
        typeWebhook: 'incomingMessageReceived',
        instanceData,
        timestamp: Date.now(),
        idMessage: nextId(),
        senderData: {
          chatId: request.chatId,
          chatName: DEMO_PEER,
          chatType: 'user',
          sender: DEMO_CHAT_ID,
          senderName: DEMO_PEER,
          senderType: 'user',
        },
        messageData: {
          typeMessage: 'textMessage',
          textMessageData: {
            textMessage: `Получил: "${text}" — это автоответ демо-режима.`,
          },
        },
      })
    }, DEMO_SEND_LATENCY_MS)
    this.timers.add(timer)

    return idMessage
  }

  async receiveNotificationRaw(
    receiveTimeoutSeconds: number,
    signal?: AbortSignal,
  ): Promise<NotificationWithReceipt | null> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    // The demo always hands out a receiptId, so the hook's `receiptId === null`
    // branch (a real envelope without one) is never exercised here.
    const queued = this.queue.shift()
    if (queued) return { receiptId: queued.receiptId, body: queued.body }

    const timeoutMs = Math.min(60, Math.max(5, receiveTimeoutSeconds)) * 100
    return new Promise<NotificationWithReceipt | null>((resolve, reject) => {
      let settled = false

      const finish = (value: NotificationWithReceipt | null) => {
        if (settled) return
        settled = true
        this.timers.delete(timer)
        signal?.removeEventListener('abort', onAbort)
        const index = this.waiters.indexOf(waiter)
        if (index !== -1) this.waiters.splice(index, 1)
        resolve(value)
      }

      const onAbort = () => {
        if (settled) return
        settled = true
        this.timers.delete(timer)
        const index = this.waiters.indexOf(waiter)
        if (index !== -1) this.waiters.splice(index, 1)
        reject(new DOMException('Aborted', 'AbortError'))
      }

      const waiter: (result: NotificationWithReceipt | null) => void = finish
      this.waiters.push(waiter)
      signal?.addEventListener('abort', onAbort, { once: true })

      const timer = setTimeout(() => finish(null), timeoutMs)
      this.timers.add(timer)
    })
  }

  async receiveNotification(
    receiveTimeoutSeconds: number,
    signal?: AbortSignal,
  ): Promise<WebhookBody | null> {
    const result = await this.receiveNotificationRaw(receiveTimeoutSeconds, signal)
    return result ? result.body : null
  }

  async deleteNotification(_receiptId: number): Promise<void> {
    // No queue to acknowledge — the demo emitter already handed the webhook over.
  }

  async getChatHistory(chatId: string, count: number): Promise<ChatHistoryItem[]> {
    await sleep(0)
    return this.history
      .filter((item) => item.chatId === chatId)
      .slice(-Math.max(0, count))
      .map((item) => ({ ...item }))
  }
}

export function createDemoClient(): DemoGreenApiClient {
  return new DemoGreenApiClient()
}

export { DEMO_CHAT_ID, DEMO_PEER }

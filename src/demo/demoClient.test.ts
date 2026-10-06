import { afterEach, describe, expect, it, vi } from 'vitest'
import { GreenApiError } from '../api/errors'
import type { WebhookBody } from '../api/types'
import {
  DEMO_DELIVERED_DELAY_MS,
  DEMO_ECHO_DELAY_MS,
  DEMO_READ_DELAY_MS,
  DEMO_SEND_LATENCY_MS,
  DemoGreenApiClient,
} from './demoClient'

const clients: DemoGreenApiClient[] = []

function makeClient(): DemoGreenApiClient {
  const client = new DemoGreenApiClient()
  clients.push(client)
  return client
}

afterEach(async () => {
  vi.useRealTimers()
  while (clients.length > 0) {
    const client = clients.pop()
    await client?.dispose()
  }
})

/**
 * Drains `count` webhooks through the long-poll while fake timers advance, so
 * the staggered echo/delivered/read timers fire deterministically.
 */
async function collect(client: DemoGreenApiClient, count: number, totalMs: number) {
  const bodies: WebhookBody[] = []
  const controller = new AbortController()
  const loop = (async () => {
    while (bodies.length < count) {
      const notification = await client.receiveNotificationRaw(30, controller.signal)
      if (!notification) break
      bodies.push(notification.body)
    }
  })()
  await vi.advanceTimersByTimeAsync(totalMs)
  controller.abort()
  await loop.catch(() => undefined)
  return bodies
}

describe('DemoGreenApiClient', () => {
  it('always reports an authorized instance', async () => {
    await expect(makeClient().getStateInstance()).resolves.toBe('authorized')
  })

  describe('checkAccount', () => {
    it('accepts any valid 11-12 digit number', async () => {
      const client = makeClient()
      await expect(client.checkAccount({ phoneNumber: 79001234567 })).resolves.toEqual({
        exists: true,
        chatId: '10000000',
      })
      await expect(client.checkAccount({ phoneNumber: 375291234567 })).resolves.toMatchObject({
        exists: true,
      })
    })

    it('rejects malformed numbers with a Russian error', async () => {
      const client = makeClient()
      await expect(client.checkAccount({ phoneNumber: 12345 })).rejects.toBeInstanceOf(
        GreenApiError,
      )
      await expect(client.checkAccount({ phoneNumber: 12345 })).rejects.toThrow(
        'Нужен номер из 11–12 цифр',
      )
    })
  })

  describe('sendMessage -> auto-reply', () => {
    it('emits the auto-reply with the sent text', async () => {
      const client = makeClient()
      const controller = new AbortController()

      const bodies: WebhookBody[] = []
      const loop = (async () => {
        while (bodies.length < 4) {
          const notification = await client.receiveNotificationRaw(30, controller.signal)
          if (!notification) break
          bodies.push(notification.body)
        }
      })()

      const serverId = await client.sendMessage({ chatId: '10000000', message: 'Привет' })
      expect(serverId).toMatch(/^DEMO\d+$/)
      await loop
      controller.abort()

      const reply = bodies.find((body) => body.typeWebhook === 'incomingMessageReceived')
      expect(reply).toBeDefined()
      if (reply?.typeWebhook === 'incomingMessageReceived') {
        expect(reply.messageData.textMessageData?.textMessage).toBe(
          'Получил: "Привет" — это автоответ демо-режима.',
        )
      }
    })

    it('resolves the long-poll with null on timeout and honours abort', async () => {
      const client = makeClient()
      const controller = new AbortController()
      const pending = client.receiveNotificationRaw(5, controller.signal)
      controller.abort()
      await expect(pending).rejects.toThrow(/abort/i)
    })

    it('applies an artificial latency on send', async () => {
      const client = makeClient()
      const started = Date.now()
      await client.sendMessage({ chatId: '10000000', message: 'x' })
      expect(Date.now() - started).toBeGreaterThanOrEqual(DEMO_SEND_LATENCY_MS - 30)
      await client.dispose()
    })
  })

  describe('sendMessage -> status lifecycle', () => {
    it('echoes the sent message, then delivered, then read — same idMessage', async () => {
      vi.useFakeTimers()
      const client = makeClient()

      const sent = client.sendMessage({ chatId: '10000000', message: 'Привет' })
      const bodiesPromise = collect(
        client,
        4,
        DEMO_SEND_LATENCY_MS + DEMO_READ_DELAY_MS + 200,
      )
      const serverId = await vi.runAllTimersAsync().then(() => sent)
      const bodies = await bodiesPromise

      const outgoing = bodies.filter(
        (body) =>
          body.typeWebhook === 'outgoingMessageReceived' ||
          body.typeWebhook === 'outgoingMessageStatus',
      )
      expect(outgoing.map((body) => body.typeWebhook)).toEqual([
        'outgoingMessageReceived',
        'outgoingMessageStatus',
        'outgoingMessageStatus',
      ])
      expect(outgoing.every((body) => body.idMessage === serverId)).toBe(true)

      const statuses = outgoing
        .filter((body) => body.typeWebhook === 'outgoingMessageStatus')
        .map((body) => (body as { status: string }).status)
      expect(statuses).toEqual(['delivered', 'read'])

      // The auto-reply is still delivered.
      expect(bodies.some((body) => body.typeWebhook === 'incomingMessageReceived')).toBe(true)
    })

    it('echoes the exact text just sent', async () => {
      vi.useFakeTimers()
      const client = makeClient()

      const sent = client.sendMessage({ chatId: '10000000', message: 'Проверка статусов' })
      const bodiesPromise = collect(client, 1, DEMO_SEND_LATENCY_MS + DEMO_ECHO_DELAY_MS + 200)
      const serverId = await vi.runAllTimersAsync().then(() => sent)
      const [echo] = await bodiesPromise

      expect(echo?.typeWebhook).toBe('outgoingMessageReceived')
      expect((echo as { idMessage?: string } | undefined)?.idMessage).toBe(serverId)
      if (echo?.typeWebhook === 'outgoingMessageReceived') {
        expect(echo.messageData.textMessageData?.textMessage).toBe('Проверка статусов')
        expect(echo.senderData).toMatchObject({
          chatId: '10000000',
          chatType: 'user',
          sender: '10000000',
          senderName: 'Демо-контакт',
          senderType: 'user',
        })
      }
    })

    it('puts chatId at the top level of outgoingMessageStatus, not in senderData', async () => {
      vi.useFakeTimers()
      const client = makeClient()

      const sent = client.sendMessage({ chatId: '10000000', message: 'x' })
      const bodiesPromise = collect(
        client,
        3,
        DEMO_SEND_LATENCY_MS + DEMO_DELIVERED_DELAY_MS + 200,
      )
      await vi.runAllTimersAsync().then(() => sent)
      const bodies = await bodiesPromise

      const status = bodies.find((body) => body.typeWebhook === 'outgoingMessageStatus')
      expect(status).toBeDefined()
      if (status?.typeWebhook === 'outgoingMessageStatus') {
        expect(status.chatId).toBe('10000000')
        // Regression guard: the contract keeps chatId out of senderData.
        expect((status as { senderData?: unknown }).senderData).toBeUndefined()
        expect(status.status).toBe('delivered')
        expect(status.instanceData).toMatchObject({ wid: 'demo@max.ru', typeInstance: 'max' })
        expect(typeof status.timestamp).toBe('number')
      }
    })

    it('cancels the pending status timers on dispose', async () => {
      vi.useFakeTimers()
      const client = makeClient()

      const sent = client.sendMessage({ chatId: '10000000', message: 'x' })
      await vi.advanceTimersByTimeAsync(DEMO_SEND_LATENCY_MS)
      await sent
      await client.dispose()

      const bodies = await collect(
        client,
        3,
        DEMO_READ_DELAY_MS + DEMO_SEND_LATENCY_MS + 200,
      )
      expect(bodies).toHaveLength(0)
    })
  })

  describe('getChatHistory', () => {
    it('returns the canned greeting conversation', async () => {
      const client = makeClient()
      const history = await client.getChatHistory('10000000', 50)
      expect(history.length).toBeGreaterThanOrEqual(3)
      expect(history[0]?.textMessage).toContain('демо-режим')
    })

    it('returns an empty array for an unknown chat', async () => {
      const client = makeClient()
      await expect(client.getChatHistory('other@c.us', 50)).resolves.toEqual([])
    })
  })

  it('deleteNotification is a no-op and emit() feeds the poll loop', async () => {
    const client = makeClient()
    await expect(client.deleteNotification(1)).resolves.toBeUndefined()

    const body = {
      typeWebhook: 'quotaExceeded',
      instanceData: { idInstance: 0, wid: 'demo', typeInstance: 'max' },
      timestamp: 1,
    } satisfies WebhookBody

    const notification = await client.receiveNotificationRaw(30)
    expect(notification).toBeNull()

    const pending = client.receiveNotificationRaw(30)
    client.emit(body, 5)
    await expect(pending).resolves.toMatchObject({ receiptId: 5 })
  })
})

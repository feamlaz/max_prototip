import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GreenApiLike, NotificationWithReceipt } from '../api/interface'
import type { WebhookBody } from '../api/types'
import { useNotifications } from './useNotifications'

const body: WebhookBody = {
  typeWebhook: 'incomingMessageReceived',
  instanceData: { idInstance: 1, wid: '1@max.ru', typeInstance: 'max' },
  timestamp: 1,
  idMessage: 'BAE5F1',
  senderData: {
    chatId: '11001234567@c.us',
    chatName: 'Peer',
    chatType: 'user',
    sender: '11001234567@c.us',
    senderName: 'Peer',
    senderType: 'user',
  },
  messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'hi' } },
}

function makeClient(notification: NotificationWithReceipt | null): GreenApiLike {
  // The notification is served once and every later poll answers "nothing": a
  // transport that always answers instantly would starve the event loop and
  // never reach the idle delay that paces the loop.
  let served = false
  return {
    getStateInstance: vi.fn().mockResolvedValue('authorized'),
    sendMessage: vi.fn().mockResolvedValue('BAE5F1'),
    receiveNotificationRaw: vi.fn(async () => {
      if (served || notification === null) return null
      served = true
      return notification
    }),
    receiveNotification: vi.fn().mockResolvedValue(notification?.body ?? null),
    deleteNotification: vi.fn().mockResolvedValue(undefined),
    checkAccount: vi.fn().mockResolvedValue({ exists: true, chatId: '1@c.us' }),
    getChatHistory: vi.fn().mockResolvedValue([]),
  }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('useNotifications', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('delivers a webhook and acknowledges its receipt while mounted', async () => {
    vi.useFakeTimers()
    const client = makeClient({ receiptId: 7, body })
    const onWebhook = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() => useNotifications(client, { enabled: true, onWebhook }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(onWebhook).toHaveBeenCalledWith(body)
    expect(client.deleteNotification).toHaveBeenCalledWith(7, expect.anything())
    expect(result.current.lastActivityAt).not.toBeNull()
    expect(result.current.lastError).toBeNull()
  })

  it('skips DeleteNotification when the envelope has no receiptId', async () => {
    vi.useFakeTimers()
    const client = makeClient({ receiptId: null, body })
    const onWebhook = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() => useNotifications(client, { enabled: true, onWebhook }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    // A fabricated id would answer 400 on every iteration and spam lastError.
    expect(onWebhook).toHaveBeenCalledWith(body)
    expect(client.deleteNotification).not.toHaveBeenCalled()
    expect(result.current.lastError).toBeNull()
  })

  it('touches no state when the component unmounts while the webhook is pending', async () => {
    vi.useFakeTimers()
    const client = makeClient({ receiptId: 7, body })
    const handler = deferred()
    const onWebhook = vi.fn(() => handler.promise)

    const { result, unmount } = renderHook(() =>
      useNotifications(client, { enabled: true, onWebhook }),
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(onWebhook).toHaveBeenCalledTimes(1)

    // Unmount, then let the in-flight handler finish: the loop must be gone.
    unmount()
    await act(async () => {
      handler.resolve()
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(client.deleteNotification).not.toHaveBeenCalled()
    expect(result.current.lastActivityAt).toBeNull()
    expect(result.current.lastError).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('leaves the idle delay immediately on unmount instead of staying parked', async () => {
    vi.useFakeTimers()
    const client = makeClient(null)
    const onWebhook = vi.fn()

    const { unmount } = renderHook(() => useNotifications(client, { enabled: true, onWebhook }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(client.receiveNotificationRaw).toHaveBeenCalledTimes(1)

    unmount()
    // The 250ms idle timer must be released by the abort, not waited out.
    expect(vi.getTimerCount()).toBe(0)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(client.receiveNotificationRaw).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not retry after an unmount that lands in the error backoff', async () => {
    vi.useFakeTimers()
    const failure = new Error('Сеть недоступна')
    const client: GreenApiLike = {
      ...makeClient(null),
      receiveNotificationRaw: vi.fn().mockRejectedValue(failure),
    }

    const { result, unmount } = renderHook(() =>
      useNotifications(client, { enabled: true, onWebhook: vi.fn() }),
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.lastError).toBe('Сеть недоступна')
    expect(client.receiveNotificationRaw).toHaveBeenCalledTimes(1)

    unmount()
    // The 2s backoff timer must be released by the abort, not waited out.
    expect(vi.getTimerCount()).toBe(0)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(client.receiveNotificationRaw).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
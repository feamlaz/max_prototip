import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DemoGreenApiClient } from '../demo/demoClient'
import { useChat } from './useChat'
import { useNotifications } from './useNotifications'

/**
 * End-to-end of the demo flow with the fake transport: open a chat, send a
 * message, and let the long-poll deliver the auto-reply.
 */
describe('demo flow', () => {
  it('openChat -> send -> status lifecycle -> autoreply', async () => {
    const client = new DemoGreenApiClient()
    const { result } = renderHook(() => {
      const chat = useChat(client)
      const notifications = useNotifications(client, {
        enabled: true,
        onWebhook: chat.handleWebhook,
      })
      return { chat, notifications }
    })

    await act(async () => {
      await result.current.chat.openChat('+7 (900) 123-45-67')
    })
    expect(result.current.chat.state.chatId).toBe('10000000')

    await act(async () => {
      await result.current.chat.loadHistory()
    })
    expect(result.current.chat.state.messages.length).toBeGreaterThanOrEqual(3)
    // The peer name is only available from the history payload.
    expect(result.current.chat.state.peerName).toBe('Демо-контакт')

    const before = result.current.chat.state.messages.length
    await act(async () => {
      await result.current.chat.send('Привет из теста')
    })

    await waitFor(
      () => {
        const texts = result.current.chat.state.messages.map((m) => m.text)
        expect(texts.some((text) => text.includes('автоответ демо-режима'))).toBe(true)
      },
      { timeout: 4000 },
    )

    const messages = result.current.chat.state.messages
    expect(messages.filter((m) => m.text === 'Привет из теста')).toHaveLength(1)
    expect(messages[messages.length - 1]?.direction).toBe('in')
    expect(result.current.notifications.lastActivityAt).not.toBeNull()
    expect(messages.length).toBeGreaterThan(before)

    // The simulated status webhooks must finish the lifecycle on the single
    // outgoing bubble — no duplicate from the echo.
    await waitFor(
      () => {
        const sent = result.current.chat.state.messages.filter((m) => m.text === 'Привет из теста')
        expect(sent).toHaveLength(1)
        expect(sent[0]?.status).toBe('read')
      },
      { timeout: 4000 },
    )
    const sent = result.current.chat.state.messages.filter((m) => m.text === 'Привет из теста')
    expect(sent[0]?.direction).toBe('out')
    expect(sent[0]?.id).toMatch(/^DEMO\d+$/)

    await act(async () => {
      await client.dispose()
    })
  })
})

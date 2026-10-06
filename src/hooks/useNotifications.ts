import { useEffect, useRef, useState } from 'react'
import { sleep } from '../api/client'
import type { GreenApiLike } from '../api/interface'
import type { InstanceState, WebhookBody } from '../api/types'

/** GREEN-API accepts 5..60; 30 keeps the queue draining without hammering. */
const POLL_TIMEOUT_SECONDS = 30
const IDLE_DELAY_MS = 250
const ERROR_DELAY_MS = 2000

export interface UseNotificationsOptions {
  enabled: boolean
  onWebhook: (body: WebhookBody) => void | Promise<void>
  /** Receives `stateInstanceChanged` so polling and webhooks stay in sync. */
  onStateInstanceChange?: (state: InstanceState) => void
}

export interface UseNotificationsResult {
  running: boolean
  lastError: string | null
  lastActivityAt: number | null
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

/**
 * GREEN-API long-poll loop.
 *
 * The notification stays in the instance queue until it is acknowledged with
 * DeleteNotification, so the webhook handler runs *before* the delete call and
 * the loop must stop completely on unmount — otherwise React state updates
 * would target an unmounted tree. Every `await` inside the loop is therefore
 * followed by a stop check, and the delays are abortable so unmount does not
 * leave the loop parked.
 */
export function useNotifications(
  client: GreenApiLike | null,
  options: UseNotificationsOptions,
): UseNotificationsResult {
  const { enabled, onWebhook, onStateInstanceChange } = options

  // `running` starts as true when the loop is about to start, so the exposed
  // value can be derived from `active` instead of being reset inside the effect.
  const [loopStarted, setLoopStarted] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [lastActivityAt, setLastActivityAt] = useState<number | null>(null)

  // Keep the latest callbacks without restarting the poll loop.
  const webhookRef = useRef(onWebhook)
  const stateRef = useRef(onStateInstanceChange)
  useEffect(() => {
    webhookRef.current = onWebhook
    stateRef.current = onStateInstanceChange
  }, [onWebhook, onStateInstanceChange])

  useEffect(() => {
    if (!client || !enabled) return

    const controller = new AbortController()
    let stopped = false
    // oxlint-disable-next-line react/set-state-in-effect
    setLoopStarted(true)
    setLastError(null)

    // A single predicate: the loop must re-check it after every await, because
    // an unmount can happen while the request or the handler is in flight.
    const isStopped = (): boolean => stopped || controller.signal.aborted

    // Abortable delay: `false` means the wait was cut short by an abort, so the
    // loop can leave immediately instead of staying parked for the full delay.
    const delay = async (ms: number): Promise<boolean> => {
      try {
        await sleep(ms, controller.signal)
        return true
      } catch {
        return false
      }
    }

    const loop = async () => {
      while (!isStopped()) {
        try {
          const notification = await client.receiveNotificationRaw(
            POLL_TIMEOUT_SECONDS,
            controller.signal,
          )
          if (isStopped()) return
          if (notification) {
            if (notification.body.typeWebhook === 'stateInstanceChanged') {
              stateRef.current?.(notification.body.stateInstance)
            }
            await webhookRef.current(notification.body)
            if (isStopped()) return
            // Acknowledge only after handling, otherwise a crash loses the event.
            // A null receiptId means the envelope had none: deleting an invented
            // id would answer 400 and spam `lastError` every iteration.
            if (notification.receiptId !== null) {
              await client.deleteNotification(notification.receiptId, controller.signal)
              if (isStopped()) return
              setLastActivityAt(Date.now())
            }
          } else if (!(await delay(IDLE_DELAY_MS))) {
            return
          }
        } catch (error) {
          if (isStopped() || isAbortError(error)) return
          setLastError(
            error instanceof Error ? error.message : 'Ошибка получения уведомлений',
          )
          await delay(ERROR_DELAY_MS)
        }
      }
    }

    void loop()

    return () => {
      stopped = true
      controller.abort()
    }
  }, [client, enabled])

  // Disabled means "no loop": the exposed flags are derived away instead of
  // being reset from inside the effect.
  const active = Boolean(client) && enabled
  return {
    running: active && loopStarted,
    lastError: active ? lastError : null,
    lastActivityAt: active ? lastActivityAt : null,
  }
}

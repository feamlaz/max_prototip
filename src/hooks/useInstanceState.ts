import { useCallback, useEffect, useRef, useState } from 'react'
import type { GreenApiLike } from '../api/interface'
import type { InstanceState } from '../api/types'

const POLL_INTERVAL_MS = 10_000
const MAX_BACKOFF_MS = 120_000

export interface UseInstanceStateResult {
  state: InstanceState | null
  error: string | null
  refresh: () => Promise<void>
  checking: boolean
}

/**
 * Polls `getStateInstance` while `enabled`. Repeated failures back off
 * exponentially so a broken instance does not hammer the API.
 */
export function useInstanceState(
  client: GreenApiLike | null,
  enabled: boolean,
): UseInstanceStateResult {
  const [state, setState] = useState<InstanceState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const failures = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(true)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (timer.current) clearTimeout(timer.current)
      abort.current?.abort()
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!client || !enabled) return
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    if (mounted.current) setChecking(true)
    try {
      const next = await client.getStateInstance(controller.signal)
      if (!mounted.current || controller.signal.aborted) return
      failures.current = 0
      setState(next)
      setError(null)
    } catch (caught) {
      if (!mounted.current || controller.signal.aborted) return
      failures.current += 1
      setError(caught instanceof Error ? caught.message : 'Неизвестная ошибка')
    } finally {
      if (mounted.current && abort.current === controller) setChecking(false)
    }
  }, [client, enabled])

  useEffect(() => {
    if (!client || !enabled) return

    let cancelled = false
    failures.current = 0

    const tick = async () => {
      if (cancelled) return
      await refresh()
      if (cancelled) return
      const delay = Math.min(
        MAX_BACKOFF_MS,
        POLL_INTERVAL_MS * 2 ** Math.min(failures.current, 3),
      )
      timer.current = setTimeout(() => void tick(), delay)
    }

    void tick()

    return () => {
      cancelled = true
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
      abort.current?.abort()
    }
  }, [client, enabled, refresh])

  // Disabled means "no connection": stale state is derived away, not reset in an
  // effect, so switching transports cannot trigger an extra render.
  const active = Boolean(client) && enabled
  return {
    state: active ? state : null,
    error: active ? error : null,
    refresh,
    checking: active && checking,
  }
}

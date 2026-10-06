import { useCallback, useEffect, useState } from 'react'
import type { GreenApiCredentials } from '../api/types'

export const CREDENTIALS_STORAGE_KEY = 'max-prototype:credentials'

export interface StoredCredentials extends GreenApiCredentials {
  demoMode: boolean
}

const DEFAULTS: StoredCredentials = {
  apiUrl: '',
  idInstance: '',
  apiTokenInstance: '',
  demoMode: false,
}

function sanitize(raw: unknown): StoredCredentials {
  if (!raw || typeof raw !== 'object') return DEFAULTS
  const value = raw as Partial<Record<keyof StoredCredentials, unknown>>
  const asString = (input: unknown): string => (typeof input === 'string' ? input : '')
  return {
    apiUrl: asString(value.apiUrl),
    idInstance: asString(value.idInstance),
    apiTokenInstance: asString(value.apiTokenInstance),
    demoMode: value.demoMode === true,
  }
}

/** localStorage can throw (private mode, disabled storage) — never let it crash. */
function readStorage(): StoredCredentials {
  return applyEnvPrefill(readStoredCredentials())
}

/** What localStorage actually holds, with env defaults as the fallback. */
function readStoredCredentials(): StoredCredentials {
  try {
    const raw = window.localStorage.getItem(CREDENTIALS_STORAGE_KEY)
    if (!raw) return DEFAULTS
    return sanitize(JSON.parse(raw))
  } catch {
    return DEFAULTS
  }
}

/**
 * `.env.local` values are *defaults for empty fields only*.
 *
 * Precedence: stored localStorage value → `VITE_*` env var → `''` / `false`.
 * A value the user typed (and therefore already stored) always wins, so a
 * leftover env file can never silently redirect a working instance.
 */
function applyEnvPrefill(stored: StoredCredentials): StoredCredentials {
  const env = sanitize({
    apiUrl: import.meta.env.VITE_GREEN_API_URL,
    idInstance: import.meta.env.VITE_GREEN_API_ID_INSTANCE,
    apiTokenInstance: import.meta.env.VITE_GREEN_API_TOKEN_INSTANCE,
    // `sanitize` only accepts a real boolean, while env vars are always
    // strings — the flag has to be parsed before it is sanitized.
    demoMode: readEnvFlag(import.meta.env.VITE_DEMO_MODE),
  })
  return {
    apiUrl: stored.apiUrl !== '' ? stored.apiUrl : env.apiUrl,
    idInstance: stored.idInstance !== '' ? stored.idInstance : env.idInstance,
    apiTokenInstance:
      stored.apiTokenInstance !== '' ? stored.apiTokenInstance : env.apiTokenInstance,
    // `false` is the empty value of a boolean, so an explicit VITE_DEMO_MODE=true
    // still starts a fresh install in demo mode.
    demoMode: stored.demoMode || env.demoMode,
  }
}

function readEnvFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true'
  return false
}

function writeStorage(value: StoredCredentials): void {
  try {
    window.localStorage.setItem(CREDENTIALS_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Persistence is best-effort: the in-memory state still works.
  }
}

export interface UseCredentialsResult {
  credentials: StoredCredentials
  /** False until the localStorage hydration finished. */
  hydrated: boolean
  hasCredentials: boolean
  save: (next: GreenApiCredentials & { demoMode?: boolean }) => void
  clear: () => void
  setDemoMode: (demoMode: boolean) => void
}

export function useCredentials(): UseCredentialsResult {
  const [credentials, setCredentials] = useState<StoredCredentials>(DEFAULTS)
  const [hydrated, setHydrated] = useState(false)

  // localStorage is an external system: it must be read after mount, not during
  // render. The cascading render is the price of a crash-safe hydration.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    setCredentials(readStorage())
    setHydrated(true)
  }, [])

  const save = useCallback((next: GreenApiCredentials & { demoMode?: boolean }) => {
    const value: StoredCredentials = {
      apiUrl: next.apiUrl.trim(),
      idInstance: next.idInstance.trim(),
      apiTokenInstance: next.apiTokenInstance.trim(),
      demoMode: next.demoMode ?? false,
    }
    setCredentials(value)
    writeStorage(value)
  }, [])

  const clear = useCallback(() => {
    setCredentials(DEFAULTS)
    try {
      window.localStorage.removeItem(CREDENTIALS_STORAGE_KEY)
    } catch {
      // ignore
    }
  }, [])

  const setDemoMode = useCallback((demoMode: boolean) => {
    setCredentials((current) => {
      const value = { ...current, demoMode }
      writeStorage(value)
      return value
    })
  }, [])

  const hasCredentials =
    credentials.demoMode ||
    (credentials.idInstance !== '' && credentials.apiTokenInstance !== '')

  return { credentials, hydrated, hasCredentials, save, clear, setDemoMode }
}

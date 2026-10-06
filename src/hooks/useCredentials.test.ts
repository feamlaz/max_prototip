import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CREDENTIALS_STORAGE_KEY, useCredentials } from './useCredentials'

const ENV = {
  url: 'VITE_GREEN_API_URL',
  id: 'VITE_GREEN_API_ID_INSTANCE',
  token: 'VITE_GREEN_API_TOKEN_INSTANCE',
  demo: 'VITE_DEMO_MODE',
}

function stored(overrides: Record<string, unknown> = {}): void {
  window.localStorage.setItem(
    CREDENTIALS_STORAGE_KEY,
    JSON.stringify({
      apiUrl: '',
      idInstance: '',
      apiTokenInstance: '',
      demoMode: false,
      ...overrides,
    }),
  )
}

describe('useCredentials env prefill', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('falls back to the VITE_* variables when localStorage is empty', () => {
    vi.stubEnv(ENV.url, 'https://api.green-api.com')
    vi.stubEnv(ENV.id, '1101122334')
    vi.stubEnv(ENV.token, 'env-token')
    vi.stubEnv(ENV.demo, 'true')

    const { result } = renderHook(() => useCredentials())

    expect(result.current.credentials).toEqual({
      apiUrl: 'https://api.green-api.com',
      idInstance: '1101122334',
      apiTokenInstance: 'env-token',
      demoMode: true,
    })
    expect(result.current.hasCredentials).toBe(true)
  })

  it('keeps empty values when no env variable is set', () => {
    const { result } = renderHook(() => useCredentials())

    expect(result.current.credentials).toEqual({
      apiUrl: '',
      idInstance: '',
      apiTokenInstance: '',
      demoMode: false,
    })
  })

  it('lets the stored value win over the env variable', () => {
    vi.stubEnv(ENV.url, 'https://api.green-api.com')
    vi.stubEnv(ENV.id, '1101122334')
    vi.stubEnv(ENV.token, 'env-token')
    vi.stubEnv(ENV.demo, 'true')
    stored({
      apiUrl: 'https://3100.api.green-api.com',
      idInstance: '9999999999',
      apiTokenInstance: 'stored-token',
    })

    const { result } = renderHook(() => useCredentials())

    expect(result.current.credentials).toEqual({
      apiUrl: 'https://3100.api.green-api.com',
      idInstance: '9999999999',
      apiTokenInstance: 'stored-token',
      demoMode: true,
    })
  })

  it('fills only the fields the user left empty', () => {
    vi.stubEnv(ENV.url, 'https://api.green-api.com')
    vi.stubEnv(ENV.id, '1101122334')
    vi.stubEnv(ENV.token, 'env-token')
    stored({ apiUrl: 'https://3100.api.green-api.com' })

    const { result } = renderHook(() => useCredentials())

    expect(result.current.credentials).toEqual({
      apiUrl: 'https://3100.api.green-api.com',
      idInstance: '1101122334',
      apiTokenInstance: 'env-token',
      demoMode: false,
    })
  })

  it('sanitizes a malformed stored record instead of crashing', () => {
    vi.stubEnv(ENV.id, '1101122334')
    window.localStorage.setItem(CREDENTIALS_STORAGE_KEY, '{not json')

    const { result } = renderHook(() => useCredentials())

    expect(result.current.credentials.idInstance).toBe('1101122334')
    expect(result.current.credentials.apiUrl).toBe('')
  })

  it('saves what the user typed, so a later env change cannot override it', () => {
    vi.stubEnv(ENV.token, 'env-token')
    const { result } = renderHook(() => useCredentials())

    act(() => {
      result.current.save({ apiUrl: '', idInstance: '42', apiTokenInstance: 'typed' })
    })

    expect(window.localStorage.getItem(CREDENTIALS_STORAGE_KEY)).toContain('typed')
    expect(result.current.credentials.apiTokenInstance).toBe('typed')
  })
})
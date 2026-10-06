import { useMemo } from 'react'
import { GreenApiClient } from '../api/client'
import type { GreenApiLike } from '../api/interface'
import { DemoGreenApiClient } from '../demo/demoClient'
import type { StoredCredentials } from './useCredentials'

/**
 * Picks the transport: the in-memory demo fake in demo mode, otherwise a real
 * GREEN-API HTTP client. Returns null while there is nothing to connect with.
 */
export function useApiClient(
  credentials: StoredCredentials,
  enabled = true,
): GreenApiLike | null {
  return useMemo(() => {
    if (!enabled) return null
    if (credentials.demoMode) return new DemoGreenApiClient()
    if (credentials.idInstance === '' || credentials.apiTokenInstance === '') return null
    return new GreenApiClient({
      apiUrl: credentials.apiUrl,
      idInstance: credentials.idInstance,
      apiTokenInstance: credentials.apiTokenInstance,
    })
  }, [
    enabled,
    credentials.demoMode,
    credentials.apiUrl,
    credentials.idInstance,
    credentials.apiTokenInstance,
  ])
}

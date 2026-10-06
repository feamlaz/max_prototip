/// <reference types="vite/client" />

/**
 * `VITE_*` variables are inlined into the bundle at build time, so they are the
 * only way to ship defaults without a server. They prefill empty credential
 * fields — see `applyEnvPrefill` in `src/hooks/useCredentials.ts`.
 */
interface ImportMetaEnv {
  readonly VITE_GREEN_API_URL?: string
  readonly VITE_GREEN_API_ID_INSTANCE?: string
  readonly VITE_GREEN_API_TOKEN_INSTANCE?: string
  readonly VITE_DEMO_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
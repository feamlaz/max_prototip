/** Small pill with the long-poll state and the instance state label. */
import type { InstanceState } from '../api/types'
import { instanceStateLabel } from './format'
import './StatusBar.css'

const ERROR_LIMIT = 48

export interface StatusBarProps {
  running: boolean
  error: string | null
  state: InstanceState | null
}

export function StatusBar({ running, error, state }: StatusBarProps) {
  const failed = error !== null
  const text = failed
    ? error.length > ERROR_LIMIT
      ? `${error.slice(0, ERROR_LIMIT)}…`
      : error
    : running
      ? 'Подключено'
      : 'Подключение…'

  return (
    <div className="status" role="status" aria-live="polite">
      <span
        className={`status__dot${failed ? ' status__dot--error' : running ? ' status__dot--ok' : ''}`}
        aria-hidden="true"
      />
      <span className="status__text" title={error ?? undefined}>
        {text}
      </span>
      {state !== null && <span className="status__state">{instanceStateLabel(state)}</span>}
    </div>
  )
}
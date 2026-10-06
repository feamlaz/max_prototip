import type { InstanceState } from '../api/types'
import { AlertIcon, RefreshIcon } from './icons'
import './ui.css'
import './InstanceStateBanner.css'

interface BannerCopy {
  title: string
  hint: string
  tone: 'warn' | 'info' | 'danger'
}

const COPY: Record<InstanceState, BannerCopy> = {
  notAuthorized: {
    title: 'Инстанс не авторизован',
    hint: 'Откройте GREEN-API, отсканируйте QR-код в приложении MAX и дождитесь статуса «Авторизован».',
    tone: 'warn',
  },
  pendingPassword: {
    title: 'Инстанс не авторизован',
    hint: 'MAX ждёт подтверждение входа: введите код из приложения в консоли GREEN-API.',
    tone: 'warn',
  },
  starting: {
    title: 'Инцидент запускается…',
    hint: 'Обычно это занимает до минуты. Можно продолжить — чат обновится автоматически.',
    tone: 'info',
  },
  blocked: {
    title: 'Аккаунт заблокирован',
    hint: 'Аккаунт MAX заблокирован. Свяжитесь с поддержкой GREEN-API.',
    tone: 'danger',
  },
  suspended: {
    title: 'Аккаунт приостановлен',
    hint: 'Доступ инстанса временно ограничен — проверьте статус в консоли GREEN-API.',
    tone: 'danger',
  },
  authorized: {
    title: 'Инстанс авторизован',
    hint: '',
    tone: 'info',
  },
}

export interface InstanceStateBannerProps {
  state: InstanceState | null
  checking: boolean
  onRetry: () => void
  onOpenSettings: () => void
}

/** Shown when GREEN-API reports a state this build has no copy for. */
const UNKNOWN_STATE_COPY: BannerCopy = {
  title: 'Неизвестное состояние инстанса',
  hint: 'GREEN-API вернул состояние, которого нет в этой сборке прототипа. Проверьте статус инстанса в кабинете.',
  tone: 'warn',
}

/**
 * `stateInstance` is an unvalidated string on the wire, so GREEN-API can add a
 * state before this build knows about it. The lookup is guarded instead of
 * trusted: an unmapped value degrades to a generic banner instead of crashing
 * on `copy.tone` and white-screening the app.
 */
function copyFor(state: InstanceState): BannerCopy {
  return Object.hasOwn(COPY, state) ? COPY[state] : UNKNOWN_STATE_COPY
}

export function InstanceStateBanner({
  state,
  checking,
  onRetry,
  onOpenSettings,
}: InstanceStateBannerProps) {
  if (state === null || state === 'authorized') return null
  const copy = copyFor(state)

  return (
    <div
      className={`banner banner--${copy.tone}`}
      role="status"
      aria-live="polite"
    >
      <AlertIcon className="banner__icon" />
      <div className="banner__body">
        <p className="banner__title">{copy.title}</p>
        <p className="banner__hint">{copy.hint}</p>
      </div>
      <div className="banner__actions">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={onRetry}
          disabled={checking}
        >
          {checking ? <span className="spinner" aria-hidden="true" /> : <RefreshIcon />}
          Повторить
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onOpenSettings}>
          Настройки
        </button>
      </div>
    </div>
  )
}
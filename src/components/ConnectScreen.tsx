/**
 * First screen: collect the GREEN-API instance credentials.
 *
 * Controlled form — `App` owns the single `useCredentials()` instance, so the
 * draft values and the stored credentials can never drift apart. The instance
 * check itself also lives in App (`useInstanceState`); its `error`/`checking`
 * flags arrive as props so there is only one polling loop.
 */
import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import type { StoredCredentials } from '../hooks/useCredentials'
import { AlertIcon, EyeIcon, EyeOffIcon } from './icons'
import './ui.css'
import './ConnectScreen.css'

const CONSOLE_URL = 'https://console.green-api.com'

/** Shown next to `apiUrl` when the host is not part of green-api.com. */
export const FOREIGN_API_URL_WARNING =
  'Этот адрес не похож на официальный GREEN-API. Токен инстанса будет отправлен на него — проверьте адрес перед подключением.'

/**
 * GREEN-API auth lives in the URL path (`{apiUrl}/waInstance{id}/{token}`), so
 * whatever host the user types receives the instance token. A browser-only tool
 * cannot prevent that, but it can say so out loud. The check only warns:
 * self-hosted gateways are a legitimate setup and must keep working.
 */
function isOfficialGreenApiHost(raw: string): boolean {
  const candidate = raw.trim()
  // An empty field falls back to DEFAULT_API_URL inside the client — official.
  if (candidate === '') return true
  try {
    // A bare host is accepted by the client (it prepends https://), so the
    // warning has to look at the same normalized value.
    const url = new URL(
      /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`,
    )
    const host = url.hostname.toLowerCase()
    return host === 'green-api.com' || host.endsWith('.green-api.com')
  } catch {
    // Unparsable means the user is mid-typing — warn instead of throwing.
    return false
  }
}

export interface ConnectCredentialsInput {
  apiUrl: string
  idInstance: string
  apiTokenInstance: string
  demoMode: boolean
}

export interface ConnectScreenProps {
  credentials: StoredCredentials
  /** `useInstanceState().error` — already a Russian hint. */
  error: string | null
  checking: boolean
  onSave: (next: ConnectCredentialsInput) => void
  onSetDemoMode: (demoMode: boolean) => void
  onRetry?: () => void
}

export function ConnectScreen({
  credentials,
  error,
  checking,
  onSave,
  onSetDemoMode,
  onRetry,
}: ConnectScreenProps) {
  const urlId = useId()
  const idId = useId()
  const tokenId = useId()
  const demoId = useId()
  const urlWarningId = useId()

  const [apiUrl, setApiUrl] = useState(credentials.apiUrl)
  const [idInstance, setIdInstance] = useState(credentials.idInstance)
  const [token, setToken] = useState(credentials.apiTokenInstance)
  const [demoMode, setDemo] = useState(credentials.demoMode)
  const [tokenVisible, setTokenVisible] = useState(false)
  const foreignApiUrl = !isOfficialGreenApiHost(apiUrl)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSave({ apiUrl, idInstance, apiTokenInstance: token, demoMode })
  }

  return (
    <div className="connect">
      <section className="connect__card" aria-labelledby="connect-heading">
        <header className="connect__brand">
          <span className="brand-mark" aria-hidden="true">
            <span className="brand-mark__glyph">M</span>
          </span>
          <div className="connect__title">
            <span className="brand-word">MAX</span>
            <span className="connect__subtitle">Прототип мессенджера</span>
          </div>
        </header>

        <div>
          <h1 className="connect__heading" id="connect-heading">
            Подключение к GREEN-API
          </h1>
          <p className="connect__subtitle">
            Укажите параметры инстанса, чтобы открыть чат MAX.
          </p>
        </div>

        {error !== null && error !== '' && (
          <div className="alert" role="alert">
            <AlertIcon />
            <span>{error}</span>
          </div>
        )}

        <form className="connect__form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label className="field__label" htmlFor={urlId}>
              Адрес API
            </label>
            <input
              id={urlId}
              className="input"
              name="apiUrl"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://3100.api.green-api.com/"
              aria-describedby={foreignApiUrl ? urlWarningId : undefined}
              value={apiUrl}
              onChange={(event) => setApiUrl(event.target.value)}
            />
            {foreignApiUrl && (
              <p className="field__warning" id={urlWarningId} role="note">
                {FOREIGN_API_URL_WARNING}
              </p>
            )}
          </div>

          <div className="field">
            <label className="field__label" htmlFor={idId}>
              idInstance
            </label>
            <input
              id={idId}
              className="input input--digits"
              name="idInstance"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="1101123456"
              value={idInstance}
              onChange={(event) => setIdInstance(event.target.value.replace(/\D/g, ''))}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor={tokenId}>
              Токен инстанса
            </label>
            <div className="input-wrap">
              <input
                id={tokenId}
                className="input"
                name="apiTokenInstance"
                type={tokenVisible ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                placeholder="d1b4f9e8c7a6543210fedcba9876543210fedcba"
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
              <button
                type="button"
                className="input-wrap__btn"
                aria-label={tokenVisible ? 'Скрыть токен' : 'Показать токен'}
                aria-pressed={tokenVisible}
                onClick={() => setTokenVisible((visible) => !visible)}
              >
                {tokenVisible ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <div className="connect__row">
            <label className="switch" htmlFor={demoId}>
              <input
                id={demoId}
                className="switch__input"
                type="checkbox"
                role="switch"
                checked={demoMode}
                onChange={(event) => setDemo(event.target.checked)}
              />
              <span className="switch__track" aria-hidden="true">
                <span className="switch__thumb" />
              </span>
              <span className="switch__label">Демо-режим</span>
            </label>

            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => onSetDemoMode(true)}
            >
              Посмотреть демо
            </button>
          </div>

          <button type="submit" className="btn btn--primary btn--block" disabled={checking}>
            {checking && <span className="spinner" aria-hidden="true" />}
            {checking ? 'Проверяем подключение…' : 'Подключить'}
          </button>

          {onRetry && (
            <button type="button" className="btn btn--ghost btn--block" onClick={onRetry}>
              Проверить ещё раз
            </button>
          )}
        </form>

        <div className="connect__help">
          <span>
            <strong>Где взять данные:</strong>{' '}
            <a
              className="connect__link"
              href={CONSOLE_URL}
              target="_blank"
              rel="noreferrer noopener"
            >
              console.green-api.com
            </a>{' '}
            — настройки инстанса.
          </span>
          <span>
            <strong>webhookUrl</strong> должен быть пустым: прототип использует
            HTTP-поллинг, а не вебхуки.
          </span>
          <span>Номер собеседника — российский или белорусский: 11–12 цифр.</span>
        </div>
      </section>
    </div>
  )
}
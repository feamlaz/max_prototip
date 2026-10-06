/**
 * Right-side settings panel (bottom sheet on mobile): edit the instance
 * credentials, toggle demo mode, re-check the connection or wipe the data.
 *
 * Mount it with a `key` that changes when `open` or the stored credentials
 * change — the draft is initialized from `credentials` instead of being
 * re-synced from an effect.
 */
import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { InstanceState } from '../api/types'
import type { StoredCredentials } from '../hooks/useCredentials'
import { instanceStateLabel } from './format'
import { AlertIcon, CloseIcon, EyeIcon, EyeOffIcon, RefreshIcon } from './icons'
import './ui.css'
import './SettingsSheet.css'

const CONSOLE_URL = 'https://console.green-api.com'
const DOCS_URL = 'https://green-api.com/en/docs/'

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'

export interface SettingsSheetProps {
  open: boolean
  credentials: StoredCredentials
  instanceState: InstanceState | null
  checking: boolean
  onClose: () => void
  onSave: (next: {
    apiUrl: string
    idInstance: string
    apiTokenInstance: string
    demoMode: boolean
  }) => void
  onSetDemoMode: (demoMode: boolean) => void
  onCheck: () => void
  onClear: () => void
}

export function SettingsSheet({
  open,
  credentials,
  instanceState,
  checking,
  onClose,
  onSave,
  onSetDemoMode,
  onCheck,
  onClear,
}: SettingsSheetProps) {
  const urlId = useId()
  const idId = useId()
  const tokenId = useId()
  const demoId = useId()
  const panel = useRef<HTMLDivElement>(null)

  const [apiUrl, setApiUrl] = useState(credentials.apiUrl)
  const [idInstance, setIdInstance] = useState(credentials.idInstance)
  const [token, setToken] = useState(credentials.apiTokenInstance)
  const [demoMode, setDemo] = useState(credentials.demoMode)
  const [tokenVisible, setTokenVisible] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // Focus the panel and close on Escape; Tab is trapped inside the dialog.
  useEffect(() => {
    if (!open) return
    const element = panel.current
    if (!element) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element.focus()

    function handleKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !element) return
      // Minimal focus trap so Tab never escapes an aria-modal dialog.
      const focusable = Array.from(element.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      // Give the focus back to whatever opened the dialog.
      if (trigger !== null && trigger.isConnected) trigger.focus()
    }
  }, [open, onClose])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSave({ apiUrl, idInstance, apiTokenInstance: token, demoMode })
    setConfirming(false)
  }

  if (!open) return null

  return (
    <div className="sheet">
      <div className="sheet__backdrop" onClick={onClose} aria-hidden="true" />

      <div
        className="sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-heading"
        tabIndex={-1}
        ref={panel}
      >
        <header className="sheet__header">
          <h2 className="sheet__heading" id="sheet-heading">
            Настройки
          </h2>
          <button type="button" className="icon-btn" aria-label="Закрыть настройки" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <form className="sheet__body" onSubmit={handleSubmit} noValidate>
          <p className="sheet__state">
            Состояние инстанса: <strong>{instanceStateLabel(instanceState)}</strong>
          </p>

          <div className="field">
            <label className="field__label" htmlFor={urlId}>
              Адрес API
            </label>
            <input
              id={urlId}
              className="input"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://3100.api.green-api.com/"
              value={apiUrl}
              onChange={(event) => setApiUrl(event.target.value)}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor={idId}>
              idInstance
            </label>
            <input
              id={idId}
              className="input input--digits"
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
                type={tokenVisible ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
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

          <label className="switch" htmlFor={demoId}>
            <input
              id={demoId}
              className="switch__input"
              type="checkbox"
              role="switch"
              checked={demoMode}
              onChange={(event) => {
                setDemo(event.target.checked)
                onSetDemoMode(event.target.checked)
              }}
            />
            <span className="switch__track" aria-hidden="true">
              <span className="switch__thumb" />
            </span>
            <span className="switch__label">Демо-режим без учётных данных</span>
          </label>

          <div className="sheet__actions">
            <button type="submit" className="btn btn--primary btn--block">
              Сохранить и переподключиться
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--block"
              onClick={onCheck}
              disabled={checking}
            >
              {checking ? <span className="spinner" aria-hidden="true" /> : <RefreshIcon />}
              Проверить подключение
            </button>

            {confirming ? (
              <div className="alert" role="alert">
                <AlertIcon />
                <span>Удалить адрес, idInstance и токен из этого браузера?</span>
              </div>
            ) : null}

            <div className="sheet__row">
              {confirming ? (
                <>
                  <button
                    type="button"
                    className="btn btn--danger btn--sm"
                    onClick={() => {
                      setConfirming(false)
                      onClear()
                    }}
                  >
                    Да, очистить
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => setConfirming(false)}
                  >
                    Отмена
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setConfirming(true)}
                >
                  Очистить данные
                </button>
              )}
            </div>
          </div>

          <nav className="sheet__links" aria-label="Ссылки GREEN-API">
            <a href={CONSOLE_URL} target="_blank" rel="noreferrer noopener">
              Консоль GREEN-API
            </a>
            <a href={DOCS_URL} target="_blank" rel="noreferrer noopener">
              Документация API
            </a>
          </nav>
        </form>
      </div>
    </div>
  )
}
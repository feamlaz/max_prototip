/**
 * Shown while connected but no chat is open yet: pick the peer number and open
 * the chat through `checkAccount`.
 */
import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { AlertIcon, GearIcon, SendIcon } from './icons'
import './ui.css'
import './StartChatCard.css'

const MIN_DIGITS = 11
const MAX_DIGITS = 12

export interface StartChatCardProps {
  demoMode: boolean
  busy: boolean
  error: string | null
  onOpen: (phone: string) => void
  onOpenSettings: () => void
}

export function StartChatCard({
  demoMode,
  busy,
  error,
  onOpen,
  onOpenSettings,
}: StartChatCardProps) {
  const phoneId = useId()
  const [phone, setPhone] = useState('')
  const digits = phone.replace(/\D/g, '')
  const valid = digits.length >= MIN_DIGITS && digits.length <= MAX_DIGITS

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!valid || busy) return
    onOpen(digits)
  }

  return (
    <div className="start">
      <section className="start__card" aria-labelledby="start-heading">
        <header className="start__header">
          <h1 className="start__heading" id="start-heading">
            Начать чат
          </h1>
          <button
            type="button"
            className="icon-btn"
            aria-label="Настройки"
            onClick={onOpenSettings}
          >
            <GearIcon />
          </button>
        </header>

        <p className="start__subtitle">
          Введите номер собеседника в MAX, чтобы открыть переписку.
        </p>

        {demoMode && (
          <p className="start__hint">
            Демо-режим: ответ придёт автоматически — реальный GREEN-API не нужен.
          </p>
        )}

        {error !== null && error !== '' && (
          <div className="alert" role="alert">
            <AlertIcon />
            <span>{error}</span>
          </div>
        )}

        <form className="start__form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label className="field__label" htmlFor={phoneId}>
              Номер телефона
            </label>
            <input
              id={phoneId}
              className="input input--digits"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="79991234567"
              aria-describedby={`${phoneId}-hint`}
              aria-invalid={digits !== '' && !valid}
              value={phone}
              onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))}
            />
            <span className="field__hint" id={`${phoneId}-hint`}>
              {valid
                ? 'Номер из 11–12 цифр, без плюса и пробелов.'
                : 'Только цифры: 11–12 символов (Россия или Беларусь).'}
            </span>
          </div>

          <button type="submit" className="btn btn--primary btn--block" disabled={!valid || busy}>
            {busy ? <span className="spinner" aria-hidden="true" /> : <SendIcon />}
            {busy ? 'Открываем чат…' : 'Открыть чат'}
          </button>
        </form>
      </section>
    </div>
  )
}
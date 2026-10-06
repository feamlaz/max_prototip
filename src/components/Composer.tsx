/**
 * Auto-growing composer. GREEN-API rejects messages longer than 4000
 * characters, so the limit is enforced here instead of failing server-side.
 */
import { useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent } from 'react'
import { SendIcon } from './icons'
import './ui.css'
import './Composer.css'

const MAX_LENGTH = 4000
const COUNTER_FROM = 3800
const MAX_HEIGHT_PX = 132

export interface ComposerProps {
  onSend: (text: string) => void
  disabled?: boolean
}

export function Composer({ onSend, disabled = false }: ComposerProps) {
  const [value, setValue] = useState('')
  const textarea = useRef<HTMLTextAreaElement>(null)
  const hintId = useId()

  const tooLong = value.length > MAX_LENGTH
  const sendable = value.trim() !== '' && !tooLong && !disabled

  useEffect(() => {
    const element = textarea.current
    if (!element) return
    element.style.height = 'auto'
    const next = Math.min(element.scrollHeight, MAX_HEIGHT_PX)
    // jsdom reports scrollHeight = 0, so keep the CSS height there.
    element.style.height = next > 0 ? `${next}px` : ''
  }, [value])

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setValue(event.target.value)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return
    // Do not steal the Enter key while an IME composition is active.
    if (event.nativeEvent.isComposing) return
    event.preventDefault()
    submit()
  }

  function submit() {
    if (!sendable) return
    const text = value.trim()
    setValue('')
    onSend(text)
  }

  const showCounter = value.length >= COUNTER_FROM

  return (
    <div className="composer">
      <label className="sr-only" htmlFor="composer-input">
        Сообщение
      </label>
      <div className="composer__box">
        <textarea
          id="composer-input"
          ref={textarea}
          className="composer__input"
          rows={1}
          placeholder="Напишите сообщение…"
          value={value}
          disabled={disabled}
          aria-describedby={tooLong ? hintId : undefined}
          aria-invalid={tooLong}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />

        <div className="composer__side">
          {showCounter && (
            <span
              className={`composer__counter${tooLong ? ' composer__counter--over' : ''}`}
              aria-hidden={!tooLong}
            >
              {value.length}/{MAX_LENGTH}
            </span>
          )}
          <button
            type="button"
            className="composer__send"
            aria-label="Отправить сообщение"
            disabled={!sendable}
            onClick={submit}
          >
            <SendIcon />
          </button>
        </div>
      </div>

      {tooLong && (
        <p className="composer__hint" id={hintId} role="alert">
          Сообщение длиннее 4000 символов — GREEN-API не примет его. Сократите текст.
        </p>
      )}
    </div>
  )
}
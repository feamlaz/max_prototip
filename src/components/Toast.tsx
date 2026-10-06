/** Dismissible error toast with a ~6s auto-dismiss. */
import { useEffect } from 'react'
import { CloseIcon } from './icons'
import './Toast.css'

export interface ToastProps {
  message: string | null
  onDismiss: () => void
  durationMs?: number
}

export function Toast({ message, onDismiss, durationMs = 6000 }: ToastProps) {
  useEffect(() => {
    if (message === null) return
    const timer = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(timer)
  }, [message, durationMs, onDismiss])

  if (message === null) return null

  return (
    <div className="toast" role="alert" aria-live="assertive">
      <span className="toast__text">{message}</span>
      <button
        type="button"
        className="toast__close"
        aria-label="Закрыть уведомление"
        onClick={onDismiss}
      >
        <CloseIcon />
      </button>
    </div>
  )
}
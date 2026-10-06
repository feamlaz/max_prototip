/**
 * Chat header: peer identity (hue derived from a deterministic string hash) and
 * the live connection status.
 */
import type { CSSProperties } from 'react'
import { avatarHue, initials } from './format'
import { ExitIcon, GearIcon } from './icons'
import './ChatHeader.css'

export interface ChatHeaderProps {
  peerName: string | null
  peerPhone: string | null
  /** 'online' — polling loop is live, 'reconnecting' — retrying, 'offline' — error. */
  connection: 'online' | 'reconnecting' | 'offline'
  checking: boolean
  onOpenSettings: () => void
  onExit: () => void
}

const CONNECTION_LABEL = {
  online: 'Подключено',
  reconnecting: 'Переподключение…',
  offline: 'Нет связи',
} as const

export function ChatHeader({
  peerName,
  peerPhone,
  connection,
  checking,
  onOpenSettings,
  onExit,
}: ChatHeaderProps) {
  const source = peerName ?? peerPhone ?? 'Чат'
  const hue = avatarHue(peerName ?? peerPhone ?? '')
  const label = initials(peerName ?? peerPhone)

  return (
    <header className="chat-header">
      <span
        className={`chat-header__avatar${checking ? ' chat-header__avatar--pulse' : ''}`}
        style={{ '--avatar-hue': hue } as CSSProperties}
        aria-hidden="true"
      >
        {label}
      </span>

      <div className="chat-header__body">
        <h1 className="chat-header__name">{source}</h1>
        <p className="chat-header__status">
          <span
            className={`chat-header__dot chat-header__dot--${connection}`}
            aria-hidden="true"
          />
          {CONNECTION_LABEL[connection]}
          {peerPhone !== null && peerName !== null && (
            <span className="chat-header__phone"> · {peerPhone}</span>
          )}
        </p>
      </div>

      <div className="chat-header__actions">
        <button
          type="button"
          className="icon-btn"
          aria-label="Настройки"
          onClick={onOpenSettings}
        >
          <GearIcon />
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onExit}>
          <ExitIcon />
          Выйти
        </button>
      </div>
    </header>
  )
}
/**
 * One message bubble. Consecutive same-direction bubbles are rendered as a
 * stacked group: `first`/`last` only affect the corner radii and the tail.
 */
import { formatTime, toMillis } from './format'
import type { MessageStatus } from '../store/types'
import './MessageList.css'

const STATUS_LABEL: Record<MessageStatus, string> = {
  pending: 'Отправляется',
  sent: 'Отправлено',
  delivered: 'Доставлено',
  read: 'Прочитано',
  failed: 'Не доставлено',
}

function StatusTick({ status }: { status: MessageStatus }) {
  if (status === 'pending') {
    return (
      <span className="tick tick--pending" role="img" aria-label={STATUS_LABEL[status]}>
        <span className="tick__dot" aria-hidden="true" />
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span
        className="tick tick--failed"
        role="img"
        aria-label={STATUS_LABEL[status]}
        title="Не доставлено"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 3.6 1.8 21h20.4L12 3.6Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M12 10v4.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M12 17.4h.01" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
    )
  }
  const doubles = status === 'delivered' || status === 'read'
  return (
    <span
      className={`tick tick--${status}`}
      role="img"
      aria-label={STATUS_LABEL[status]}
    >
      <svg viewBox="0 0 20 12" aria-hidden="true" focusable="false">
        <path
          className="tick__mark"
          d="M1 6.4 4.6 10 11 3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {doubles && (
          <path
            className="tick__mark"
            d="M7.4 6.4 11 10 17.4 3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </span>
  )
}

export interface MessageBubbleProps {
  message: {
    direction: 'in' | 'out'
    text: string
    timestamp: number
    status: MessageStatus
    isEdited?: boolean
  }
  first: boolean
  last: boolean
}

export function MessageBubble({ message, first, last }: MessageBubbleProps) {
  const outgoing = message.direction === 'out'
  const classes = ['bubble', outgoing ? 'bubble--out' : 'bubble--in']
  if (first) classes.push('bubble--first')
  if (last) classes.push('bubble--last')
  const millis = toMillis(message.timestamp)
  const iso = Number.isFinite(millis) && millis > 0 ? new Date(millis).toISOString() : undefined

  return (
    <div className={classes.join(' ')} data-direction={message.direction}>
      <span className="bubble__text">{message.text}</span>
      <span className="bubble__meta">
        {message.isEdited === true && <span className="bubble__edited">изменено</span>}
        <time className="bubble__time" dateTime={iso}>
          {formatTime(message.timestamp)}
        </time>
        {outgoing && <StatusTick status={message.status} />}
      </span>
    </div>
  )
}
/**
 * Scrollable message log: date dividers, stacked bubble groups, auto-scroll.
 */
import { useEffect, useRef } from 'react'
import type { ChatMessage } from '../store/types'
import { buildMessageRows } from './format'
import { MessageBubble } from './MessageBubble'
import './MessageList.css'

export interface MessageListProps {
  messages: ChatMessage[]
}

export function MessageList({ messages }: MessageListProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const rows = buildMessageRows(messages)
  const count = messages.length

  // Auto-scroll on mount and whenever a message is appended. `auto` keeps it
  // instant under prefers-reduced-motion.
  useEffect(() => {
    const element = scroller.current
    if (!element) return
    element.scrollTop = element.scrollHeight
  }, [count])

  return (
    <div className="messages" ref={scroller} role="log" aria-live="polite" aria-label="Сообщения">
      {count === 0 ? (
        <div className="messages__empty">
          <span className="messages__blob" aria-hidden="true" />
          <p className="messages__empty-text">Здесь появятся сообщения</p>
        </div>
      ) : (
        rows.map((row) =>
          row.kind === 'divider' ? (
            <div className="messages__divider" key={row.key}>
              <span>{row.label}</span>
            </div>
          ) : (
            <div className={`messages__group messages__group--${row.direction}`} key={row.key}>
              {row.messages.map((message, index) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  first={index === 0}
                  last={index === row.messages.length - 1}
                />
              ))}
            </div>
          ),
        )
      )}
    </div>
  )
}
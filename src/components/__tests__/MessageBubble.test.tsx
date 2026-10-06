import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MessageBubble } from '../MessageBubble'
import type { MessageStatus } from '../../store/types'

const TIMESTAMP = new Date(2026, 2, 12, 21, 42).getTime()

function renderBubble(
  direction: 'in' | 'out',
  status: MessageStatus = 'read',
) {
  const { container } = render(
    <MessageBubble
      message={{ direction, text: 'Привет', timestamp: TIMESTAMP, status }}
      first
      last
    />,
  )
  return container
}

describe('MessageBubble', () => {
  it('renders an outgoing bubble with the brand treatment and its time', () => {
    const container = renderBubble('out')
    const bubble = container.querySelector('.bubble')
    expect(bubble).not.toBeNull()
    expect(bubble?.className).toContain('bubble--out')
    expect(bubble?.getAttribute('data-direction')).toBe('out')
    expect(screen.getByText('Привет')).toBeInTheDocument()
    expect(screen.getByText('21:42')).toBeInTheDocument()
  })

  it('renders an incoming bubble without a status tick', () => {
    const container = renderBubble('in')
    expect(container.querySelector('.bubble--in')).not.toBeNull()
    expect(container.querySelector('.tick')).toBeNull()
  })

  it.each([
    ['pending', 'Отправляется'],
    ['sent', 'Отправлено'],
    ['delivered', 'Доставлено'],
    ['read', 'Прочитано'],
    ['failed', 'Не доставлено'],
  ] as Array<[MessageStatus, string]>)(
    'labels the %s status tick in Russian',
    (status, label) => {
      renderBubble('out', status)
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    },
  )

  it('marks a failed bubble with the delivery warning', () => {
    renderBubble('out', 'failed')
    const tick = screen.getByLabelText('Не доставлено')
    expect(tick.getAttribute('title')).toBe('Не доставлено')
    expect(tick.className).toContain('tick--failed')
  })

  it('adds the edit marker only when the message was edited', () => {
    const { rerender } = render(
      <MessageBubble
        message={{ direction: 'in', text: 'a', timestamp: TIMESTAMP, status: 'read' }}
        first
        last
      />,
    )
    expect(screen.queryByText('изменено')).toBeNull()

    rerender(
      <MessageBubble
        message={{
          direction: 'in',
          text: 'a',
          timestamp: TIMESTAMP,
          status: 'read',
          isEdited: true,
        }}
        first
        last
      />,
    )
    expect(screen.getByText('изменено')).toBeInTheDocument()
  })
})
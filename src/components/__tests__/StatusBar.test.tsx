import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StatusBar } from '../StatusBar'
import { Toast } from '../Toast'

afterEach(() => {
  vi.useRealTimers()
})

describe('StatusBar', () => {
  it('shows a green dot and «Подключено» while polling', () => {
    const { container } = render(<StatusBar running error={null} state="authorized" />)
    expect(container.querySelector('.status__dot--ok')).not.toBeNull()
    expect(screen.getByText('Подключено')).toBeInTheDocument()
    expect(screen.getByText('Авторизован')).toBeInTheDocument()
  })

  it('switches to a red dot and truncates a long error', () => {
    const error = 'Ошибка шлюза, повторите позже'.repeat(4)
    const { container } = render(<StatusBar running={false} error={error} state={null} />)
    expect(container.querySelector('.status__dot--error')).not.toBeNull()
    const text = screen.getByText(/…/)
    expect(text.textContent).toHaveLength(49)
    expect(text).toHaveAttribute('title', error)
    expect(screen.queryByText('Авторизован')).toBeNull()
  })

  it('renders every instance state label in Russian', () => {
    const { rerender } = render(<StatusBar running error={null} state="starting" />)
    expect(screen.getByText('Запускается')).toBeInTheDocument()

    rerender(<StatusBar running error={null} state="suspended" />)
    expect(screen.getByText('Приостановлен')).toBeInTheDocument()
  })
})

describe('Toast', () => {
  it('renders nothing without a message', () => {
    const { container } = render(<Toast message={null} onDismiss={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the message as an alert and dismisses it on click', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    render(<Toast message="Сообщение не отправлено" onDismiss={onDismiss} />)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Сообщение не отправлено')

    await user.click(screen.getByRole('button', { name: 'Закрыть уведомление' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('auto-dismisses after the timeout', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    render(<Toast message="Ошибка" onDismiss={onDismiss} durationMs={6000} />)

    act(() => {
      vi.advanceTimersByTime(5900)
    })
    expect(onDismiss).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
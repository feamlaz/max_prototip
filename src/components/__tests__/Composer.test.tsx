import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Composer } from '../Composer'

const MAX_LENGTH = 4000

function getTextarea(): HTMLTextAreaElement {
  return screen.getByPlaceholderText('Напишите сообщение…') as HTMLTextAreaElement
}

function type(text: string) {
  fireEvent.change(getTextarea(), { target: { value: text } })
}

describe('Composer', () => {
  it('sends the trimmed text on Enter and clears the field', () => {
    const onSend = vi.fn()
    render(<Composer onSend={onSend} />)

    type('  Привет, MAX  ')
    expect(screen.getByRole('button', { name: 'Отправить сообщение' })).toBeEnabled()

    fireEvent.keyDown(getTextarea(), { key: 'Enter' })

    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onSend).toHaveBeenCalledWith('Привет, MAX')
    expect(getTextarea().value).toBe('')
  })

  it('does not send on Shift+Enter (newline instead)', () => {
    const onSend = vi.fn()
    render(<Composer onSend={onSend} />)

    type('строка')
    fireEvent.keyDown(getTextarea(), { key: 'Enter', shiftKey: true })

    expect(onSend).not.toHaveBeenCalled()
    expect(getTextarea().value).toBe('строка')
  })

  it('does not send whitespace-only text', () => {
    const onSend = vi.fn()
    render(<Composer onSend={onSend} />)

    type('   ')
    fireEvent.keyDown(getTextarea(), { key: 'Enter' })

    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Отправить сообщение' })).toBeDisabled()
  })

  it(`allows exactly ${MAX_LENGTH} characters`, () => {
    const onSend = vi.fn()
    render(<Composer onSend={onSend} />)

    type('x'.repeat(MAX_LENGTH))
    fireEvent.keyDown(getTextarea(), { key: 'Enter' })

    expect(onSend).toHaveBeenCalledWith('x'.repeat(MAX_LENGTH))
  })

  it(`blocks sending above ${MAX_LENGTH} characters and explains why`, () => {
    const onSend = vi.fn()
    render(<Composer onSend={onSend} />)

    type('x'.repeat(MAX_LENGTH + 1))

    expect(screen.getByText(`4001/${MAX_LENGTH}`)).toBeInTheDocument()
    expect(
      screen.getByText(
        'Сообщение длиннее 4000 символов — GREEN-API не примет его. Сократите текст.',
      ),
    ).toBeInTheDocument()
    expect(getTextarea()).toHaveAttribute('aria-invalid', 'true')

    const send = screen.getByRole('button', { name: 'Отправить сообщение' })
    expect(send).toBeDisabled()

    fireEvent.keyDown(getTextarea(), { key: 'Enter' })
    fireEvent.click(send)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('hides the counter below 3800 characters', () => {
    render(<Composer onSend={vi.fn()} />)
    expect(screen.queryByText(/3799|\/4000/)).toBeNull()

    type('x'.repeat(3800))
    expect(screen.getByText(`3800/${MAX_LENGTH}`)).toBeInTheDocument()
  })
})
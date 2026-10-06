import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { StoredCredentials } from '../../hooks/useCredentials'
import { SettingsSheet } from '../SettingsSheet'

const CREDENTIALS: StoredCredentials = {
  apiUrl: 'https://3100.api.green-api.com',
  idInstance: '1101123456',
  apiTokenInstance: 'secret-token',
  demoMode: true,
}

function renderSheet(overrides: Partial<Parameters<typeof SettingsSheet>[0]> = {}) {
  const handlers = {
    onClose: vi.fn(),
    onSave: vi.fn(),
    onSetDemoMode: vi.fn(),
    onCheck: vi.fn(),
    onClear: vi.fn(),
  }
  const utils = render(
    <SettingsSheet
      open
      credentials={CREDENTIALS}
      instanceState="authorized"
      checking={false}
      {...handlers}
      {...overrides}
    />,
  )
  return { ...utils, ...handlers }
}

describe('SettingsSheet', () => {
  it('is an accessible modal dialog seeded with the stored credentials', () => {
    renderSheet()

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('heading', { name: 'Настройки' })).toBeInTheDocument()
    expect(screen.getByLabelText('Адрес API')).toHaveValue('https://3100.api.green-api.com')
    expect(screen.getByLabelText('idInstance')).toHaveValue('1101123456')
    expect(screen.getByLabelText('Токен инстанса')).toHaveValue('secret-token')
    expect(screen.getByText('Авторизован')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /Демо-режим/ })).toBeChecked()
  })

  it('renders nothing when closed', () => {
    renderSheet({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('saves the edited fields', async () => {
    const user = userEvent.setup()
    const { onSave } = renderSheet()

    const url = screen.getByLabelText('Адрес API')
    await user.clear(url)
    await user.type(url, 'https://3101.api.green-api.com')
    await user.click(screen.getByRole('button', { name: 'Сохранить и переподключиться' }))

    expect(onSave).toHaveBeenCalledWith({
      apiUrl: 'https://3101.api.green-api.com',
      idInstance: '1101123456',
      apiTokenInstance: 'secret-token',
      demoMode: true,
    })
  })

  it('re-checks the connection', async () => {
    const user = userEvent.setup()
    const { onCheck } = renderSheet()
    await user.click(screen.getByRole('button', { name: 'Проверить подключение' }))
    expect(onCheck).toHaveBeenCalledTimes(1)
  })

  it('requires a confirmation before clearing the data', async () => {
    const user = userEvent.setup()
    const { onClear } = renderSheet()

    await user.click(screen.getByRole('button', { name: 'Очистить данные' }))
    expect(onClear).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Удалить адрес, idInstance и токен')

    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onClear).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Очистить данные' }))
    await user.click(screen.getByRole('button', { name: 'Да, очистить' }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape and on the backdrop', async () => {
    const user = userEvent.setup()
    const { onClose } = renderSheet()

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)

    await user.click(document.querySelector('.sheet__backdrop') as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('toggles the demo switch immediately', async () => {
    const user = userEvent.setup()
    const { onSetDemoMode } = renderSheet()

    await user.click(screen.getByRole('switch', { name: /Демо-режим/ }))
    expect(onSetDemoMode).toHaveBeenCalledWith(false)
  })

  it('links to the GREEN-API console and the docs', () => {
    renderSheet()
    expect(screen.getByRole('link', { name: 'Консоль GREEN-API' })).toHaveAttribute(
      'href',
      'https://console.green-api.com',
    )
    expect(screen.getByRole('link', { name: 'Документация API' })).toHaveAttribute(
      'href',
      'https://green-api.com/en/docs/',
    )
  })
})
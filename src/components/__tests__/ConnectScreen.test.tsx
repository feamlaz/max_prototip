import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../App'
import { ConnectScreen, FOREIGN_API_URL_WARNING } from '../ConnectScreen'

const { save, setDemoMode, clear } = vi.hoisted(() => ({
  save: vi.fn(),
  setDemoMode: vi.fn(),
  clear: vi.fn(),
}))

// `useCredentials` is mocked so the assertions target the credential write;
// App then renders ConnectScreen because nothing is connected yet.
vi.mock('../../hooks/useCredentials', () => ({
  useCredentials: () => ({
    credentials: { apiUrl: '', idInstance: '', apiTokenInstance: '', demoMode: false },
    hydrated: true,
    hasCredentials: false,
    save,
    clear,
    setDemoMode,
  }),
}))

describe('ConnectScreen', () => {
  beforeEach(() => {
    save.mockClear()
    setDemoMode.mockClear()
    clear.mockClear()
  })

  it('renders the MAX card with a real label for every input', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Подключение к GREEN-API' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Адрес API')).toHaveAttribute(
      'placeholder',
      'https://3100.api.green-api.com/',
    )
    expect(screen.getByLabelText('idInstance')).toHaveAttribute('inputmode', 'numeric')
    expect(screen.getByLabelText('Токен инстанса')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Подключить' })).toBeEnabled()
    expect(screen.getByRole('switch', { name: 'Демо-режим' })).not.toBeChecked()
  })

  it('saves the entered credentials on submit, stripping spaces from idInstance', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('Адрес API'), '3100.api.green-api.com')
    await user.type(screen.getByLabelText('idInstance'), '1101 123 456')
    await user.type(screen.getByLabelText('Токен инстанса'), 'd1b4f9e8c7')
    await user.click(screen.getByRole('button', { name: 'Подключить' }))

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({
      apiUrl: '3100.api.green-api.com',
      idInstance: '1101123456',
      apiTokenInstance: 'd1b4f9e8c7',
      demoMode: false,
    })
  })

  it('submits the demo switch value together with the credentials', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('switch', { name: 'Демо-режим' }))
    await user.click(screen.getByRole('button', { name: 'Подключить' }))

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ demoMode: true }),
    )
  })

  it('starts the demo from the secondary button', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Посмотреть демо' }))
    expect(setDemoMode).toHaveBeenCalledWith(true)
    expect(save).not.toHaveBeenCalled()
  })

  it('toggles token visibility with the eye button', async () => {
    const user = userEvent.setup()
    render(<App />)

    const toggle = screen.getByRole('button', { name: 'Показать токен' })
    expect(screen.getByLabelText('Токен инстанса')).toHaveAttribute('type', 'password')

    await user.click(toggle)
    expect(screen.getByLabelText('Токен инстанса')).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Скрыть токен' })).toBeInTheDocument()
  })

  it('shows the GREEN-API error hint as an alert and offers a retry', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const error = 'В кабинете GREEN-API задан webhookUrl. Очистите его.'
    render(
      <ConnectScreen
        credentials={{ apiUrl: '', idInstance: '', apiTokenInstance: '', demoMode: false }}
        error={error}
        checking={false}
        onSave={save}
        onSetDemoMode={setDemoMode}
        onRetry={onRetry}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(error)
    await user.click(screen.getByRole('button', { name: 'Проверить ещё раз' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('disables submit and shows a spinner while the instance is being checked', () => {
    render(
      <ConnectScreen
        credentials={{ apiUrl: '', idInstance: '', apiTokenInstance: '', demoMode: false }}
        error={null}
        checking
        onSave={save}
        onSetDemoMode={setDemoMode}
      />,
    )

    expect(screen.getByRole('button', { name: /Проверяем подключение/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Проверить ещё раз' })).toBeNull()
  })

  it('documents where the credentials come from', () => {
    render(<App />)

    expect(
      screen.getByText(/console\.green-api\.com/),
    ).toBeInTheDocument()
    expect(screen.getByText(/webhookUrl/)).toBeInTheDocument()
    expect(screen.getByText(/11–12/)).toBeInTheDocument()
  })

  describe('foreign apiUrl warning', () => {
    function renderConnect(apiUrl: string) {
      return render(
        <ConnectScreen
          credentials={{
            apiUrl,
            idInstance: '1101123456',
            apiTokenInstance: 'd1b4f9e8c7',
            demoMode: false,
          }}
          error={null}
          checking={false}
          onSave={save}
          onSetDemoMode={setDemoMode}
        />,
      )
    }

    it.each([
      ['https://api.green-api.com'],
      ['https://3100.api.green-api.com/'],
      ['3100.api.green-api.com'],
      ['green-api.com'],
    ])('does not warn for the official host %s', (apiUrl) => {
      renderConnect(apiUrl)
      expect(screen.queryByText(FOREIGN_API_URL_WARNING)).not.toBeInTheDocument()
    })

    it.each([
      ['https://evil.example.com'],
      ['http://localhost:8080'],
      ['https://green-api.com.attacker.net'],
      ['//green-api.com.evil.net'],
      ['not a url at all'],
    ])('warns for the non-official address %s', (apiUrl) => {
      renderConnect(apiUrl)
      expect(screen.getByText(FOREIGN_API_URL_WARNING)).toBeInTheDocument()
    })

    it('keeps the warning non-blocking: the address can still be saved', async () => {
      const user = userEvent.setup()
      renderConnect('https://self-hosted.example.net')

      await user.click(screen.getByRole('button', { name: 'Подключить' }))
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ apiUrl: 'https://self-hosted.example.net' }),
      )
      expect(screen.getByText(FOREIGN_API_URL_WARNING)).toBeInTheDocument()
    })

    it('does not warn while the field is still empty', () => {
      renderConnect('')
      expect(screen.queryByText(FOREIGN_API_URL_WARNING)).not.toBeInTheDocument()
    })
  })
})
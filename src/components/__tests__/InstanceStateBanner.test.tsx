import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { InstanceState } from '../../api/types'
import { InstanceStateBanner } from '../InstanceStateBanner'

function renderBanner(state: InstanceState, checking = false) {
  const onRetry = vi.fn()
  const onOpenSettings = vi.fn()
  const utils = render(
    <InstanceStateBanner
      state={state}
      checking={checking}
      onRetry={onRetry}
      onOpenSettings={onOpenSettings}
    />,
  )
  return { ...utils, onRetry, onOpenSettings }
}

describe('InstanceStateBanner', () => {
  it('renders nothing for an authorized or unknown state', () => {
    const { container } = renderBanner('authorized')
    expect(container).toBeEmptyDOMElement()

    const unknown = render(
      <InstanceStateBanner
        state={null}
        checking={false}
        onRetry={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )
    expect(unknown.container).toBeEmptyDOMElement()
  })

  it.each([
    ['notAuthorized', 'Инстанс не авторизован'],
    ['pendingPassword', 'Инстанс не авторизован'],
    ['starting', 'Инцидент запускается…'],
    ['blocked', 'Аккаунт заблокирован'],
    ['suspended', 'Аккаунт приостановлен'],
  ] as Array<[InstanceState, string]>)('shows the Russian title for %s', (state, title) => {
    renderBanner(state)
    expect(screen.getByText(title)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(title)
  })

  it('repeats the check on retry and can open the settings', async () => {
    const user = userEvent.setup()
    const { onRetry, onOpenSettings } = renderBanner('starting')

    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    await user.click(screen.getByRole('button', { name: 'Настройки' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('disables the retry button while a check is running', () => {
    renderBanner('starting', true)
    expect(screen.getByRole('button', { name: /Повторить/ })).toBeDisabled()
  })

  it('renders a generic banner instead of crashing on an unmapped state', () => {
    // `stateInstance` is an unvalidated string on the wire: GREEN-API may add a
    // state before this build knows about it.
    const unknownState = 'migratingToChat' as InstanceState
    render(
      <InstanceStateBanner
        state={unknownState}
        checking={false}
        onRetry={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )

    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent('Неизвестное состояние инстанса')
    expect(banner).toHaveTextContent('GREEN-API вернул состояние')
    expect(banner).toHaveClass('banner--warn')
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
  })
})
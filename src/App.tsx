/**
 * MAX messenger prototype — screen composition.
 *
 * All data flow goes through the hooks in `src/hooks`; this file only decides
 * which screen is visible and routes webhook-driven events into local state.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChatScreen } from './components/ChatScreen'
import { ConnectScreen } from './components/ConnectScreen'
import { InstanceStateBanner } from './components/InstanceStateBanner'
import { SettingsSheet } from './components/SettingsSheet'
import { StartChatCard } from './components/StartChatCard'
import { Toast } from './components/Toast'
import { useApiClient } from './hooks/useApiClient'
import { useChat } from './hooks/useChat'
import { useCredentials } from './hooks/useCredentials'
import { useInstanceState } from './hooks/useInstanceState'
import { useNotifications } from './hooks/useNotifications'
import type { GreenApiLike } from './api/interface'
import type { InstanceState } from './api/types'
import './components/App.css'

/** `starting` is usable: the chat opens while the instance boots. */
function isUsable(state: InstanceState | null): boolean {
  return state === 'authorized' || state === 'starting'
}

export function App() {
  // Remounting the session is the only way to drop the chat/instances state
  // the hooks keep between connections — `Выйти` must start from scratch.
  const [session, setSession] = useState(0)
  return <MaxSession key={session} onReset={() => setSession((value) => value + 1)} />
}

function MaxSession({ onReset }: { onReset: () => void }) {
  const { credentials, hydrated, hasCredentials, save, clear, setDemoMode } = useCredentials()

  const connected = hydrated && hasCredentials
  const client = useApiClient(credentials, connected)
  const instance = useInstanceState(client, connected)
  const chat = useChat(client)

  const [settingsOpen, setSettingsOpen] = useState(false)
  // `stateInstanceChanged` webhooks update the header without waiting for the
  // next poll. The client is stored next to the value so a reconnect can never
  // show a stale state.
  const [liveState, setLiveState] = useState<{
    client: GreenApiLike | null
    state: InstanceState
  } | null>(null)

  const handleStateChange = useCallback(
    (state: InstanceState) => {
      setLiveState((current) =>
        current !== null && current.client === client && current.state === state
          ? current
          : { client, state },
      )
    },
    [client],
  )

  const notifications = useNotifications(client, {
    enabled: connected,
    onWebhook: chat.handleWebhook,
    onStateInstanceChange: handleStateChange,
  })

  const instanceState =
    liveState !== null && liveState.client === client ? liveState.state : instance.state
  const usable = isUsable(instanceState)

  const handleOpenSettings = useCallback(() => setSettingsOpen(true), [])
  const handleCloseSettings = useCallback(() => setSettingsOpen(false), [])

  // Drop the credentials and the whole session state (chat, instance state).
  const handleExit = useCallback(() => {
    clear()
    onReset()
  }, [clear, onReset])

  const handleOpen = useCallback(
    (phone: string) => {
      // Only `openChat` here: the chat id is not in this closure yet, so the
      // history request has to be triggered by the transition below.
      void chat.openChat(phone)
    },
    [chat],
  )

  // History is requested once, right after the chat id appears — the effect
  // runs with the fresh `loadHistory`, whose closure already knows the chatId.
  const previousChatId = useRef<string | null>(null)
  useEffect(() => {
    const chatId = chat.state.chatId
    if (chatId !== null && previousChatId.current === null) {
      void chat.loadHistory()
    }
    previousChatId.current = chatId
  }, [chat])

  const handleSend = useCallback(
    (text: string) => {
      void chat.send(text)
    },
    [chat],
  )

  const connection: 'online' | 'reconnecting' | 'offline' = notifications.lastError
    ? 'offline'
    : notifications.running
      ? 'online'
      : 'reconnecting'

  const [dismissedError, setDismissedError] = useState<string | null>(null)
  const toastError =
    chat.state.chatId !== null && chat.error !== null && chat.error !== dismissedError
      ? chat.error
      : null

  const handleDismiss = useCallback(() => setDismissedError(chat.error), [chat.error])

  // localStorage has to be read before the first decision, otherwise a stored
  // instance would flash the connect screen.
  if (!hydrated) {
    return (
      <div className="app-boot" aria-busy="true">
        Загружаем настройки…
      </div>
    )
  }

  // A failed instance check keeps the connect screen up: the fix (new
  // credentials, empty webhookUrl) is edited right here.
  if (!connected || (instance.error !== null && !usable)) {
    // Re-seed the draft from the stored credentials whenever they change.
    const stamp = `${credentials.apiUrl}|${credentials.idInstance}|${credentials.apiTokenInstance}|${String(credentials.demoMode)}`
    return (
      <ConnectScreen
        key={stamp}
        credentials={credentials}
        error={instance.error}
        checking={instance.checking}
        onSave={save}
        onSetDemoMode={setDemoMode}
        onRetry={connected ? () => void instance.refresh() : undefined}
      />
    )
  }

  return (
    <div className="app">
      <div className="app__inner">
        <InstanceStateBanner
          state={instanceState}
          checking={instance.checking}
          onRetry={() => void instance.refresh()}
          onOpenSettings={handleOpenSettings}
        />

        {chat.state.chatId === null ? (
          <StartChatCard
            demoMode={credentials.demoMode}
            busy={chat.busy}
            error={chat.error}
            onOpen={(phone) => void handleOpen(phone)}
            onOpenSettings={handleOpenSettings}
          />
        ) : (
          <ChatScreen
            state={chat.state}
            connection={connection}
            polling={notifications.running}
            pollingError={notifications.lastError}
            instanceState={instanceState}
            checking={instance.checking}
            onSend={handleSend}
            onOpenSettings={handleOpenSettings}
            onExit={handleExit}
          />
        )}
      </div>

      <SettingsSheet
        key={`${String(settingsOpen)}|${credentials.apiUrl}|${credentials.idInstance}|${credentials.apiTokenInstance}|${String(credentials.demoMode)}`}
        open={settingsOpen}
        credentials={credentials}
        instanceState={instanceState}
        checking={instance.checking}
        onClose={handleCloseSettings}
        onSave={save}
        onSetDemoMode={setDemoMode}
        onCheck={() => void instance.refresh()}
        onClear={clear}
      />

      <Toast message={toastError} onDismiss={handleDismiss} />
    </div>
  )
}
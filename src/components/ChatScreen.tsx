/** Chat shell: header / message log / composer, plus the polling status pill. */
import type { InstanceState } from '../api/types'
import type { ChatState } from '../store/types'
import { ChatHeader } from './ChatHeader'
import { Composer } from './Composer'
import { MessageList } from './MessageList'
import { StatusBar } from './StatusBar'
import './ChatScreen.css'

export interface ChatScreenProps {
  state: ChatState
  connection: 'online' | 'reconnecting' | 'offline'
  polling: boolean
  pollingError: string | null
  instanceState: InstanceState | null
  checking: boolean
  onSend: (text: string) => void
  onOpenSettings: () => void
  onExit: () => void
}

export function ChatScreen({
  state,
  connection,
  polling,
  pollingError,
  instanceState,
  checking,
  onSend,
  onOpenSettings,
  onExit,
}: ChatScreenProps) {
  return (
    <section className="chat" aria-label="Чат">
      <ChatHeader
        peerName={state.peerName}
        peerPhone={state.peerPhone}
        connection={connection}
        checking={checking}
        onOpenSettings={onOpenSettings}
        onExit={onExit}
      />

      <MessageList messages={state.messages} />

      <div className="chat__footer">
        <StatusBar running={polling} error={pollingError} state={instanceState} />
        <Composer onSend={onSend} />
      </div>
    </section>
  )
}
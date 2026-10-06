/**
 * GREEN-API types for the MAX messenger (v3).
 *
 * Field names are taken verbatim from the GREEN-API MAX documentation —
 * do not rename them, the HTTP payloads use these exact keys.
 */

export type InstanceState =
  | 'notAuthorized'
  | 'authorized'
  | 'blocked'
  | 'starting'
  | 'suspended'
  | 'pendingPassword'

export interface GreenApiCredentials {
  apiUrl: string
  idInstance: string
  apiTokenInstance: string
}

export interface SendMessageRequest {
  chatId: string
  message: string
  typingTime?: number
  quotedMessageId?: string
}

export interface SendMessageResponse {
  idMessage: string
}

export interface CheckAccountRequest {
  phoneNumber: number
  force?: boolean
}
// success: { exist: true; chatId: string; fromCache: boolean }
// not found: { exist: false; chatId: ''; fromCache: false }
// unavailable: { status: false; reason: string }

export interface NotificationEnvelope {
  receiptId?: number
  body?: WebhookBody
}

export type WebhookType =
  | 'incomingMessageReceived'
  | 'outgoingMessageReceived'
  | 'outgoingAPIMessageReceived'
  | 'outgoingMessageStatus'
  | 'stateInstanceChanged'
  | 'quotaExceeded'

export interface InstanceData {
  idInstance: number
  wid: string
  typeInstance: string
}

export interface SenderData {
  chatId: string
  chatName: string
  chatType: 'user' | 'group' | 'channel' | 'bot'
  sender: string
  senderName: string
  senderType: string
  senderContactName?: string
  senderPhoneNumber?: number
}

export interface TextMessageData {
  textMessage: string
  isForwarded?: boolean
  forwardingScore?: number
}

export interface MessageData {
  typeMessage: string
  textMessageData?: TextMessageData
}

interface WebhookBase {
  typeWebhook: WebhookType
  instanceData: InstanceData
  timestamp: number
  idMessage: string
  senderData: SenderData
  messageData: MessageData
}

export interface IncomingMessageReceived extends WebhookBase {
  typeWebhook: 'incomingMessageReceived'
}

export interface OutgoingMessageReceived extends WebhookBase {
  typeWebhook: 'outgoingMessageReceived'
}

export interface OutgoingMessageStatusWebhook {
  typeWebhook: 'outgoingMessageStatus'
  instanceData: InstanceData
  timestamp: number
  idMessage: string
  chatId: string
  status: 'delivered' | 'read' | 'failed' | 'noAccount' | 'notInGroup'
  description?: string
}

export interface StateInstanceChanged {
  typeWebhook: 'stateInstanceChanged'
  instanceData: InstanceData
  timestamp: number
  stateInstance: InstanceState
}

export interface QuotaExceeded {
  typeWebhook: 'quotaExceeded'
  instanceData: InstanceData
  timestamp: number
}

export type WebhookBody =
  | IncomingMessageReceived
  | OutgoingMessageReceived
  | OutgoingMessageStatusWebhook
  | StateInstanceChanged
  | QuotaExceeded

/**
 * Item of the GetChatHistory response. Unlike webhooks, history entries are
 * flat and expose the author as `senderId` (not `senderData.sender`), and the
 * endpoint returns a BARE ARRAY — not a wrapper object.
 */
export interface ChatHistoryItem {
  type: 'incoming' | 'outgoing'
  idMessage: string
  timestamp: number
  statusMessage?: 'sent' | 'delivered' | 'read'
  sendByApi?: boolean
  typeMessage: string
  chatId: string
  chatType: string
  senderId: string
  senderName: string
  senderType: string
  senderContactName?: string
  textMessage?: string
  isEdited?: boolean
  isDeleted?: boolean
  deletedMessageId?: string
  editedMessageId?: string
}

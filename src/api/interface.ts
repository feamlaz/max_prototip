/**
 * Contract every transport must satisfy, so the demo fake
 * (`src/demo/demoClient.ts`) can be swapped for the real HTTP client
 * without touching the store or hooks.
 */
import type {
  ChatHistoryItem,
  CheckAccountRequest,
  InstanceState,
  SendMessageRequest,
  WebhookBody,
} from './types'

export interface NotificationWithReceipt {
  /**
   * `null` when the envelope carried no usable receiptId. The webhook body is
   * still handed to the caller, but acknowledging it is impossible, so the
   * caller must skip DeleteNotification instead of inventing an id.
   */
  receiptId: number | null
  body: WebhookBody
}

export interface CheckAccountResult {
  exists: boolean
  chatId: string
}

export interface GreenApiLike {
  getStateInstance(signal?: AbortSignal): Promise<InstanceState>
  sendMessage(request: SendMessageRequest, signal?: AbortSignal): Promise<string>
  /**
   * Raw long-poll. `receiptId` must be exposed because DeleteNotification
   * requires it — GREEN-API keeps the notification in the queue until the
   * hook acknowledges it (`null` when the envelope carries none).
   */
  receiveNotificationRaw(
    receiveTimeoutSeconds: number,
    signal?: AbortSignal,
  ): Promise<NotificationWithReceipt | null>
  /** Convenience wrapper around `receiveNotificationRaw`. */
  receiveNotification(
    receiveTimeoutSeconds: number,
    signal?: AbortSignal,
  ): Promise<WebhookBody | null>
  deleteNotification(receiptId: number, signal?: AbortSignal): Promise<void>
  checkAccount(
    request: CheckAccountRequest,
    signal?: AbortSignal,
  ): Promise<CheckAccountResult>
  getChatHistory(
    chatId: string,
    count: number,
    signal?: AbortSignal,
  ): Promise<ChatHistoryItem[]>
}

import type {
  CheckAccountResult,
  GreenApiLike,
  NotificationWithReceipt,
} from './interface'
import { describeError, extractErrorMessage, GreenApiError } from './errors'
import type {
  ChatHistoryItem,
  CheckAccountRequest,
  GreenApiCredentials,
  InstanceState,
  SendMessageRequest,
  WebhookBody,
} from './types'

const DEFAULT_API_URL = 'https://api.green-api.com'

/** States GREEN-API documents today; anything else is mapped, never passed on. */
const KNOWN_INSTANCE_STATES: ReadonlySet<string> = new Set<InstanceState>([
  'notAuthorized',
  'authorized',
  'blocked',
  'starting',
  'suspended',
  'pendingPassword',
])

/**
 * Client-side timeout for regular requests.
 *
 * It exists so a hung socket cannot leave a message bubble in `pending`
 * forever — without it a send only ends when TCP gives up, which can take
 * minutes. `receiveNotification` is EXEMPT (it opts in with `timeoutMs: 0`):
 * the long-poll legitimately holds the connection open for `receiveTimeout`
 * seconds (up to 60), so this timer would abort every healthy poll. That call
 * is only released by unmount, which already aborts its own signal.
 */
export const REQUEST_TIMEOUT_MS = 20_000

const TIMEOUT_MESSAGE = 'Превышено время ожидания ответа GREEN-API'

/** Clamps receiveNotification timeout into the documented 5..60 range. */
function clampReceiveTimeout(seconds: number): number {
  if (!Number.isFinite(seconds)) return 30
  return Math.min(60, Math.max(5, Math.round(seconds)))
}

/** RU/BY numbers are 11–12 digits; GREEN-API wants digits only. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  return digits.length >= 11 && digits.length <= 12 ? digits : null
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export interface RetryOptions {
  /** Total number of attempts, including the first one. */
  attempts: number
  delayMs: number
  /** Retry only when the predicate returns true (e.g. transient gateway errors). */
  shouldRetry?: (error: unknown) => boolean
  signal?: AbortSignal
}

/** Linear backoff retry wrapper. Rethrows the last error when attempts run out. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const attempts = Math.max(1, options.attempts)
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const retryable = options.shouldRetry ? options.shouldRetry(error) : true
      if (!retryable || attempt === attempts - 1) throw error
      await sleep(options.delayMs * (attempt + 1), options.signal)
    }
  }
  throw lastError
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

export function isTransientGatewayError(error: unknown): boolean {
  return (
    error instanceof GreenApiError && (error.status === 502 || error.status === 499)
  )
}

/** HTTP client for GREEN-API MAX. Auth lives in the URL path, not in headers. */
export class GreenApiClient implements GreenApiLike {
  readonly apiUrl: string
  readonly idInstance: string
  private readonly apiTokenInstance: string

  constructor(credentials: GreenApiCredentials) {
    this.apiUrl = GreenApiClient.normalizeApiUrl(credentials.apiUrl)
    this.idInstance = credentials.idInstance.trim()
    this.apiTokenInstance = credentials.apiTokenInstance.trim()
  }

  /**
   * Users copy the apiUrl from the GREEN-API console, so a bare host is
   * accepted and trailing slashes are removed.
   */
  static normalizeApiUrl(raw: string | undefined): string {
    const trimmed = (raw ?? '').trim().replace(/\/+$/, '')
    if (trimmed === '') return DEFAULT_API_URL
    if (/^https?:\/\//i.test(trimmed)) return trimmed
    return `https://${trimmed}`
  }

  /** Replaces the api token so it never appears in user-visible strings. */
  redact(value: string): string {
    if (this.apiTokenInstance === '') return value
    return value.split(this.apiTokenInstance).join('***')
  }

  buildUrl(method: string, extraPath = '', query = ''): string {
    const base = `${this.apiUrl}/waInstance${this.idInstance}/${method}/${this.apiTokenInstance}`
    return `${base}${extraPath}${query}`
  }

  /**
   * `timeoutMs: 0` disables the client-side timeout (see REQUEST_TIMEOUT_MS).
   * The caller's `signal` is always composed into the request, never dropped.
   */
  private async request(
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    body: unknown,
    signal?: AbortSignal,
    timeoutMs: number = REQUEST_TIMEOUT_MS,
  ): Promise<Response> {
    // Composition is manual instead of `AbortSignal.any` because the timeout
    // needs its own flag: a caller abort must stay an AbortError, while a
    // timeout has to become a user-visible Russian error.
    const timeout = new AbortController()
    let timedOut = false
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true
            timeout.abort()
          }, timeoutMs)
        : null
    const abortFromCaller = (): void => timeout.abort()
    signal?.addEventListener('abort', abortFromCaller)

    let response: Response
    try {
      response = await fetch(url, {
        method,
        signal: timeout.signal,
        ...(body === undefined
          ? {}
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      })
    } catch (error) {
      // An aborted request must stay an AbortError, otherwise the poll loop
      // would treat its own unmount cleanup as a network failure.
      if (signal?.aborted) throw error
      // A timeout is our own abort, not a network failure: surface it as a
      // message the user can act on instead of a bare "network unavailable".
      if (timedOut) throw new GreenApiError(TIMEOUT_MESSAGE)
      if (isAbortError(error)) throw error
      // A failed fetch must not echo a URL that carries the token.
      throw new GreenApiError(
        this.redact(
          error instanceof Error && error.message
            ? error.message
            : 'Сеть недоступна',
        ),
      )
    } finally {
      if (timer !== null) clearTimeout(timer)
      signal?.removeEventListener('abort', abortFromCaller)
    }
    if (!response.ok) {
      const detail = extractErrorMessage(await response.text().catch(() => undefined))
      const described = describeError(response.status, detail)
      throw new GreenApiError(this.redact(described.message), {
        status: response.status,
        reason: described.reason === undefined ? undefined : this.redact(described.reason),
      })
    }
    return response
  }

  private async requestJson(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    body: unknown,
    signal?: AbortSignal,
    extraPath = '',
    query = '',
    timeoutMs: number = REQUEST_TIMEOUT_MS,
  ): Promise<unknown> {
    const url = this.buildUrl(endpoint, extraPath, query)
    const response = await this.request(method, url, body, signal, timeoutMs)
    const text = await response.text()
    if (text.trim() === '') return undefined
    try {
      return JSON.parse(text) as unknown
    } catch {
      return text
    }
  }

  async getStateInstance(signal?: AbortSignal): Promise<InstanceState> {
    return withRetry(
      async () => {
        const data = await this.requestJson('GET', 'getStateInstance', undefined, signal)
        const state =
          data && typeof data === 'object' && 'stateInstance' in data
            ? (data as { stateInstance?: unknown }).stateInstance
            : undefined
        if (typeof state !== 'string') {
          throw new GreenApiError('GREEN-API не вернул stateInstance')
        }
        if (!KNOWN_INSTANCE_STATES.has(state)) {
          // An unknown state is mapped to `notAuthorized` instead of throwing:
          // throwing would blank the whole app the moment GREEN-API adds a
          // state, while `notAuthorized` keeps the actionable hint ("scan the
          // QR code"), which is also the right instruction for a state this
          // build cannot interpret. The raw string is deliberately dropped —
          // no caller can do anything meaningful with it yet.
          return 'notAuthorized'
        }
        return state as InstanceState
      },
      { attempts: 2, delayMs: 400, shouldRetry: isTransientGatewayError, signal },
    )
  }

  async sendMessage(
    request: SendMessageRequest,
    signal?: AbortSignal,
  ): Promise<string> {
    const payload: Record<string, unknown> = {
      chatId: request.chatId,
      message: request.message,
    }
    if (request.quotedMessageId !== undefined) {
      payload.quotedMessageId = request.quotedMessageId
    }
    if (request.typingTime !== undefined) {
      payload.typingTime = request.typingTime
    }
    const data = await this.requestJson('POST', 'sendMessage', payload, signal)
    const idMessage =
      data && typeof data === 'object' && 'idMessage' in data
        ? (data as { idMessage?: unknown }).idMessage
        : undefined
    if (typeof idMessage !== 'string' || idMessage === '') {
      throw new GreenApiError('GREEN-API не вернул idMessage')
    }
    return idMessage
  }

  async receiveNotificationRaw(
    receiveTimeoutSeconds: number,
    signal?: AbortSignal,
  ): Promise<NotificationWithReceipt | null> {
    const timeout = clampReceiveTimeout(receiveTimeoutSeconds)
    const data = await this.requestJson(
      'GET',
      'receiveNotification',
      undefined,
      signal,
      '',
      `?receiveTimeout=${timeout}`,
      // Long-poll: no client-side timeout, the request must be able to hang
      // for the whole `receiveTimeout` window (see REQUEST_TIMEOUT_MS).
      0,
    )
    // Long-poll returns HTTP 200 with an EMPTY body when the timeout expires.
    if (data === undefined) return null
    if (typeof data !== 'object' || data === null) return null
    const envelope = data as { receiptId?: unknown; body?: unknown }
    if (envelope.body === undefined || envelope.body === null) return null
    // A missing receiptId must NOT be invented as 0: DeleteNotification(0)
    // answers 400 on every iteration and the loop would spam `lastError`. The
    // webhook is still surfaced — the caller just cannot acknowledge it.
    const receiptId =
      typeof envelope.receiptId === 'number' && Number.isFinite(envelope.receiptId)
        ? envelope.receiptId
        : null
    return { receiptId, body: envelope.body as WebhookBody }
  }

  async receiveNotification(
    receiveTimeoutSeconds: number,
    signal?: AbortSignal,
  ): Promise<WebhookBody | null> {
    const result = await this.receiveNotificationRaw(receiveTimeoutSeconds, signal)
    return result ? result.body : null
  }

  async deleteNotification(receiptId: number, signal?: AbortSignal): Promise<void> {
    await this.requestJson('DELETE', 'deleteNotification', undefined, signal, `/${receiptId}`)
  }

  async checkAccount(
    request: CheckAccountRequest,
    signal?: AbortSignal,
  ): Promise<CheckAccountResult> {
    // `force` is documented by GREEN-API (it bypasses the contact cache), so it
    // is forwarded only when the caller actually asked for it.
    const requestBody: Record<string, unknown> = { phoneNumber: request.phoneNumber }
    if (request.force !== undefined) requestBody.force = request.force

    const data = await this.requestJson('POST', 'checkAccount', requestBody, signal)
    const payload = (data && typeof data === 'object' ? data : {}) as {
      status?: unknown
      exist?: unknown
      chatId?: unknown
      reason?: unknown
    }

    // Shape 3: the account could not be checked at all.
    if (payload.status === false) {
      const reason =
        typeof payload.reason === 'string' && payload.reason !== ''
          ? payload.reason
          : 'Аккаунт недоступен'
      // `reason` is documented as user-visible, so it needs the same redaction
      // as `message` — GREEN-API echoes the request path, token included.
      throw new GreenApiError(this.redact(reason), { reason: this.redact(reason) })
    }

    // Shapes 1 and 2 both describe existence; normalize them into one result.
    const exists = payload.exist === true
    return {
      exists,
      chatId: typeof payload.chatId === 'string' ? payload.chatId : '',
    }
  }

  async getChatHistory(
    chatId: string,
    count: number,
    signal?: AbortSignal,
  ): Promise<ChatHistoryItem[]> {
    const data = await this.requestJson('POST', 'getChatHistory', { chatId, count }, signal)
    // GetChatHistory returns a bare array; guard against an unexpected wrapper.
    return Array.isArray(data) ? (data as ChatHistoryItem[]) : []
  }
}

export { DEFAULT_API_URL, isAbortError }

/**
 * GREEN-API error with a Russian, human readable hint for the documented
 * failure cases. The API token must never leak into `message`.
 */
export class GreenApiError extends Error {
  readonly status?: number
  readonly reason?: string

  constructor(message: string, options: { status?: number; reason?: string } = {}) {
    super(message)
    this.name = 'GreenApiError'
    this.status = options.status
    this.reason = options.reason
  }
}

type ErrorPayload = {
  message?: unknown
  reason?: unknown
  error?: unknown
}

function asText(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  return undefined
}

/**
 * Detects an HTML document in an error body.
 *
 * A mistyped `apiUrl` makes GREEN-API — or any proxy in front of it — answer
 * with a full HTML error page. Echoing that markup into the red alert is
 * unreadable noise, so the document is dropped instead of shown.
 */
function looksLikeHtmlDocument(body: string): boolean {
  // A leading BOM is not whitespace for `trim()`, so it goes first.
  const text = body.replace(/^\uFEFF/, '').trim()
  if (text === '') return false
  if (text.startsWith('<')) return true
  return /<\s*(!doctype\s+html|html|head|body)\b/i.test(text)
}

/** Plain text is surfaced as-is; an HTML blob is never user-facing. */
function presentable(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  return looksLikeHtmlDocument(value) ? undefined : value
}

/** Best-effort extraction of a human message from an error body. */
export function extractErrorMessage(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  // Checked before parsing: an HTML page is never a useful message, and
  // `JSON.parse` cannot succeed on one anyway.
  if (looksLikeHtmlDocument(raw)) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      const payload = parsed as ErrorPayload
      // A short object without any of the known fields falls through to
      // `undefined` instead of surfacing `[object Object]`.
      return presentable(
        asText(payload.message) ?? asText(payload.reason) ?? asText(payload.error),
      )
    }
    return presentable(asText(parsed))
  } catch {
    // Non-JSON body (plain text, XML) — use it as-is when present: a bare
    // `Not Found` or `Parameter idInstance not an integer` is actionable.
    return presentable(asText(raw))
  }
}

/** First hint whose pattern matches the raw server detail. */
function hintFor(detail: string): string | undefined {
  const hints: ReadonlyArray<{ test: RegExp; hint: string }> = [
    {
      // The two most common first-run mistakes: the id or the token was pasted
      // from the wrong field, so GREEN-API answers 400 with plain English.
      test: /parameter\s+idinstance\s+not\s+an\s+integer|parameter\s+apitokeninstance\s+not\s+define/i,
      hint: 'Проверьте idInstance и токен инстанса — они должны быть числами/строкой из кабинета GREEN-API.',
    },
    {
      test: /custom webhook url is set/i,
      hint: 'В кабинете GREEN-API задан webhookUrl. Очистите его — HTTP-поллинг работает только без него.',
    },
    {
      test: /instance in starting process try later|instance is starting or not authorized/i,
      hint: 'Инстанс запускается или не авторизован.',
    },
    {
      test: /your account is suspended/i,
      hint: 'Аккаунт временно ограничен',
    },
    {
      test: /forbidden/i,
      hint: 'Неверный idInstance или адрес API',
    },
    {
      test: /get contact info limit reached/i,
      hint: 'MAX ограничил проверки номеров. Пауза ~2 часа.',
    },
  ]
  return hints.find((item) => item.test.test(detail))?.hint
}

/**
 * Builds the error message for a failed request. `status` is matched first so
 * that 403 Forbidden and 403 suspended stay distinguishable.
 */
export function describeError(
  status: number,
  detail: string | undefined,
): { message: string; reason?: string } {
  const detailText = (detail ?? '').trim()
  const reason = detailText === '' ? undefined : detailText
  const hint = hintFor(detailText)

  switch (status) {
    case 400:
      return { message: hint ?? reason ?? 'Некорректный запрос к GREEN-API', reason }
    case 401:
      return { message: 'Неверный apiTokenInstance', reason }
    case 403:
      // Suspended account and plain Forbidden share the status, so the body wins.
      return { message: hint ?? 'Неверный idInstance или адрес API', reason }
    case 404:
      // A wrong apiUrl/instance hits the HTTP layer: the body is often an HTML
      // page (already dropped by `extractErrorMessage`), so the status itself
      // has to say something the user can act on.
      return { message: hint ?? 'Инстанс не найден. Проверьте apiUrl и idInstance.', reason }
    case 429:
      return { message: 'Превышен лимит частоты запросов', reason }
    case 466:
      return { message: 'Исчерпан лимит тарифа', reason }
    case 469:
      return { message: hint ?? 'MAX ограничил проверки номеров. Пауза ~2 часа.', reason }
    case 502:
      return { message: 'Ошибка шлюза, повторите позже', reason }
    default:
      return { message: reason ?? `Ошибка GREEN-API (HTTP ${status})`, reason }
  }
}

import { afterEach, describe, expect, it, vi } from 'vitest'
import { GreenApiClient, normalizePhone, REQUEST_TIMEOUT_MS, sleep, withRetry } from './client'
import { GreenApiError } from './errors'
import { DEFAULT_API_URL } from './client'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response
}

function textResponse(text: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
  } as unknown as Response
}

const credentials = {
  apiUrl: 'https://api.green-api.com',
  idInstance: '1101122334',
  apiTokenInstance: 'd75b3a66374942c5b3c019c698abc2067e151558acbd412345',
}

describe('url construction', () => {
  it('puts auth in the path and uses no auth headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ stateInstance: 'authorized' }))
    vi.stubGlobal('fetch', fetchMock)

    const client = new GreenApiClient(credentials)
    await client.getStateInstance()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      'https://api.green-api.com/waInstance1101122334/getStateInstance/d75b3a66374942c5b3c019c698abc2067e151558acbd412345',
    )
    expect(init.method).toBe('GET')
    expect(init.headers).toBeUndefined()
  })

  it.each([
    ['https://api.green-api.com/', 'https://api.green-api.com'],
    ['  https://api.green-api.com//  ', 'https://api.green-api.com'],
    ['api.green-api.com', 'https://api.green-api.com'],
    ['http://127.0.0.1:8080', 'http://127.0.0.1:8080'],
    ['', DEFAULT_API_URL],
  ])('normalizes apiUrl %j -> %j', (input, expected) => {
    expect(GreenApiClient.normalizeApiUrl(input)).toBe(expected)
  })
})

describe('sendMessage', () => {
  it('posts chatId, message and typingTime, returns idMessage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ idMessage: 'BAE5F1' }))
    vi.stubGlobal('fetch', fetchMock)

    const client = new GreenApiClient(credentials)
    const id = await client.sendMessage({ chatId: '1@c.us', message: 'Привет', typingTime: 3000 })

    expect(id).toBe('BAE5F1')
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      chatId: '1@c.us',
      message: 'Привет',
      typingTime: 3000,
    })
  })
})

describe('receiveNotification', () => {
  it('returns null on an empty 200 body (long-poll timeout)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(textResponse('')))

    const client = new GreenApiClient(credentials)
    await expect(client.receiveNotification(30)).resolves.toBeNull()
  })

  it('returns null on a whitespace-only body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(textResponse('   \n')))

    const client = new GreenApiClient(credentials)
    await expect(client.receiveNotification(30)).resolves.toBeNull()
  })

  it('clamps the receiveTimeout to the documented 5..60 range', async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse(''))
    vi.stubGlobal('fetch', fetchMock)

    const client = new GreenApiClient(credentials)
    await client.receiveNotification(1)
    await client.receiveNotification(999)

    const urls = fetchMock.mock.calls.map((call) => (call as [string])[0])
    expect(urls[0]).toContain('?receiveTimeout=5')
    expect(urls[1]).toContain('?receiveTimeout=60')
  })

  it('keeps an aborted request an AbortError (unmount must stay silent)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')),
    )

    const client = new GreenApiClient(credentials)
    const error = await client.receiveNotificationRaw(30).catch((e: unknown) => e)
    expect(error).not.toBeInstanceOf(GreenApiError)
    expect((error as Error).name).toBe('AbortError')
  })

  it('unwraps the envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ receiptId: 7, body: { typeWebhook: 'incomingMessageReceived' } }),
      ),
    )

    const client = new GreenApiClient(credentials)
    const raw = await client.receiveNotificationRaw(30)
    expect(raw?.receiptId).toBe(7)
    expect(raw?.body).toMatchObject({ typeWebhook: 'incomingMessageReceived' })
  })

  it.each([
    ['missing', { body: { typeWebhook: 'incomingMessageReceived' } }],
    ['null', { receiptId: null, body: { typeWebhook: 'incomingMessageReceived' } }],
    ['a string', { receiptId: '7', body: { typeWebhook: 'incomingMessageReceived' } }],
    ['NaN-ish', { receiptId: Number.NaN, body: { typeWebhook: 'incomingMessageReceived' } }],
  ])('reports receiptId: null when the envelope carries %s one', async (_label, envelope) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(envelope)))

    const client = new GreenApiClient(credentials)
    const raw = await client.receiveNotificationRaw(30)
    // The webhook must still reach the caller — only the acknowledge is lost.
    expect(raw?.receiptId).toBeNull()
    expect(raw?.body).toMatchObject({ typeWebhook: 'incomingMessageReceived' })
  })
})

describe('deleteNotification', () => {
  it('appends the receiptId to the path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)

    const client = new GreenApiClient(credentials)
    await client.deleteNotification(42)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      'https://api.green-api.com/waInstance1101122334/deleteNotification/d75b3a66374942c5b3c019c698abc2067e151558acbd412345/42',
    )
    expect(init.method).toBe('DELETE')
  })
})

describe('checkAccount', () => {
  it('normalizes the success shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ exist: true, chatId: '11001234567@c.us', fromCache: false })),
    )

    const client = new GreenApiClient(credentials)
    await expect(client.checkAccount({ phoneNumber: 11001234567 })).resolves.toEqual({
      exists: true,
      chatId: '11001234567@c.us',
    })
  })

  it('normalizes the not-found shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ exist: false, chatId: '', fromCache: false })),
    )

    const client = new GreenApiClient(credentials)
    await expect(client.checkAccount({ phoneNumber: 11001234567 })).resolves.toEqual({
      exists: false,
      chatId: '',
    })
  })

  it('throws on {status:false} carrying the reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ status: false, reason: 'MAX is unavailable' })),
    )

    const client = new GreenApiClient(credentials)
    await expect(client.checkAccount({ phoneNumber: 11001234567 })).rejects.toThrow(
      'MAX is unavailable',
    )
  })

  it('redacts the api token out of the failure reason as well', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          status: false,
          reason: `request failed for ${credentials.apiTokenInstance}`,
        }),
      ),
    )

    const client = new GreenApiClient(credentials)
    const error = await client.checkAccount({ phoneNumber: 11001234567 }).catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(GreenApiError)
    expect((error as GreenApiError).message).not.toContain(credentials.apiTokenInstance)
    expect((error as GreenApiError).reason).toBeDefined()
    expect((error as GreenApiError).reason).not.toContain(credentials.apiTokenInstance)
    expect((error as GreenApiError).reason).toContain('***')
  })

  it('forwards force when the caller sets it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ exist: true, chatId: '11001234567@c.us' }))
    vi.stubGlobal('fetch', fetchMock)

    const client = new GreenApiClient(credentials)
    await client.checkAccount({ phoneNumber: 11001234567, force: true })
    await client.checkAccount({ phoneNumber: 11001234567 })

    const bodies = fetchMock.mock.calls.map(
      (call) => JSON.parse((call as [string, RequestInit])[1].body as string) as unknown,
    )
    expect(bodies[0]).toEqual({ phoneNumber: 11001234567, force: true })
    expect(bodies[1]).toEqual({ phoneNumber: 11001234567 })
  })
})

describe('getStateInstance', () => {
  it.each(['notAuthorized', 'authorized', 'blocked', 'starting', 'suspended', 'pendingPassword'])(
    'passes the documented state %s through',
    async (state) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(jsonResponse({ stateInstance: state })),
      )

      const client = new GreenApiClient(credentials)
      await expect(client.getStateInstance()).resolves.toBe(state)
    },
  )

  it('maps an unknown state to notAuthorized instead of passing it on', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ stateInstance: 'migratingToChat' })),
    )

    const client = new GreenApiClient(credentials)
    // Not a throw: an API addition must not blank the whole app.
    await expect(client.getStateInstance()).resolves.toBe('notAuthorized')
  })

  it('still throws when the field is missing entirely', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})))

    const client = new GreenApiClient(credentials)
    await expect(client.getStateInstance()).rejects.toBeInstanceOf(GreenApiError)
  })
})

describe('request timeout', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  /** A fetch that never answers, but honours the abort signal like a real one. */
  function hangingFetch() {
    return vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
    )
  }

  it('aborts a hung request and reports a Russian timeout error', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', hangingFetch())

    const client = new GreenApiClient(credentials)
    const pending = client.sendMessage({ chatId: '1@c.us', message: 'x' }).catch(
      (e: unknown) => e,
    )

    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 5)

    const error = await pending
    expect(error).toBeInstanceOf(GreenApiError)
    // A toast instead of an eternal `pending` bubble.
    expect((error as GreenApiError).message).toBe(
      'Превышено время ожидания ответа GREEN-API',
    )
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not time out the long-poll: it may wait longer than the timeout', async () => {
    vi.useFakeTimers()
    const answer: { resolve?: (response: Response) => void } = {}
    const fetchMock = vi.fn(
      (_url: string, _init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          answer.resolve = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = new GreenApiClient(credentials)
    let settled = false
    const pending = client.receiveNotification(30).then((value) => {
      settled = true
      return value
    })

    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 5)
    expect(settled).toBe(false)
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.signal?.aborted).toBe(false)

    answer.resolve?.(textResponse(''))
    await expect(pending).resolves.toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps a caller abort an AbortError, not a timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', hangingFetch())

    const client = new GreenApiClient(credentials)
    const controller = new AbortController()
    const pending = client.sendMessage({ chatId: '1@c.us', message: 'x' }, controller.signal)
    controller.abort()

    const error = await pending.catch((e: unknown) => e)
    expect(error).not.toBeInstanceOf(GreenApiError)
    expect((error as Error).name).toBe('AbortError')
  })

  it('does not time out a request that answers in time', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ idMessage: 'BAE5F1' })))

    const client = new GreenApiClient(credentials)
    const pending = client.sendMessage({ chatId: '1@c.us', message: 'x' })
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1)

    await expect(pending).resolves.toBe('BAE5F1')
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('getChatHistory', () => {
  it('returns the bare array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([{ idMessage: '1' }])))

    const client = new GreenApiClient(credentials)
    const history = await client.getChatHistory('1@c.us', 50)
    expect(history).toHaveLength(1)
  })

  it('returns an empty array when the body is not an array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ items: [] })))

    const client = new GreenApiClient(credentials)
    await expect(client.getChatHistory('1@c.us', 50)).resolves.toEqual([])
  })
})

describe('errors', () => {
  it('never leaks the api token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ message: 'token d75b3a66374942c5b3c019c698abc2067e151558acbd412345 is wrong' }, 401),
      ),
    )

    const client = new GreenApiClient(credentials)
    const error = await client.getStateInstance().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(GreenApiError)
    expect((error as GreenApiError).message).toBe('Неверный apiTokenInstance')
    expect((error as GreenApiError).message).not.toContain(credentials.apiTokenInstance)
  })

  it.each([
    [400, 'Message cannot be received because custom webhook url is set in the instance settings', 'В кабинете GREEN-API задан webhookUrl. Очистите его — HTTP-поллинг работает только без него.'],
    [400, 'instance in starting process try later', 'Инстанс запускается или не авторизован.'],
    [403, 'Forbidden', 'Неверный idInstance или адрес API'],
    [403, 'Your account is suspended', 'Аккаунт временно ограничен'],
    [466, 'Payment required', 'Исчерпан лимит тарифа'],
    [469, 'User get contact info limit reached', 'MAX ограничил проверки номеров. Пауза ~2 часа.'],
    [429, 'Too many requests', 'Превышен лимит частоты запросов'],
  ])('maps HTTP %i to a Russian hint', async (status, detail, expected) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: detail }, status)))

    const client = new GreenApiClient(credentials)
    const error = await client.getStateInstance().catch((e: unknown) => e)
    expect((error as GreenApiError).message).toBe(expected)
    expect((error as GreenApiError).status).toBe(status)
  })

  it('retries getStateInstance once on 502', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'Bad Gateway' }, 502))
      .mockResolvedValueOnce(jsonResponse({ stateInstance: 'authorized' }))
    vi.stubGlobal('fetch', fetchMock)

    const client = new GreenApiClient(credentials)
    await expect(client.getStateInstance()).resolves.toBe('authorized')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a non-transient error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: 'nope' }, 401))
    vi.stubGlobal('fetch', fetchMock)

    const client = new GreenApiClient(credentials)
    await expect(client.getStateInstance()).rejects.toBeInstanceOf(GreenApiError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // A mistyped apiUrl makes GREEN-API (or a proxy) answer with an HTML page;
  // echoing it into the red alert is unreadable noise.
  const HTML_ERROR_PAGE = `<html>
<head><title>404 Not Found</title></head>
<body><h1>404 Not Found</h1></body>
</html>`

  it('replaces an HTML error body with a readable Russian message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(textResponse(HTML_ERROR_PAGE, 404)))

    const client = new GreenApiClient(credentials)
    const error = await client.getStateInstance().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(GreenApiError)
    expect((error as GreenApiError).message).toBe(
      'Инстанс не найден. Проверьте apiUrl и idInstance.',
    )
    expect((error as GreenApiError).message).not.toMatch(/<|html/i)
  })

  it('explains a bodyless 404 instead of only naming the status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(textResponse('', 404)))

    const client = new GreenApiClient(credentials)
    const error = await client.getStateInstance().catch((e: unknown) => e)

    expect((error as GreenApiError).message).toBe(
      'Инстанс не найден. Проверьте apiUrl и idInstance.',
    )
    expect((error as GreenApiError).reason).toBeUndefined()
  })

  it('still surfaces a plain-text error body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(textResponse('Parameter idInstance not an integer', 400)),
    )

    const client = new GreenApiClient(credentials)
    const error = await client.getStateInstance().catch((e: unknown) => e)

    expect((error as GreenApiError).message).toBe(
      'Проверьте idInstance и токен инстанса — они должны быть числами/строкой из кабинета GREEN-API.',
    )
    expect((error as GreenApiError).reason).toBe('Parameter idInstance not an integer')
  })

  it('never leaks the api token carried by an HTML error body', async () => {
    // nginx-style pages quote the requested URL, and that URL holds the token.
    const page = `<html><body><h1>404 Not Found</h1><hr><address>nginx
/waInstance1101122334/getStateInstance/${credentials.apiTokenInstance}
</address></body></html>`
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(textResponse(page, 404)))

    const client = new GreenApiClient(credentials)
    const error = await client.getStateInstance().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(GreenApiError)
    expect((error as GreenApiError).message).not.toContain(credentials.apiTokenInstance)
    // The page is dropped outright, so there is no string left to redact.
    expect((error as GreenApiError).reason).toBeUndefined()
    expect(JSON.stringify({ ...(error as GreenApiError) })).not.toContain(
      credentials.apiTokenInstance,
    )
  })
})

describe('helpers', () => {
  it('normalizePhone accepts 11-12 digits and rejects the rest', () => {
    expect(normalizePhone('+7 (900) 123-45-67')).toBe('79001234567')
    expect(normalizePhone('375291234567')).toBe('375291234567')
    expect(normalizePhone('12345')).toBeNull()
    expect(normalizePhone('1234567890123')).toBeNull()
  })

  it('sleep resolves and rejects on abort', async () => {
    await expect(sleep(1)).resolves.toBeUndefined()

    const controller = new AbortController()
    const pending = sleep(1000, controller.signal)
    controller.abort()
    await expect(pending).rejects.toThrow(/abort/i)
  })

  it('withRetry gives up after the configured attempts', async () => {
    let calls = 0
    await expect(
      withRetry(
        async () => {
          calls += 1
          throw new Error('boom')
        },
        { attempts: 3, delayMs: 1 },
      ),
    ).rejects.toThrow('boom')
    expect(calls).toBe(3)
  })
})

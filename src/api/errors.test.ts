import { describe, expect, it } from 'vitest'
import { describeError, extractErrorMessage } from './errors'

const HTML_PAGE = `<html>
<head><title>404 Not Found</title></head>
<body>
<center><h1>404 Not Found</h1></center>
<hr><center>nginx</center>
</body>
</html>`

const INSTANCE_HINT = 'Инстанс не найден. Проверьте apiUrl и idInstance.'
const PARAM_HINT =
  'Проверьте idInstance и токен инстанса — они должны быть числами/строкой из кабинета GREEN-API.'

describe('extractErrorMessage', () => {
  it.each([
    ['a full page', HTML_PAGE],
    ['an uppercase DOCTYPE', '<!DOCTYPE HTML>\n<html><body>Not Found</body></html>'],
    ['a bare head open tag', '<head><title>404 Not Found</title></head>'],
    ['a bare body open tag', '<body>502 Bad Gateway</body>'],
    ['a lowercase html tag', '<html lang="ru">ошибка</html>'],
    ['markup embedded in text', 'nginx returned <html> for this path'],
  ])('refuses to return an HTML document: %s', (_label, body) => {
    expect(extractErrorMessage(body)).toBeUndefined()
  })

  it('tolerates a leading BOM and whitespace around an HTML page', () => {
    expect(extractErrorMessage(`\uFEFF\n   ${HTML_PAGE}`)).toBeUndefined()
  })

  it.each([
    ['Not Found', 'Not Found'],
    ['  Parameter idInstance not an integer  ', 'Parameter idInstance not an integer'],
    ['{"message":"Forbidden","reason":"nope"}', 'Forbidden'],
    ['{"reason":"Not Found"}', 'Not Found'],
    ['{"error":"Bad Gateway"}', 'Bad Gateway'],
    ['{"message":"  "}', undefined],
    ['{"status":false}', undefined],
    ['{}', undefined],
    ['', undefined],
    [undefined, undefined],
  ])('passes %j through as %j', (raw, expected) => {
    expect(extractErrorMessage(raw)).toBe(expected)
  })

  it('refuses an HTML blob smuggled inside a JSON message', () => {
    expect(extractErrorMessage(JSON.stringify({ message: HTML_PAGE }))).toBeUndefined()
  })
})

describe('describeError', () => {
  it('explains a bodyless 404 in Russian', () => {
    expect(describeError(404, undefined)).toEqual({ message: INSTANCE_HINT })
  })

  it('keeps a plain-text 404 body as the reason, not as the headline', () => {
    expect(describeError(404, 'Not Found')).toEqual({
      message: INSTANCE_HINT,
      reason: 'Not Found',
    })
  })

  it('turns an HTML body into a readable message instead of markup', () => {
    const detail = extractErrorMessage(HTML_PAGE)
    const described = describeError(404, detail)

    expect(described.message).toBe(INSTANCE_HINT)
    expect(described.message).not.toContain('<')
    expect(described.reason).toBeUndefined()
  })

  it.each([
    'Parameter idInstance not an integer',
    'Parameter apiTokenInstance not define',
  ])('hints at the credentials for 400 %j', (detail) => {
    expect(describeError(400, detail)).toEqual({ message: PARAM_HINT, reason: detail })
  })

  it('keeps the 401 token hint', () => {
    expect(describeError(401, 'token is wrong')).toEqual({
      message: 'Неверный apiTokenInstance',
      reason: 'token is wrong',
    })
  })

  it('still surfaces a plain-text body on an unmapped status', () => {
    expect(describeError(500, 'Not Found')).toEqual({
      message: 'Not Found',
      reason: 'Not Found',
    })
  })
})

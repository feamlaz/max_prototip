/**
 * Pure presentation helpers for the chat UI.
 *
 * GREEN-API sends timestamps in Unix SECONDS while optimistic local messages
 * use `Date.now()` (ms), so every date helper normalizes the unit first.
 */
import type { ChatMessage, Direction } from '../store/types'
import type { InstanceState } from '../api/types'

const INSTANCE_STATE_LABEL: Record<InstanceState, string> = {
  authorized: 'Авторизован',
  notAuthorized: 'Не авторизован',
  starting: 'Запускается',
  blocked: 'Заблокирован',
  suspended: 'Приостановлен',
  pendingPassword: 'Ждёт пароль',
}

/** Russian label for a GREEN-API instance state. */
export function instanceStateLabel(state: InstanceState | null): string {
  return state === null ? 'неизвестно' : INSTANCE_STATE_LABEL[state]
}

const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const

/** Values below this are seconds; current ms timestamps are ~1.7e12. */
const SECONDS_UPPER_BOUND = 1e12
const MS_PER_DAY = 86_400_000

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** Accepts either Unix seconds (API) or milliseconds (optimistic messages). */
export function toMillis(timestamp: number): number {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return Number.NaN
  return timestamp < SECONDS_UPPER_BOUND ? timestamp * 1000 : timestamp
}

/** `HH:MM` in the local timezone, built by hand so it never depends on ICU. */
export function formatTime(timestamp: number): string {
  const date = new Date(toMillis(timestamp))
  if (Number.isNaN(date.getTime())) return '--:--'
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** Local `YYYY-MM-DD`, used to detect day changes between messages. */
export function dayKey(timestamp: number): string {
  const date = new Date(toMillis(timestamp))
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** «Сегодня» / «Вчера» / «12 марта 2026». */
export function formatDayDivider(timestamp: number, now: number = Date.now()): string {
  const date = new Date(toMillis(timestamp))
  if (Number.isNaN(date.getTime())) return ''
  const startOfDay = (value: Date): number =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()

  // Math.round keeps the result stable across DST transitions.
  const days = Math.round(
    (startOfDay(new Date(toMillis(now))) - startOfDay(date)) / MS_PER_DAY,
  )
  if (days === 0) return 'Сегодня'
  if (days === 1) return 'Вчера'
  return `${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]} ${date.getFullYear()}`
}

/** Up to two letters; falls back to `fallback` for empty input. */
export function initials(source: string | null | undefined, fallback = '?'): string {
  const value = (source ?? '').trim()
  if (value === '') return fallback
  const letters: string[] = []
  // Any non-alphanumeric boundary separates words, so «Демо-контакт» → «ДК».
  for (const word of value.split(/[^\p{L}\p{N}]+/u)) {
    const match = /^[\p{L}\p{N}]/u.exec(word)
    if (match) letters.push(match[0].toLocaleUpperCase('ru-RU'))
    if (letters.length === 2) break
  }
  return letters.length === 0 ? fallback : letters.join('')
}

/** Stable hue for an avatar: same string always yields the same color. */
export function avatarHue(source: string | null | undefined): number {
  const value = source ?? ''
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return Math.abs(hash) % 360
}

export type MessageRow =
  | { kind: 'divider'; key: string; label: string }
  | { kind: 'group'; key: string; direction: Direction; messages: ChatMessage[] }

/**
 * Flattens a sorted message list into dividers + stacked bubble groups.
 * Consecutive messages of the same direction on the same day share a group.
 */
export function buildMessageRows(messages: ChatMessage[]): MessageRow[] {
  const rows: MessageRow[] = []
  let previousDay: string | null = null
  let group: ChatMessage[] = []

  for (const message of messages) {
    const key = dayKey(message.timestamp)
    if (key !== previousDay) {
      // A new day always breaks the run, even if the direction repeats.
      group = []
      rows.push({ kind: 'divider', key: `divider-${key}`, label: formatDayDivider(message.timestamp) })
      previousDay = key
    }
    if (group.length > 0 && group[group.length - 1]?.direction === message.direction) {
      // The row holds this very array, so later pushes land in the group.
      group.push(message)
      continue
    }
    group = [message]
    rows.push({ kind: 'group', key: `group-${message.id}`, direction: message.direction, messages: group })
  }

  return rows
}
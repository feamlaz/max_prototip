import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../store/types'
import {
  avatarHue,
  buildMessageRows,
  dayKey,
  formatDayDivider,
  formatTime,
  initials,
  toMillis,
} from '../format'

describe('toMillis', () => {
  it('treats API seconds as seconds and local milliseconds as milliseconds', () => {
    expect(toMillis(1_700_000_000)).toBe(1_700_000_000_000)
    expect(toMillis(1_700_000_000_000)).toBe(1_700_000_000_000)
  })

  it('neutralizes invalid input', () => {
    expect(toMillis(Number.NaN)).toBeNaN()
    expect(toMillis(-5)).toBeNaN()
    expect(toMillis(0)).toBeNaN()
  })
})

describe('formatTime', () => {
  it('renders HH:MM from seconds and from milliseconds identically', () => {
    const date = new Date(2026, 2, 12, 9, 5)
    const ms = date.getTime()
    expect(formatTime(ms)).toBe('09:05')
    expect(formatTime(Math.floor(ms / 1000))).toBe('09:05')
  })

  it('pads single digits and survives a broken timestamp', () => {
    expect(formatTime(new Date(2026, 0, 2, 23, 59).getTime())).toBe('23:59')
    expect(formatTime(Number.NaN)).toBe('--:--')
  })
})

describe('dayKey / formatDayDivider', () => {
  const march12 = new Date(2026, 2, 12, 10, 30).getTime()

  it('builds a sortable local day key', () => {
    expect(dayKey(march12)).toBe('2026-03-12')
  })

  it('labels today, yesterday and older days in Russian', () => {
    expect(formatDayDivider(march12, march12)).toBe('Сегодня')
    expect(formatDayDivider(march12, new Date(2026, 2, 13, 23, 59).getTime())).toBe('Вчера')
    expect(formatDayDivider(march12, new Date(2026, 2, 14, 10, 30).getTime())).toBe('12 марта 2026')
    expect(formatDayDivider(march12, new Date(2026, 2, 25, 10, 30).getTime())).toBe('12 марта 2026')
    expect(
      formatDayDivider(new Date(2026, 0, 28, 8, 0).getTime(), new Date(2026, 1, 5).getTime()),
    ).toBe('28 января 2026')
  })
})

describe('initials', () => {
  it('takes up to two letters', () => {
    expect(initials('Демо-контакт')).toBe('ДК')
    expect(initials('Анна Мария Петрова')).toBe('АМ')
    expect(initials('MAX')).toBe('M')
    expect(initials('79991234567')).toBe('7')
  })

  it('falls back when there is nothing to show', () => {
    expect(initials(null)).toBe('?')
    expect(initials('   ')).toBe('?')
    expect(initials('!!!')).toBe('?')
    expect(initials(null, 'M')).toBe('M')
  })
})

describe('avatarHue', () => {
  it('is deterministic and inside the hue range', () => {
    expect(avatarHue('Демо-контакт')).toBe(avatarHue('Демо-контакт'))
    const hue = avatarHue('79991234567')
    expect(hue).toBeGreaterThanOrEqual(0)
    expect(hue).toBeLessThan(360)
    expect(Number.isInteger(hue)).toBe(true)
  })

  it('separates different peers and survives an empty key', () => {
    expect(avatarHue('Анна')).not.toBe(avatarHue('Борис'))
    expect(Number.isInteger(avatarHue(null))).toBe(true)
  })
})

function message(
  id: string,
  direction: 'in' | 'out',
  timestamp: number,
): ChatMessage {
  return { id, direction, text: `text-${id}`, timestamp, status: 'read' }
}

describe('buildMessageRows', () => {
  const day1 = new Date(2026, 2, 12, 10, 0).getTime()
  const day2 = new Date(2026, 2, 13, 10, 0).getTime()

  it('inserts one divider per day and groups consecutive same-direction messages', () => {
    const rows = buildMessageRows([
      message('1', 'in', day1),
      message('2', 'in', day1 + 1000),
      message('3', 'out', day1 + 2000),
      message('4', 'in', day2),
    ])

    expect(rows.map((row) => row.kind)).toEqual([
      'divider',
      'group',
      'group',
      'divider',
      'group',
    ])

    const firstGroup = rows[1]
    expect(firstGroup?.kind === 'group' && firstGroup.messages.map((item) => item.id)).toEqual([
      '1',
      '2',
    ])
    expect(rows[0]?.kind === 'divider' && rows[0].label).toBe('12 марта 2026')
  })

  it('returns nothing for an empty history', () => {
    expect(buildMessageRows([])).toEqual([])
  })
})
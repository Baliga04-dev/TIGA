import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatRelativeTime, getSentimentLabel, isGmailSetupError } from './utils'

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it.each([
    ['2026-10-20T11:59:40Z', 'just now'],
    ['2026-10-20T11:45:00Z', '15m ago'],
    ['2026-10-20T09:00:00Z', '3h ago'],
    ['2026-10-17T12:00:00Z', '3d ago'],
  ])('%s is %s', (date, expected) => {
    expect(formatRelativeTime(date)).toBe(expected)
  })

  it('understands the date format Gmail uses', () => {
    expect(formatRelativeTime('Tue, 20 Oct 2026 10:00:00 +0000')).toBe('2h ago')
  })

  it.each(['', 'not a date'])('shows nothing misleading for %j', (bad) => {
    expect(formatRelativeTime(bad)).toBe('')
  })
})

describe('isGmailSetupError', () => {
  it.each([
    ['Gmail is not authorized yet. Run `python gmail_auth.py`', true],
    ['Credentials file not found', true],
    ['Request failed (HTTP 500)', false],
    [null, false],
  ])('%j -> %s', (message, expected) => {
    expect(isGmailSetupError(message)).toBe(expected)
  })
})

describe('getSentimentLabel', () => {
  it('names each sentiment', () => {
    expect([getSentimentLabel('positive'), getSentimentLabel('negative'), getSentimentLabel('neutral')]).toEqual([
      'Positive',
      'Negative',
      'Neutral',
    ])
  })
})

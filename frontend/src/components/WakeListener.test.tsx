import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mock } from '../test/mock'
import { mockMountCalls, renderApp } from '../test/render'

type Handler = ((event: unknown) => void) | null
class FakeRecognition {
  static last: FakeRecognition | null = null
  lang = ''
  continuous = false
  interimResults = false
  onresult: Handler = null
  onend: Handler = null
  onerror: Handler = null
  started = false
  constructor() { FakeRecognition.last = this }
  start() { this.started = true }
  stop() { this.started = false }
  say(text: string) {
    const result = Object.assign([{ transcript: text }], { isFinal: true })
    this.onresult?.({ resultIndex: 0, results: [result] })
  }
}

const reply = (text: string) => ({ reply: text, actions: [], mode: 'builtin', ms: 1 })

beforeEach(() => {
  mockMountCalls()
  ;(window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition
  FakeRecognition.last = null
})
afterEach(() => {
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition
  localStorage.clear()
})

describe('Hey Tiga', () => {
  it('is off until the owner switches it on in Chat', async () => {
    renderApp('/chat')
    const toggle = await screen.findByRole('checkbox', { name: /listen for "hey tiga"/i })
    expect(FakeRecognition.last).toBeNull()
    await userEvent.click(toggle)
    await waitFor(() => expect(FakeRecognition.last?.started).toBe(true))
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Say "Hey Tiga"')
  })

  it('sends what follows the wake phrase to Chat from any page', async () => {
    localStorage.setItem('tiga.wake', 'on')
    const bodies = mock.record('/chat', reply('Two people are waiting.')) as { text: string }[]
    renderApp('/')
    await waitFor(() => expect(FakeRecognition.last?.started).toBe(true))
    act(() => FakeRecognition.last!.say('hey tiga who is waiting on me'))
    expect(await screen.findByText('Two people are waiting.')).toBeInTheDocument()
    expect(bodies[0].text).toBe('who is waiting on me')
  })

  it('after "Hey Tiga" alone, takes the next sentence and ignores ordinary talk', async () => {
    localStorage.setItem('tiga.wake', 'on')
    const bodies = mock.record('/chat', reply('Done.')) as { text: string }[]
    renderApp('/')
    await waitFor(() => expect(FakeRecognition.last?.started).toBe(true))
    act(() => FakeRecognition.last!.say('pass me the tiger balm'))
    act(() => FakeRecognition.last!.say('Hey Tiga'))
    expect(await screen.findByText('Listening for your command…')).toBeInTheDocument()
    act(() => FakeRecognition.last!.say('good morning'))
    await screen.findByText('Done.')
    expect(bodies.map((b) => b.text)).toEqual(['good morning'])
  })
})

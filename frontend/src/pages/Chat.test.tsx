import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse, delay } from 'msw'
import { server } from '../test/server'
import { mock } from '../test/mock'
import { statusOk } from '../test/fixtures'
import { mockMountCalls, renderApp } from '../test/render'

const reply = (text: string) => ({ reply: text, actions: [], mode: 'builtin' })

beforeEach(() => mockMountCalls())

async function openChat() {
  const user = userEvent.setup()
  renderApp('/chat')
  const box = await screen.findByRole('textbox', { name: /message/i })
  return { user, box }
}

describe('Chat', () => {
  it('sends a message with Enter and shows the reply', async () => {
    mock.post('/chat', reply('It is noon, sir.'))
    const { user, box } = await openChat()
    await user.type(box, 'what time is it{Enter}')
    const log = screen.getByRole('log')
    expect(await within(log).findByText('It is noon, sir.')).toBeInTheDocument()
    expect(within(log).getByText('what time is it')).toBeInTheDocument()
    expect(box).toHaveValue('')
  })

  it('keeps typing on a new line with Shift+Enter instead of sending', async () => {
    const bodies = mock.record('/chat', reply('x'))
    const { user, box } = await openChat()
    await user.type(box, 'line one{Shift>}{Enter}{/Shift}line two')
    expect(box).toHaveValue('line one\nline two')
    expect(bodies).toHaveLength(0)
  })

  it('sends earlier messages as history, without timestamps', async () => {
    const bodies = mock.record('/chat', reply('ok')) as { text: string; history: Record<string, unknown>[] }[]
    const { user, box } = await openChat()
    await user.type(box, 'first{Enter}')
    await screen.findByText('ok')
    await user.type(box, 'second{Enter}')
    await vi.waitFor(() => expect(bodies).toHaveLength(2))
    expect(bodies[1].history).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'ok' },
    ])
  })

  it('shows the error and gives the text back when sending fails', async () => {
    mock.post('/chat', { detail: 'model unavailable' }, 500)
    const { user, box } = await openChat()
    await user.type(box, 'hello there{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('model unavailable')
    expect(box).toHaveValue('hello there')
    expect(within(screen.getByRole('log')).queryByText('hello there')).not.toBeInTheDocument()
  })

  it('fills the box from an example without sending it', async () => {
    const bodies = mock.record('/chat', reply('x'))
    const { user, box } = await openChat()
    await user.click(screen.getByRole('button', { name: 'What time is it?' }))
    expect(box).toHaveValue('What time is it?')
    expect(bodies).toHaveLength(0)
  })

  it('clears the conversation', async () => {
    mock.post('/chat', reply('hi sir'))
    const { user, box } = await openChat()
    await user.type(box, 'hello{Enter}')
    await screen.findByText('hi sir')
    await user.click(screen.getByRole('button', { name: /clear/i }))
    expect(screen.queryByText('hi sir')).not.toBeInTheDocument()
  })

  it('copies a message and says so', async () => {
    mock.post('/chat', reply('copy me'))
    const { user, box } = await openChat()
    await user.type(box, 'hello{Enter}')
    await screen.findByText('copy me')
    await user.click(screen.getAllByRole('button', { name: /copy message/i })[1])
    expect(await navigator.clipboard.readText()).toBe('copy me')
    expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument()
  })

  it('shows a thinking indicator while waiting', async () => {
    server.use(
      http.post('*/api/chat', async () => {
        await delay(300)
        return HttpResponse.json(reply('done'))
      }),
    )
    const { user, box } = await openChat()
    await user.type(box, 'hello{Enter}')
    expect(await screen.findByRole('status')).toHaveTextContent(/thinking/i)
    await screen.findByText('done')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('describes the brain and Gmail honestly', async () => {
    mock.get('/status', { ...statusOk, brain: 'openai' })
    await openChat()
    expect((await screen.findAllByText('OpenAI-compatible model')).length).toBeGreaterThan(0)
    expect(screen.queryByText(/gpt-4o/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^connected$/i)).not.toBeInTheDocument()
  })

  it('names Claude when Tiga runs on the subscription', async () => {
    mock.get('/status', { ...statusOk, brain: 'claude' })
    await openChat()
    expect((await screen.findAllByText('Claude (your subscription)')).length).toBeGreaterThan(0)
  })
})

describe('Chat speech', () => {
  function stubSpeech() {
    const utterances: { text: string; onend?: () => void }[] = []
    const synth = {
      speak: vi.fn((u: { text: string }) => utterances.push(u)),
      cancel: vi.fn(),
    }
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true })
    vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; onend?: () => void; constructor(t: string) { this.text = t } })
    return { utterances, synth }
  }

  it('speaks one message and stops when the utterance ends', async () => {
    const { utterances } = stubSpeech()
    mock.post('/chat', reply('listen to this'))
    const { user, box } = await openChat()
    await user.type(box, 'hello{Enter}')
    await screen.findByText('listen to this')
    const buttons = screen.getAllByRole('button', { name: 'Speak message' })
    await user.click(buttons[1])
    expect(utterances.map((u) => u.text)).toEqual(['listen to this'])
    expect(screen.getAllByRole('button', { name: 'Stop speaking' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Speak message' })).toHaveLength(1)
    await vi.waitFor(() => utterances[0].onend?.())
    expect(await screen.findAllByRole('button', { name: 'Speak message' })).toHaveLength(2)
  })

  it('cancels speech when leaving the page', async () => {
    const { synth } = stubSpeech()
    const { user } = await openChat()
    await user.click(screen.getByRole('link', { name: 'Settings' }))
    await screen.findByRole('heading', { level: 1, name: 'Settings' })
    expect(synth.cancel).toHaveBeenCalled()
  })
})

describe('Chat safety', () => {
  it('shows what Tiga did and asks before anything outbound, then confirms on click', async () => {
    mock.post('/chat', {
      reply: 'I need your go-ahead first: book call(topic=pricing). Tap Confirm to do it, or Cancel.',
      mode: 'builtin',
      actions: [
        { tool: 'open_tab', args: {}, result: { ok: true }, ok: true, ms: 1 },
        { tool: 'book_call', args: {}, result: { ok: false, error: 'waiting for your confirmation' }, ok: false, ms: 0,
          status: 'needs_confirmation', pending_id: 'p1', summary: 'book call(topic=pricing)' },
      ],
    })
    const confirmed = mock.record('/actions/p1/confirm', { ok: true, action: { ok: true, result: { ok: true } } })
    const { user, box } = await openChat()
    await user.type(box, 'book a call about pricing{Enter}')
    expect(await screen.findByText('book call(topic=pricing)')).toBeInTheDocument()
    expect(screen.getByText('open tab')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /confirm book call/i }))
    await waitFor(() => expect(confirmed).toHaveLength(1))
    expect(await screen.findByText('Done.')).toBeInTheDocument()
  })

  it('cancelling never confirms', async () => {
    mock.post('/chat', { reply: 'go-ahead?', mode: 'builtin', actions: [
      { tool: 'book_call', args: {}, result: {}, ok: false, ms: 0, status: 'needs_confirmation', pending_id: 'p2', summary: 'book call()' },
    ] })
    const cancelled = mock.record('/actions/p2/cancel', { ok: true })
    const confirmed = mock.record('/actions/p2/confirm', { ok: true })
    const { user, box } = await openChat()
    await user.type(box, 'book{Enter}')
    await user.click(await screen.findByRole('button', { name: /cancel book call/i }))
    await waitFor(() => expect(cancelled).toHaveLength(1))
    expect(confirmed).toHaveLength(0)
  })

  it('can pause and resume Tiga', async () => {
    const calls = mock.record('/assistant', { ok: true, paused: true })
    const { user } = await openChat()
    await user.click(screen.getByRole('button', { name: /pause tiga/i }))
    await waitFor(() => expect(calls).toEqual([{ paused: true }]))
    expect(await screen.findByRole('button', { name: /resume tiga/i })).toHaveAttribute('aria-pressed', 'true')
  })
})


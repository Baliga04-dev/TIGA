import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mock } from '../test/mock'
import { mockMountCalls, renderApp } from '../test/render'

const interview = (over = {}) => ({
  id: 'abc', slots: { purpose: 'a bakery app' }, asked: [], status: 'asking',
  question: { slot: 'user', text: 'Who is the first person who will use this?' }, ...over,
})

beforeEach(() => mockMountCalls())

describe('Prompt Studio', () => {
  it('asks one question at a time and ends with a copyable prompt', async () => {
    const answers = mock.record('/interviews/abc/answer', { ok: true, interview: interview({ status: 'ready', question: null, asked: ['user'] }) })
    mock.post('/interviews', { ok: true, interview: interview() })
    mock.post('/interviews/abc/generate', { ok: true, prompt: '<goal>a bakery app</goal>' })
    const user = userEvent.setup()
    renderApp('/prompts')
    await user.type(screen.getByLabelText(/what do you want to build/i), 'a bakery app')
    await user.click(screen.getByRole('button', { name: /^start$/i }))
    await user.type(await screen.findByLabelText(/who is the first person/i), 'small bakers')
    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(await screen.findByText(/that's enough to go on/i)).toBeInTheDocument()
    expect(answers).toEqual([{ text: 'small bakers' }])
    await user.click(screen.getByRole('button', { name: /generate prompt now/i }))
    expect(await screen.findByLabelText('Generated prompt')).toHaveTextContent('<goal>a bakery app</goal>')
    expect(screen.getByRole('button', { name: /copy prompt/i })).toBeInTheDocument()
  })

  it('lets you skip a question', async () => {
    const answers = mock.record('/interviews/abc/answer', { ok: true, interview: interview({ asked: ['user'] }) })
    mock.post('/interviews', { ok: true, interview: interview() })
    const user = userEvent.setup()
    renderApp('/prompts')
    await user.type(screen.getByLabelText(/what do you want/i), 'a bakery app')
    await user.click(screen.getByRole('button', { name: /^start$/i }))
    await user.click(await screen.findByRole('button', { name: /skip, you decide/i }))
    expect(answers).toEqual([{ text: 'skip' }])
  })

  it('shows a server refusal', async () => {
    mock.post('/interviews', { ok: false, error: 'Describe your idea first' })
    const user = userEvent.setup()
    renderApp('/prompts')
    await user.type(screen.getByLabelText(/what do you want/i), 'abc')
    await user.click(screen.getByRole('button', { name: /^start$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Describe your idea first')
  })
})

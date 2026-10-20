import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mock } from '../test/mock'
import { mockMountCalls, renderApp } from '../test/render'

const report = (ok: boolean) => ({
  ok,
  run_at: '2026-10-20T10:00:00+00:00',
  flow: ['manager', 'dev', 'tester'],
  manager: { status: 'ready', responsibilities: [], next_actions: ['Review tester findings'] },
  dev: { status: 'ready', responsibilities: [] },
  tester: {
    ok,
    status: ok ? 'passed' : 'failed',
    checks: [
      { name: 'backend_import', ok: true, detail: 'FastAPI import succeeded' },
      { name: 'backend_tests', ok, detail: ok ? '106 passed' : '2 failed' },
    ],
  },
})

const research = {
  ok: true,
  topic: 'automation',
  searched_at: '2026-10-20T10:00:00+00:00',
  sources: ['Google News', 'Hacker News'],
  leads: [
    { source: 'Google News', title: 'Acme raises seed round', url: 'https://g.example/1', published: '', client_signal: 'growth or launch signal' },
    { source: 'Hacker News', title: 'Show HN: invoice bot', url: 'https://h.example/2', published: '', client_signal: 'technology demand' },
  ],
  errors: [],
  note: 'Only public feeds are searched.',
}

beforeEach(() => mockMountCalls())

async function open() {
  const user = userEvent.setup()
  renderApp('/agents')
  await screen.findByRole('heading', { name: /manager/i })
  return user
}

describe('Agents', () => {
  it('shows the three agents', async () => {
    await open()
    expect(screen.getByRole('heading', { name: /manager/i })).toBeInTheDocument()
  })

  it('explains when agent status cannot be loaded', async () => {
    mock.get('/agents/status', { detail: 'git is broken' }, 500)
    renderApp('/agents')
    expect(await screen.findByRole('alert')).toHaveTextContent('git is broken')
  })

  it('shows a readable report after a passing cycle', async () => {
    mock.post('/agents/run', report(true) as never)
    const user = await open()
    await user.click(screen.getByRole('button', { name: /run cycle/i }))
    const region = await screen.findByRole('region', { name: /cycle report/i })
    expect(within(region).getByText('Passed', { selector: '[data-status]' })).toBeInTheDocument()
    expect(within(region).getByText('backend_tests')).toBeInTheDocument()
    expect(within(region).getByText('106 passed')).toBeInTheDocument()
    expect(within(region).getByText('Review tester findings')).toBeInTheDocument()
  })

  it('shows a failing cycle as failed, not as an error', async () => {
    mock.post('/agents/run', report(false) as never)
    const user = await open()
    await user.click(screen.getByRole('button', { name: /run cycle/i }))
    const region = await screen.findByRole('region', { name: /cycle report/i })
    expect(within(region).getByText('2 failed')).toBeInTheDocument()
    expect(within(region).getByText('Failed', { selector: '[data-status]' })).toBeInTheDocument()
  })

  it('reports a failed cycle request', async () => {
    mock.post('/agents/run', { detail: 'exploded' }, 500)
    const user = await open()
    await user.click(screen.getByRole('button', { name: /run cycle/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('exploded')
  })

  it('lists research leads with their source and signal', async () => {
    mock.post('/research/leads', research)
    const user = await open()
    await user.clear(screen.getByLabelText(/research topic/i))
    await user.type(screen.getByLabelText(/research topic/i), 'automation')
    await user.click(screen.getByRole('button', { name: /find signals/i }))
    const link = await screen.findByRole('link', { name: /acme raises seed round/i })
    expect(link).toHaveAttribute('href', 'https://g.example/1')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(screen.getByText('growth or launch signal')).toBeInTheDocument()
  })

  it('says which feeds failed when research is partial', async () => {
    mock.post('/research/leads', { ...research, errors: ['Google News: ConnectError'] })
    const user = await open()
    await user.click(screen.getByRole('button', { name: /find signals/i }))
    expect(await screen.findByText(/Google News: ConnectError/)).toBeInTheDocument()
  })

  it('says so when research finds nothing', async () => {
    mock.post('/research/leads', { ...research, leads: [] })
    const user = await open()
    await user.click(screen.getByRole('button', { name: /find signals/i }))
    expect(await screen.findByText(/no public signals found/i)).toBeInTheDocument()
  })

  it('needs both an idea and an outcome before generating', async () => {
    const user = await open()
    const button = screen.getByRole('button', { name: /research and generate/i })
    expect(button).toBeDisabled()
    await user.type(screen.getByLabelText(/^idea/i), 'invoice tool')
    expect(button).toBeDisabled()
    await user.type(screen.getByLabelText(/desired outcome/i), 'get paid faster')
    expect(button).toBeEnabled()
  })

  it('shows the generated prompt and its clarifying questions, and can copy it', async () => {
    mock.post('/prompt/generate', {
      ok: true,
      generated_at: 'now',
      prompt: 'You are a planner. Goal: get paid faster',
      questions: ['Who is the first user?'],
      research,
    })
    const user = await open()
    await user.type(screen.getByLabelText(/^idea/i), 'invoice tool')
    await user.type(screen.getByLabelText(/desired outcome/i), 'get paid faster')
    await user.click(screen.getByRole('button', { name: /research and generate/i }))
    expect(await screen.findByText(/You are a planner/)).toBeInTheDocument()
    expect(screen.getByText('Who is the first user?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /copy prompt/i }))
    expect(await navigator.clipboard.readText()).toBe('You are a planner. Goal: get paid faster')
    expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument()
  })

  it('shows validation messages from the server', async () => {
    mock.post('/prompt/generate', { detail: [{ loc: ['body', 'idea'], msg: 'String should have at least 3 characters' }] }, 422)
    const user = await open()
    await user.type(screen.getByLabelText(/^idea/i), 'abc')
    await user.type(screen.getByLabelText(/desired outcome/i), 'something')
    await user.click(screen.getByRole('button', { name: /research and generate/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('idea: String should have at least 3 characters')
  })

  it('reports how many commits were pushed', async () => {
    mock.post('/github/sync', { ok: true, pushed: true, commits: 2, repository: 'Baliga04-dev/TIGA', branch: 'main', detail: '' })
    const user = await open()
    await user.click(screen.getByRole('button', { name: /push to github/i }))
    expect(await screen.findByRole('status')).toHaveTextContent('Pushed 2 commits to Baliga04-dev/TIGA (main)')
  })

  it('says when there is nothing to push', async () => {
    mock.post('/github/sync', { ok: true, pushed: false, repository: 'Baliga04-dev/TIGA', branch: 'main', detail: 'Nothing to push' })
    const user = await open()
    await user.click(screen.getByRole('button', { name: /push to github/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/nothing to push/i)
  })

  it('shows why a push was refused', async () => {
    mock.post('/github/sync', { ok: false, error: 'There are uncommitted changes; commit or stash them first. Nothing was pushed.' })
    const user = await open()
    await user.click(screen.getByRole('button', { name: /push to github/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/uncommitted changes/i))
  })

  it('shows the working tree state next to the push button', async () => {
    await open()
    expect(screen.getByText(/working tree clean/i)).toBeInTheDocument()
  })
})

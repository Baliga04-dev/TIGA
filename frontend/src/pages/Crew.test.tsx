import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../test/server'
import { mock } from '../test/mock'
import { mockMountCalls, renderApp } from '../test/render'

const issue = (over = {}) => ({
  id: 7, kind: 'bug', title: 'Tester: backend_tests failing', body: '2 failed', status: 'triaged',
  severity: 'high', source: 'tester', occurrences: 3, updated_at: 'x', ...over,
})

beforeEach(() => { mockMountCalls(); mock.get('/skills', { ok: true, items: [] }) })

describe('Crew', () => {
  it('shows open issues with who filed them and how often', async () => {
    mock.get('/issues', { ok: true, items: [issue()] })
    mock.get('/audit', { ok: true, items: [] })
    renderApp('/crew')
    expect(await screen.findByText(/#7 Tester: backend_tests failing/)).toBeInTheDocument()
    expect(screen.getByText(/seen 3 times/)).toBeInTheDocument()
    expect(screen.getByText(/filed by tester/)).toBeInTheDocument()
  })

  it('lets you approve work for Dev', async () => {
    const seen: unknown[] = []
    mock.get('/issues', { ok: true, items: [issue()] })
    mock.get('/audit', { ok: true, items: [] })
    mock.post('/issues/7/transition', () => { seen.push(1); return { ok: true, issue: issue({ status: 'approved' }) } })
    const user = userEvent.setup()
    renderApp('/crew')
    await user.click(await screen.findByRole('button', { name: /approve for dev/i }))
    expect(seen).toHaveLength(1)
  })

  it('offers no way to skip the approval step', async () => {
    mock.get('/issues', { ok: true, items: [issue({ status: 'triaged' })] })
    mock.get('/audit', { ok: true, items: [] })
    renderApp('/crew')
    await screen.findByText(/#7 Tester/)
    expect(screen.queryByRole('button', { name: /mark done/i })).not.toBeInTheDocument()
  })

  it('explains an empty board and shows activity', async () => {
    mock.get('/issues', { ok: true, items: [] })
    mock.get('/audit', { ok: true, items: [{ id: 1, ts: '2026-10-21T10:00:00+00:00', actor: 'user', action: 'issue.transition', entity: 'issue', entity_id: '7', detail: 'triaged -> approved' }] })
    renderApp('/crew')
    expect(await screen.findByText(/triaged -> approved/)).toBeInTheDocument()
    expect(screen.getByText(/nothing open/i)).toBeInTheDocument()
  })

  it('edits a bot skill and saves it', async () => {
    mock.get('/issues', { ok: true, items: [] })
    mock.get('/audit', { ok: true, items: [] })
    mock.get('/skills', { ok: true, items: ['mailer', 'dev'] })
    mock.get('/skills/mailer', { ok: true, name: 'mailer', text: 'old rules' })
    const saved: unknown[] = []
    server.use(http.put('*/api/skills/mailer', async ({ request }) => { saved.push(await request.json()); return HttpResponse.json({ ok: true }) }))
    const user = userEvent.setup()
    renderApp('/crew')
    await screen.findByRole('option', { name: 'mailer' })
    await user.selectOptions(screen.getByLabelText('Skill'), 'mailer')
    const box = await screen.findByLabelText('Instructions for mailer')
    expect(box).toHaveValue('old rules')
    expect(screen.getByRole('button', { name: /save skill/i })).toBeDisabled()
    await user.type(box, ' plus more')
    await user.click(screen.getByRole('button', { name: /save skill/i }))
    expect(saved).toEqual([{ text: 'old rules plus more' }])
  })

  it('runs the R&D bot on demand', async () => {
    mock.get('/issues', { ok: true, items: [] })
    mock.get('/audit', { ok: true, items: [] })
    mock.get('/skills', { ok: true, items: [] })
    mock.post('/rnd/run', { ok: true, proposals: 3 })
    const user = userEvent.setup()
    renderApp('/crew')
    await user.click(await screen.findByRole('button', { name: /run r&d now/i }))
    expect(await screen.findByText(/sent with 3 proposals/i)).toBeInTheDocument()
  })

  it('lets the Dev bot build an approved issue', async () => {
    mock.get('/issues', { ok: true, items: [issue({ status: 'approved' })] })
    mock.get('/audit', { ok: true, items: [] })
    const sent = mock.record('/dev/run', { ok: true, started: true })
    renderApp('/crew')
    expect(await screen.findByText(/never touches main and never merges/)).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: /let the dev bot build it #7/i }))
    expect(sent).toEqual([{ issue_id: 7 }])
    expect(await screen.findByText(/The Dev bot started on #7/)).toBeInTheDocument()
  })

  it('links the pull request and shows why work came back', async () => {
    mock.get('/issues', { ok: true, items: [
      issue({ id: 8, status: 'pr_open', title: 'Kannada greeting', pr_url: 'https://github.com/o/p/pull/9', dev_note: 'Changed it' }),
      issue({ id: 9, status: 'approved', title: 'Faster reports', dev_note: 'backend tests failed: 1 failed' }),
    ] })
    mock.get('/audit', { ok: true, items: [] })
    renderApp('/crew')
    expect(await screen.findByRole('link', { name: 'Review the pull request' })).toHaveAttribute('href', 'https://github.com/o/p/pull/9')
    expect(screen.getByText('Dev bot: backend tests failed: 1 failed')).toBeInTheDocument()
  })

  it('explains what the Dev bot needs before it can work', async () => {
    mock.get('/issues', { ok: true, items: [issue({ status: 'approved' })] })
    mock.get('/audit', { ok: true, items: [] })
    mock.get('/dev', { ok: true, busy: false, runs_today: 0, daily_limit: 2, auto: false, ready: false })
    renderApp('/crew')
    expect(await screen.findByText(/needs GITHUB_REPOSITORY and GITHUB_TOKEN/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /let the dev bot build it/i })).toBeDisabled()
  })
})

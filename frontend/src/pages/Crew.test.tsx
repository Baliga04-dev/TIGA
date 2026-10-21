import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mock } from '../test/mock'
import { mockMountCalls, renderApp } from '../test/render'

const issue = (over = {}) => ({
  id: 7, kind: 'bug', title: 'Tester: backend_tests failing', body: '2 failed', status: 'triaged',
  severity: 'high', source: 'tester', occurrences: 3, updated_at: 'x', ...over,
})

beforeEach(() => mockMountCalls())

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
})

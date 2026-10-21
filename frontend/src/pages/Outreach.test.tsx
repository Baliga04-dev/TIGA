import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mock } from '../test/mock'
import { mockMountCalls, renderApp } from '../test/render'

const item = (over: Record<string, unknown> = {}) => ({
  id: 1, email: 'owner@acme.io', company: 'Acme', lead_url: '', source_note: 'contact page',
  subject: 'Quick idea', body: 'Hi there', status: 'drafted', warnings: '', last_error: '',
  thread_id: '', followup_n: 0, sent_at: '', replied_at: '', ...over,
})

const card = {
  sent_today: 2, sent_week: 5, replies: 3, interested: 1, declined: 1, unsubscribed: 1,
  bounced: 0, followups_sent: 1, awaiting_approval: 1, daily_cap: 5, pipeline: {},
}

function load(items: unknown[] = [item()]) {
  mock.get('/outreach', { ok: true, items })
  mock.get('/outreach/scorecard', { ok: true, scorecard: card })
}

beforeEach(() => mockMountCalls())

describe('Outreach', () => {
  it('leads with the scorecard', async () => {
    load()
    renderApp('/outreach')
    const dl = await screen.findByLabelText('Outreach scorecard')
    expect(within(dl).getByText('2 / 5')).toBeInTheDocument()
    expect(within(dl).getByText('Replies').nextSibling).toHaveTextContent('3')
  })

  it('shows drafts waiting for approval with their source and warnings', async () => {
    load([item({ warnings: 'review: strict-consent region, get consent or skip' })])
    renderApp('/outreach')
    expect(await screen.findByText(/address found via: contact page/i)).toBeInTheDocument()
    expect(screen.getByText(/strict-consent/i)).toBeInTheDocument()
  })

  it('approves a draft and refreshes', async () => {
    const calls: string[] = []
    load()
    mock.post('/outreach/1/approve', () => { calls.push('approve'); return { ok: true, draft: item({ status: 'approved' }) } })
    const user = userEvent.setup()
    renderApp('/outreach')
    await user.click(await screen.findByRole('button', { name: /approve owner@acme.io/i }))
    await waitFor(() => expect(calls).toEqual(['approve']))
  })

  it('must save edits before approving', async () => {
    load()
    const user = userEvent.setup()
    renderApp('/outreach')
    const subject = await screen.findByLabelText('Subject for owner@acme.io')
    await user.type(subject, ' v2')
    expect(screen.getByRole('button', { name: /approve owner@acme.io/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()
  })

  it('explains why nothing was sent', async () => {
    load([item({ status: 'approved' })])
    mock.post('/outreach/send-next', { ok: true, sent: null })
    const user = userEvent.setup()
    renderApp('/outreach')
    await user.click(await screen.findByRole('button', { name: /send next/i }))
    expect(await screen.findByText(/nothing sent/i)).toBeInTheDocument()
  })

  it('surfaces a refusal from the server', async () => {
    load([item({ status: 'approved' })])
    mock.post('/outreach/send-next', { ok: false, error: 'Set a postal address before sending' })
    const user = userEvent.setup()
    renderApp('/outreach')
    await user.click(await screen.findByRole('button', { name: /send next/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/postal address/i)
  })

  it('turns a found lead into a draft form with the source recorded', async () => {
    load([])
    mock.post('/leads/find', {
      ok: true, errors: [],
      leads: [{ title: 'Acme raises seed', url: 'https://n.example/a', source: 'Google News', published: '', score: 7, signals: ['funding'] }],
    })
    const user = userEvent.setup()
    renderApp('/outreach')
    await user.click(await screen.findByRole('button', { name: /find leads/i }))
    await user.click(await screen.findByRole('button', { name: /draft email/i }))
    expect(screen.getByLabelText(/where you found this address/i)).toHaveValue('Google News: Acme raises seed')
  })

  it('shows history with reply statuses', async () => {
    load([item({ id: 2, status: 'interested', email: 'a@a.io' }), item({ id: 3, status: 'unsubscribed', email: 'b@b.io' })])
    renderApp('/outreach')
    expect(await screen.findByText('interested')).toBeInTheDocument()
    expect(screen.getByText('unsubscribed')).toBeInTheDocument()
  })

  it('says so when the server is unreachable', async () => {
    mock.get('/outreach', { detail: 'database locked' }, 500)
    mock.get('/outreach/scorecard', { ok: true, scorecard: card })
    renderApp('/outreach')
    expect(await screen.findByRole('alert')).toHaveTextContent('database locked')
  })
})

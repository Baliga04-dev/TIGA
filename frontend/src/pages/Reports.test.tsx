import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mock } from '../test/mock'
import { mockMountCalls, renderApp } from '../test/render'
import real from '../lib/report.fixtures.json'

const row = (over: Record<string, unknown>) => ({ recipient: '', sent_at: '', delivery_error: 'Gmail is not configured', ...over })
const daily = row({ id: 10, kind: 'daily', report_date: '2026-11-09', subject: '[RED] Tiga daily report 2026-11-09', body: real.daily })
const rnd = row({ id: 11, kind: 'weekly', report_date: '2026-W46', subject: 'Tiga weekly R&D report 2026-W46', body: real.weekly })
const marketing = row({ id: 12, kind: 'marketing', report_date: '2026-W46', subject: 'Tiga marketing: what worked, 2026-W46', body: real.marketing })
const issue = { id: 18, kind: 'idea', title: "Offer a monthly 'site + care' plan", body: '', status: 'open', severity: 'normal', source: 'rnd', occurrences: 1, updated_at: '' }

function load(items: unknown[] = [marketing, rnd, daily], issues: unknown[] = [issue]) {
  mock.get('/reports', { ok: true, items })
  mock.get('/issues', { ok: true, items: issues })
}

beforeEach(() => mockMountCalls())

describe('Reports', () => {
  it('opens the newest report laid out, not as a wall of text', async () => {
    load()
    renderApp('/reports')
    const view = await screen.findByLabelText('Report body')
    expect(within(view).getByRole('heading', { name: 'Tiga marketing: what worked, week to 9 Nov 2026' })).toBeInTheDocument()
    expect(within(view).getByRole('heading', { name: 'Next steps' })).toBeInTheDocument()
    expect(within(view).getByText(/Saved here, not emailed: Gmail is not configured/)).toBeInTheDocument()
  })

  it('separates daily, research and marketing reports', async () => {
    load()
    const user = userEvent.setup()
    renderApp('/reports')
    const nav = await screen.findByRole('navigation', { name: 'Saved reports' })
    await waitFor(() => expect(within(nav).getAllByRole('button')).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: /^Research \d+$/ }))
    expect(within(nav).getAllByRole('button')).toHaveLength(1)
    const view = screen.getByLabelText('Report body')
    expect(within(view).getByText('Research report, Week 46')).toBeInTheDocument()
    const idea = within(view).getByRole('heading', { name: "Offer a monthly 'site + care' plan with a low setup fee" }).closest('article')!
    expect(within(idea).getByText('Business idea')).toBeInTheDocument()
    expect(within(idea).getByText('First step')).toBeInTheDocument()
    expect(within(idea).getByRole('link', { name: /asadfaizee\.is-a\.dev/ })).toHaveAttribute('rel', expect.stringContaining('noreferrer'))
  })

  it('shows a daily report with its status, figures, test results and open issues', async () => {
    load()
    const user = userEvent.setup()
    renderApp('/reports')
    await user.click(await screen.findByRole('button', { name: /^Daily \d+$/ }))
    const view = screen.getByLabelText('Report body')
    expect(within(view).getByText('Needs fixing: GitHub sync failed')).toBeInTheDocument()
    const outreach = within(view).getByRole('region', { name: 'Outreach' })
    expect(within(outreach).getByText('Waiting for your approval').nextSibling).toHaveTextContent('47')
    expect(within(view).getAllByLabelText('Passed')).toHaveLength(2)
    expect(within(view).getByText('No mail went out this week')).toBeInTheDocument()
    await user.click(within(view).getByRole('button', { name: 'Show plain text' }))
    expect(view.querySelector('pre')).toHaveTextContent('OUTREACH')
  })

  it('lists what is waiting for a decision and points to the Crew page', async () => {
    load()
    renderApp('/reports')
    const card = (await screen.findByRole('heading', { name: 'Waiting for your decision (1)' })).closest('section')!
    expect(within(card).getByText("Offer a monthly 'site + care' plan")).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Crew page' })).toHaveAttribute('href', '/crew')
  })

  it('previews today without sending', async () => {
    load([])
    mock.get('/reports/preview', { ok: true, status: 'amber', subject: '[ACTION] Tiga daily report', body: 'Tiga daily report, 2026-11-11\nStatus: AMBER\n\nOUTREACH\nWaiting for your approval: 61', date: '2026-11-11' })
    const user = userEvent.setup()
    renderApp('/reports')
    await user.click(await screen.findByRole('button', { name: /preview/i }))
    const view = await screen.findByLabelText('Report preview')
    expect(view).toHaveTextContent('61')
    expect(within(view).getByText('Needs you')).toBeInTheDocument()
  })

  it('saves the report in the app and says why it was not emailed', async () => {
    load([])
    mock.post('/reports/daily/run', { ok: true, emailed: false, email_error: 'Gmail is not configured' })
    const user = userEvent.setup()
    renderApp('/reports')
    await user.click(await screen.findByRole('button', { name: /build and send now/i }))
    expect(await screen.findByText(/saved here\. it was not emailed: gmail is not configured/i)).toBeInTheDocument()
  })

  it('confirms when a report went out', async () => {
    load([])
    mock.post('/reports/daily/run', { ok: true, emailed: true, email_error: '' })
    const user = userEvent.setup()
    renderApp('/reports')
    await user.click(await screen.findByRole('button', { name: /build and send now/i }))
    await waitFor(() => expect(screen.getByText(/emailed and saved here/i)).toBeInTheDocument())
  })
})

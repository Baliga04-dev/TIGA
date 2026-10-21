import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../test/server'
import { mock } from '../test/mock'
import { gmailNotAuthorized, summaryOk } from '../test/fixtures'
import { mockMountCalls, renderApp } from '../test/render'

beforeEach(() => mockMountCalls())

function stat(label: string) {
  return screen.getByText(label).closest('div')!.parentElement!
}

describe('Dashboard', () => {
  it('shows the email numbers for the week', async () => {
    renderApp('/')
    await waitFor(() => expect(within(stat('Total Emails')).getByText('12')).toBeInTheDocument())
    expect(within(stat('Cold Outreach')).getByText('5')).toBeInTheDocument()
    expect(within(stat('Replies Received')).getByText('3')).toBeInTheDocument()
    expect(within(stat('Positive Responses')).getByText('2')).toBeInTheDocument()
  })

  it('lists topics, action items and positive replies', async () => {
    renderApp('/')
    expect(await screen.findByText('web development')).toBeInTheDocument()
    expect(screen.getByText('Send the pricing sheet to Alex')).toBeInTheDocument()
    expect(screen.getByText('Re: your proposal')).toBeInTheDocument()
  })

  it('explains a Gmail problem and points to Settings instead of showing zeros', async () => {
    mock.post('/email/summary', gmailNotAuthorized)
    renderApp('/')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/not authorized/i)
    expect(within(alert).getByRole('link', { name: /settings/i })).toHaveAttribute('href', '/settings')
  })

  it('reports a server failure', async () => {
    mock.post('/email/summary', { detail: 'boom' }, 500)
    renderApp('/')
    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
  })

  it('reports an unreachable backend', async () => {
    server.use(http.post('*/api/email/summary', () => HttpResponse.error()))
    renderApp('/')
    expect(await screen.findByRole('alert')).toHaveTextContent(/can.t reach the tiga backend/i)
  })

  it('offers quick actions as real links', async () => {
    renderApp('/')
    await screen.findByText('web development')
    expect(screen.getByRole('link', { name: /generate cold email template/i })).toHaveAttribute('href', '/email?template=1')
    expect(screen.getByRole('link', { name: /compose new email/i })).toHaveAttribute('href', '/email?compose=1')
    expect(screen.getByRole('link', { name: /chat with tiga/i })).toHaveAttribute('href', '/chat')
  })

  it('reloads the numbers when Refresh is pressed', async () => {
    renderApp('/')
    await screen.findByText('web development')
    mock.post('/email/summary', { ...summaryOk, total_emails: 99 } as never)
    await userEvent.click(screen.getByRole('button', { name: /refresh/i }))
    await waitFor(() => expect(within(stat('Total Emails')).getByText('99')).toBeInTheDocument())
  })

  it('shows the outreach numbers and latest report even when Gmail is not connected', async () => {
    mock.post('/email/summary', { ok: false, error: 'Gmail is not connected' }, 200)
    mock.get('/outreach/scorecard', { ok: true, scorecard: { sent_today: 2, sent_week: 5, replies: 3, interested: 1, declined: 0, unsubscribed: 0, bounced: 0, followups_sent: 0, awaiting_approval: 4, daily_cap: 5, pipeline: {} } })
    mock.get('/reports', { ok: true, items: [{ id: 1, kind: 'daily', report_date: '2026-10-21', subject: '[ACTION] Tiga daily report 2026-10-21', body: 'OUTREACH\nSent today: 2', recipient: '', sent_at: '', delivery_error: 'Gmail is not configured' }] })
    renderApp('/')
    expect(await screen.findByText(/4 drafts waiting for your approval/i)).toBeInTheDocument()
    expect(screen.getByText('[ACTION] Tiga daily report 2026-10-21')).toBeInTheDocument()
  })
})

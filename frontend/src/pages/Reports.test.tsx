import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mock } from '../test/mock'
import { mockMountCalls, renderApp } from '../test/render'

const row = { id: 1, kind: 'daily', report_date: '2026-10-20', subject: '[OK] Tiga daily report 2026-10-20', body: 'OUTREACH\nSent today: 3', recipient: 'me@work.io', sent_at: 'x', delivery_error: '' }

beforeEach(() => mockMountCalls())

describe('Reports', () => {
  it('lists past reports and opens one', async () => {
    mock.get('/reports', { ok: true, items: [row] })
    const user = userEvent.setup()
    renderApp('/reports')
    await user.click(await screen.findByRole('button', { name: /daily report 2026-10-20/i }))
    expect(screen.getByLabelText('Report body')).toHaveTextContent('Sent today: 3')
  })

  it('previews today without sending', async () => {
    mock.get('/reports', { ok: true, items: [] })
    mock.get('/reports/preview', { ok: true, status: 'amber', subject: '[ACTION] Tiga daily report', body: 'Waiting for your approval: 5', date: '2026-10-21' })
    const user = userEvent.setup()
    renderApp('/reports')
    await user.click(await screen.findByRole('button', { name: /preview/i }))
    expect(await screen.findByLabelText('Report preview')).toHaveTextContent('Waiting for your approval: 5')
  })

  it('saves the report in the app and says why it was not emailed', async () => {
    mock.get('/reports', { ok: true, items: [] })
    mock.post('/reports/daily/run', { ok: true, emailed: false, email_error: 'Gmail is not configured' })
    const user = userEvent.setup()
    renderApp('/reports')
    await user.click(await screen.findByRole('button', { name: /build and send now/i }))
    expect(await screen.findByText(/saved here\. it was not emailed: gmail is not configured/i)).toBeInTheDocument()
  })

  it('confirms when a report went out', async () => {
    mock.get('/reports', { ok: true, items: [] })
    mock.post('/reports/daily/run', { ok: true, emailed: true, email_error: '' })
    const user = userEvent.setup()
    renderApp('/reports')
    await user.click(await screen.findByRole('button', { name: /build and send now/i }))
    await waitFor(() => expect(screen.getByText(/emailed and saved here/i)).toBeInTheDocument())
  })
})

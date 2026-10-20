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
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../test/server'
import { mock } from '../test/mock'
import { gmailNotAuthorized, statusOk, summaryOk } from '../test/fixtures'
import { mockMountCalls, renderApp } from '../test/render'

const ENV = '# Tiga\nOPENAI_API_KEY=\nHOST=127.0.0.1\n'

beforeEach(() => {
  mockMountCalls()
  server.use(http.get('*/api/env-example', () => HttpResponse.text(ENV)))
})

describe('Settings', () => {
  it('shows the .env template served by the backend', async () => {
    renderApp('/settings')
    const block = await screen.findByLabelText(/environment template/i)
    expect(block).toHaveTextContent('OPENAI_API_KEY=')
    expect(block).toHaveTextContent('HOST=127.0.0.1')
  })

  it('copies the template and confirms in the page, never with an alert', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const user = userEvent.setup()
    renderApp('/settings')
    await screen.findByLabelText(/environment template/i)
    await user.click(screen.getByRole('button', { name: /copy \.env\.example/i }))
    expect(await navigator.clipboard.readText()).toBe(ENV)
    expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument()
    expect(alert).not.toHaveBeenCalled()
  })

  it('says when the template cannot be loaded', async () => {
    server.use(http.get('*/api/env-example', () => new HttpResponse(null, { status: 404 })))
    renderApp('/settings')
    expect(await screen.findByRole('alert')).toHaveTextContent(/\.env\.example/i)
  })

  it('does not print anyone\'s personal address', async () => {
    renderApp('/settings')
    await screen.findByLabelText(/environment template/i)
    expect(screen.queryByText(/ymitigaa/i)).not.toBeInTheDocument()
  })

  it('tells the user to add credentials.json when it is missing, and disables the test', async () => {
    mock.get('/status', { ...statusOk, gmail_configured: false })
    renderApp('/settings')
    expect(await screen.findByText(/credentials file missing/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /test connection/i })).toBeDisabled()
    expect(screen.getByText(/add credentials\.json first/i)).toBeInTheDocument()
  })

  it('does not call Gmail connected just because the credentials file exists', async () => {
    renderApp('/settings')
    expect(await screen.findByText(/credentials found/i)).toBeInTheDocument()
    expect(screen.queryByText(/^connected$/i)).not.toBeInTheDocument()
    expect(screen.getAllByText(/python gmail_auth\.py/).length).toBeGreaterThan(0)
  })

  it('reports a successful connection test', async () => {
    mock.post('/email/summary', { ...summaryOk, total_emails: 7 } as never)
    const user = userEvent.setup()
    renderApp('/settings')
    await user.click(await screen.findByRole('button', { name: /test connection/i }))
    expect(await screen.findByRole('status')).toHaveTextContent('Connected. Read 7 emails from the last 24 hours.')
  })

  it('reports why the connection test failed', async () => {
    mock.post('/email/summary', gmailNotAuthorized)
    const user = userEvent.setup()
    renderApp('/settings')
    await user.click(await screen.findByRole('button', { name: /test connection/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/not authorized yet/i)
  })

  it('describes the active brain without naming a model it may not be using', async () => {
    mock.get('/status', { ...statusOk, brain: 'openai' })
    renderApp('/settings')
    const row = (await screen.findByText('Brain')).parentElement!
    expect(within(row).getByText('OpenAI-compatible model')).toBeInTheDocument()
    expect(screen.queryByText(/gpt-4o/i)).not.toBeInTheDocument()
  })

  it('shows the configured repository and version', async () => {
    renderApp('/settings')
    expect(await screen.findByText('Baliga04-dev/TIGA')).toBeInTheDocument()
    expect(screen.getByText('0.2.0')).toBeInTheDocument()
  })
})

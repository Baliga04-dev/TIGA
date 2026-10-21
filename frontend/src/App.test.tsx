import { describe, expect, it, beforeEach } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockMountCalls, renderApp } from './test/render'

beforeEach(() => mockMountCalls())

describe('app shell', () => {
  it.each(['/', '/email', '/chat', '/agents', '/settings'])('renders one main area and one navigation on %s', async (path) => {
    renderApp(path)
    expect(await screen.findAllByRole('main')).toHaveLength(1)
    expect(screen.getAllByRole('navigation')).toHaveLength(1)
  })

  it('links to every page from the navigation', async () => {
    renderApp('/')
    const nav = await screen.findByRole('navigation')
    const names = within(nav).getAllByRole('link').map((a) => a.textContent)
    expect(names).toEqual(['Dashboard', 'Email Bot', 'Outreach', 'Tiga Chat', 'Agents', 'Settings'])
  })

  it('marks the current page in the navigation', async () => {
    renderApp('/chat')
    const nav = await screen.findByRole('navigation')
    expect(within(nav).getByRole('link', { name: 'Tiga Chat' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current')
  })

  it('navigates between pages without a reload', async () => {
    renderApp('/')
    await userEvent.click(await screen.findByRole('link', { name: 'Settings' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
  })

  it('shows a not-found page with a way back', async () => {
    renderApp('/nope')
    expect(await screen.findByRole('heading', { name: /page not found/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toHaveAttribute('href', '/')
  })
})

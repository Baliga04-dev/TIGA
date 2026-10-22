import { describe, expect, it, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
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
    expect(names).toEqual(['Dashboard', 'Tiga Chat', 'Prospects', 'Outreach', 'Pipeline', 'Email Bot', 'Prompts', 'Reports', 'Crew', 'Agents', 'AI usage', 'Settings'])
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

describe('theme', () => {
  it('toggles dark mode, remembers it, and can switch back', async () => {
    const user = userEvent.setup()
    localStorage.removeItem('tiga-theme')
    renderApp('/')
    const toDark = (await screen.findAllByRole('button', { name: /switch to dark theme/i }))[0]
    await user.click(toDark)
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('tiga-theme')).toBe('dark')
    await user.click(screen.getAllByRole('button', { name: /switch to light theme/i })[0])
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})

describe('reminders', () => {
  it('shows a due reminder on any page and closes it', async () => {
    const { mock } = await import('./test/mock')
    mock.get('/reminders/due', { ok: true, items: [{ id: 9, text: 'call Sri Bakery', due_at: 'x', status: 'pending' }] })
    const done = mock.record('/reminders/9/done', { ok: true })
    const user = userEvent.setup()
    renderApp('/chat')
    const box = await screen.findByLabelText('Due reminders')
    expect(within(box).getByRole('alert')).toHaveTextContent('call Sri Bakery')
    await user.click(within(box).getByRole('button', { name: /done call sri bakery/i }))
    await waitFor(() => expect(done).toHaveLength(1))
  })
})


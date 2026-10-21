import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mock } from '../test/mock'
import { mockMountCalls, renderApp } from '../test/render'

const p = (over = {}) => ({
  id: 1, source: 'osm', name: 'Sri Bakery', category: 'bakery', website: 'https://sribakery.in', email: '',
  email_source: '', phone: '', address: '', link: '', title: '', signals: [], problems: ['no_https'], score: 3,
  status: 'needs_contact', note: 'no email published on the site', ...over,
})

const status = { ok: true, counts: { drafted: 4, ready: 1, needs_contact: 2, no_contact: 600 }, last: { phase: 'collect', at: '2026-10-21T18:00', errors: [] }, schedule: 'Collects 16:00-02:00', enabled: true }

beforeEach(() => {
  mockMountCalls()
  mock.get('/analyst/status', status)
})

describe('Prospects', () => {
  it('shows overnight counts and links to the drafts', async () => {
    mock.get('/prospects', { ok: true, items: [], counts: {} })
    renderApp('/prospects')
    expect(await screen.findByRole('link', { name: /review drafts/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Prospect counts')).toHaveTextContent('600')
  })

  it('splits prospects into needs-an-email and call-or-WhatsApp', async () => {
    mock.get('/prospects', { ok: true, counts: {}, items: [p(), p({ id: 2, name: 'Phone Shop', website: '', phone: '080 1234 5678', problems: ['no_website'] })] })
    renderApp('/prospects')
    expect(await screen.findByText('not secure (no HTTPS)')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /needs an email \(1\)/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /call or whatsapp \(1\)/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /whatsapp phone shop/i })).toHaveAttribute('href', 'https://wa.me/918012345678')
  })

  it('drafts as soon as you paste the email you found', async () => {
    mock.get('/prospects', { ok: true, counts: {}, items: [p()] })
    const sent = mock.record('/prospects/1/contact', { ok: true, draft: {} })
    const user = userEvent.setup()
    renderApp('/prospects')
    await user.type(await screen.findByLabelText(/email you found for sri bakery/i), 'orders@sribakery.in')
    await user.click(screen.getByRole('button', { name: /draft it for sri bakery/i }))
    await waitFor(() => expect(sent).toEqual([{ email: 'orders@sribakery.in' }]))
    expect(await screen.findByText(/in your approval inbox/i)).toBeInTheDocument()
  })

  it('can run the night shift on demand', async () => {
    mock.get('/prospects', { ok: true, counts: {}, items: [] })
    mock.post('/analyst/run', { ok: true, result: { phase: 'collect', new: 12, checked: 5, errors: [] } })
    const user = userEvent.setup()
    renderApp('/prospects')
    await user.click(await screen.findByRole('button', { name: /collect now/i }))
    expect(await screen.findByText(/collected 12 new businesses and checked 5 websites/i)).toBeInTheDocument()
  })

  it('credits OpenStreetMap', async () => {
    mock.get('/prospects', { ok: true, counts: {}, items: [] })
    renderApp('/prospects')
    expect(await screen.findByRole('link', { name: /openstreetmap contributors/i })).toBeInTheDocument()
  })
})

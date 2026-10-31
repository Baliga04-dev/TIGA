import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mock } from '../test/mock'
import { mockMountCalls, renderApp } from '../test/render'

const gateOk = { ok: true, reason: '' }
const contact = (over = {}) => ({
  id: 1, name: 'Kavya Rao', business: '', category: '', phone: '919900127458', email: '', area: '', source: 'warm',
  source_detail: 'college friend', owner_published: false, prospect_id: null, consent: {}, notice_at: '', dnc: false,
  dnc_reason: '', note: '', created_at: 'x', updated_at: 'x', gates: { whatsapp: gateOk, call: gateOk, email: gateOk },
  last_out_at: '', last_in_at: '', visits: 0, last_outcome: '', ...over,
})
const week = (start: string, over = {}) => ({
  start, warm_sent: 0, visits: 0, conversations: 0, interested: 0, messages_in: 0, consents: 0, proposals: 0, won: 0, revenue: 0, ...over,
})
const stop = (over = {}) => ({
  id: 7, name: 'Sri Ganesh Bakery', category: 'bakery', address: '11th Main, Jayanagar', website: '', phone: '',
  problems: [], why: ["There's no website on your map listing."], ref: 'T7', walk_m: 220, ...over,
})

beforeEach(() => {
  mockMountCalls()
  mock.get('/marketing/scorecard', { ok: true, enough_data: false, weeks: [week('2026-10-26', { warm_sent: 3, visits: 2, conversations: 1 }), week('2026-10-19'), week('2026-10-12'), week('2026-10-05')] })
  mock.get('/marketing/localities', { ok: true, items: ['Jayanagar', 'Malleshwaram'] })
  mock.get('/marketing/followups', { ok: true, items: [], sent_this_week: 0, weekly_cap: 10 })
})

describe('Marketing', () => {
  it('lists follow-ups owed after visits and sends the drafted demo through WhatsApp', async () => {
    const owner = contact({ id: 5, name: 'Suresh Rao', business: 'Sri Ganesh Bakery', source: 'walk_in', consent: { whatsapp: { at: 'x', how: 'asked in person' } } })
    mock.get('/marketing/followups', { ok: true, sent_this_week: 3, weekly_cap: 10, items: [
      { contact: owner, visit_at: new Date(Date.now() - 50 * 3_600_000).toISOString(), overdue: true, text: 'Hi Suresh, here is the bakery demo' },
    ] })
    const asked = mock.record('/marketing/contacts/5/whatsapp', { ok: true, url: 'https://wa.me/919886044217?text=Hi' })
    const opened = vi.spyOn(window, 'open').mockReturnValue(null)
    const user = userEvent.setup()
    renderApp('/marketing')
    expect(await screen.findByRole('heading', { name: 'Follow-ups owed (1)' })).toBeInTheDocument()
    expect(screen.getByText('Over 48 hours')).toBeInTheDocument()
    expect(screen.getByText(/3 of 10 demo follow-ups sent this week/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /send the demo to sri ganesh bakery/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Message Suresh Rao' })
    expect(within(dialog).getByLabelText('Message')).toHaveValue('Hi Suresh, here is the bakery demo')
    await user.click(within(dialog).getByRole('button', { name: /open whatsapp/i }))
    await waitFor(() => expect(asked[0]).toEqual({ text: 'Hi Suresh, here is the bakery demo' }))
    opened.mockRestore()
  })

  it('opens on the week with counts, and says when there is too little data', async () => {
    renderApp('/marketing')
    const table = await screen.findByRole('table')
    expect(within(table).getByRole('row', { name: /messages to people you know/i })).toHaveTextContent('3')
    expect(screen.getByText(/fewer than 5 conversations/i)).toBeInTheDocument()
  })

  it('moves between tabs with the arrow keys', async () => {
    mock.get('/marketing/contacts', { ok: true, items: [] })
    const user = userEvent.setup()
    renderApp('/marketing')
    const first = await screen.findByRole('tab', { name: 'This week' })
    first.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'My network' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText(/nobody here yet/i)).toBeInTheDocument()
  })

  it('drafts a personal message, opens WhatsApp only through the gate, then records it as sent', async () => {
    mock.get('/marketing/contacts', { ok: true, items: [contact()] })
    mock.get('/marketing/contacts/1/draft', { ok: true, text: 'Hi Kavya, a few sites I made: https://x/demos/' })
    const asked = mock.record('/marketing/contacts/1/whatsapp', { ok: true, url: 'https://wa.me/919900127458?text=Hi' })
    const touches = mock.record('/marketing/contacts/1/touches', { ok: true, touch: {} })
    const opened = vi.spyOn(window, 'open').mockReturnValue(null)
    const user = userEvent.setup()
    renderApp('/marketing?tab=network')
    await user.click(await screen.findByRole('button', { name: /write message to kavya rao/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Message Kavya Rao' })
    await waitFor(() => expect(within(dialog).getByLabelText('Message')).toHaveValue('Hi Kavya, a few sites I made: https://x/demos/'))
    expect(within(dialog).getByRole('button', { name: 'I sent it' })).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: /open whatsapp/i }))
    await waitFor(() => expect(opened).toHaveBeenCalledWith('https://wa.me/919900127458?text=Hi', '_blank', 'noopener,noreferrer'))
    expect(asked[0]).toEqual({ text: 'Hi Kavya, a few sites I made: https://x/demos/' })
    await user.click(within(dialog).getByRole('button', { name: 'I sent it' }))
    await waitFor(() => expect(touches[0]).toEqual({ channel: 'whatsapp', direction: 'out', kind: 'message' }))
    opened.mockRestore()
  })

  it('shows why WhatsApp is refused', async () => {
    mock.get('/marketing/contacts', { ok: true, items: [contact()] })
    mock.get('/marketing/contacts/1/draft', { ok: true, text: 'Hi Kavya' })
    mock.post('/marketing/contacts/1/whatsapp', { ok: false, error: "It's 10:30PM in Bengaluru. Friends and family are contacted between 9am and 9pm." })
    const user = userEvent.setup()
    renderApp('/marketing?tab=network')
    await user.click(await screen.findByRole('button', { name: /write message to kavya rao/i }))
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(within(dialog).getByLabelText('Message')).toHaveValue('Hi Kavya'))
    await user.click(within(dialog).getByRole('button', { name: /open whatsapp/i }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('between 9am and 9pm')
  })

  it('plans a walk with printable sheets and logs a visit with what they agreed to', async () => {
    mock.get('/marketing/route', { ok: true, locality: 'Jayanagar', stops: [stop()], without_coordinates: 3, total_m: 220, minutes: 3 })
    const visits = mock.record('/marketing/visits', { ok: true, contact: contact({ source: 'walk_in' }) })
    const user = userEvent.setup()
    renderApp('/marketing?tab=walk-ins')
    await waitFor(() => expect(screen.getByLabelText('Neighbourhood')).toHaveValue('Jayanagar'))
    await user.click(screen.getByRole('button', { name: /plan the route/i }))
    expect(await screen.findByText('Sri Ganesh Bakery')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /audit sheet for sri ganesh bakery/i })).toHaveAttribute('href', '/api/marketing/print/audit/7')
    expect(screen.getByRole('link', { name: /print the route sheet/i }).getAttribute('href')).toContain('locality=Jayanagar')
    expect(screen.getByText(/3 prospects have no map position yet/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /log visit to sri ganesh bakery/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Visit: Sri Ganesh Bakery' })
    await user.click(within(dialog).getByRole('button', { name: /save the visit/i }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Choose how the visit went')
    await user.click(within(dialog).getByRole('radio', { name: 'Interested' }))
    await user.click(within(dialog).getByRole('checkbox', { name: 'WhatsApp' }))
    await user.click(within(dialog).getByRole('button', { name: /save the visit/i }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Write the number they gave you')
    await user.type(within(dialog).getByLabelText('Number they gave you'), '98860 44217')
    await user.click(within(dialog).getByRole('button', { name: /save the visit/i }))
    await waitFor(() => expect(visits[0]).toMatchObject({ prospect_id: 7, outcome: 'interested', phone: '98860 44217', consent: ['whatsapp'], dnc: false }))
  })

  it('lists contacts with what they agreed to, and confirms before do-not-contact', async () => {
    const refused = { ok: false, reason: 'No permission to WhatsApp Ramesh yet.' }
    mock.get('/marketing/contacts', { ok: true, items: [contact({ id: 2, name: 'Ramesh', business: 'Sri Ganesh Bakery', source: 'map', gates: { whatsapp: refused, call: refused, email: refused } })] })
    const dnc = mock.record('/marketing/contacts/2/dnc', { ok: true, contact: contact({ id: 2, dnc: true }) })
    const user = userEvent.setup()
    renderApp('/marketing?tab=contacts')
    expect(await screen.findByText('No permission yet')).toBeInTheDocument()
    expect(screen.getByText(/whatsapp: no permission to whatsapp ramesh yet/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /do not contact ramesh/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Never contact Ramesh?' })
    await user.click(within(dialog).getByRole('button', { name: 'Do not contact' }))
    await waitFor(() => expect(dnc).toHaveLength(1))
  })
})

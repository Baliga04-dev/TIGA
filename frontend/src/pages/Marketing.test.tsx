import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../test/server'
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
  mock.get('/marketing/asks', { ok: true, review_link: true, items: [] })
  mock.get('/marketing/best-localities', { ok: true, items: [{ locality: 'Malleshwaram', shops: 42 }, { locality: 'Jayanagar', shops: 17 }] })
  mock.get('/marketing/what-worked', { ok: true, channels: [], experiment: 'Do 10 walk-ins on one street this week.', next_steps: ['Log every visit'], retire: ['Cold email'], enough_data: false })
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
    expect(await screen.findByText('Do 10 walk-ins on one street this week.')).toBeInTheDocument()
    expect(screen.getByText(/rest for now/i).parentElement).toHaveTextContent('Cold email')
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

  it('works out the commission maths for a restaurant and links a printout', async () => {
    const asked: string[] = []
    server.use(http.get('*/api/marketing/commission', ({ request }) => {
      asked.push(new URL(request.url).search)
      return HttpResponse.json({ ok: true, orders: 600, average: 350, commission_pct: 25, direct_share_pct: 20, site_price: 15000,
        app_sales: 210000, commission: 52500, saved_monthly: 10500, saved_yearly: 126000, payback_months: 2 })
    }))
    const user = userEvent.setup()
    renderApp('/marketing?tab=calculator')
    await user.type(await screen.findByLabelText('Restaurant (for the printout)'), 'Udupi Tiffins')
    await user.click(screen.getByRole('button', { name: /work it out/i }))
    expect(await screen.findByText('₹52,500')).toBeInTheDocument()
    expect(screen.getByText('2 months')).toBeInTheDocument()
    expect(asked[0]).toContain('orders=600')
    expect(screen.getByRole('link', { name: /print a one-pager/i }).getAttribute('href')).toContain('shop=Udupi+Tiffins')
  })

  it('saves an owner interview with a rising price ladder and shows the fair range', async () => {
    const offers = [{ id: 'basic_site', label: 'A basic website: one page' }, { id: 'photos', label: 'Photo editing (per photo)' }]
    const guide = [{ id: 'find_you', question: 'How do new customers find you today?' }]
    const empty = { count: 0, goal: 15, by_category: {}, offers: { basic_site: { answers: 0, range: null }, photos: { answers: 0, range: null } } }
    mock.get('/marketing/interviews', { ok: true, items: [], summary: empty, guide, offers })
    const saved = mock.record('/marketing/interviews', { ok: true, interview: {} })
    const user = userEvent.setup()
    renderApp('/marketing?tab=interviews')
    await user.type(await screen.findByLabelText('Shop'), 'Sri Ganesh Bakery')
    await user.selectOptions(screen.getByLabelText('Kind of shop'), 'bakery')
    await user.type(screen.getByLabelText('How do new customers find you today?'), 'Word of mouth')
    await user.type(screen.getByLabelText('A basic website: A bargain'), '5000')
    await user.type(screen.getByLabelText('A basic website: Getting expensive'), '9000')
    mock.get('/marketing/interviews', { ok: true, items: [], guide, offers,
      summary: { ...empty, count: 1, by_category: { bakery: 1 }, offers: { ...empty.offers, basic_site: { answers: 1, range: [5000, 9000] } } } })
    await user.click(screen.getByRole('button', { name: /save the interview/i }))
    await waitFor(() => expect(saved[0]).toEqual({ business: 'Sri Ganesh Bakery', category: 'bakery',
      answers: { find_you: 'Word of mouth' }, prices: { basic_site: { bargain: 5000, expensive: 9000 }, photos: {} } }))
    expect(await screen.findByText('₹5,000 to ₹9,000')).toBeInTheDocument()
  })

  it('lists the asks owed to paid clients and marks one done', async () => {
    const client = contact({ id: 9, name: 'Ravi Kumar', business: 'Sri Bakery', source: 'client' })
    mock.get('/marketing/asks', { ok: true, review_link: false, items: [
      { deal_id: 3, company: 'Sri Bakery', kind: 'review', due: '2026-10-31T06:00:00+00:00', text: 'Hi Ravi, a Google review would help', contact: client },
    ] })
    const done = mock.record('/marketing/asks/3/review/done', { ok: true })
    const user = userEvent.setup()
    renderApp('/marketing')
    expect(await screen.findByRole('heading', { name: 'Asks owed to clients (1)' })).toBeInTheDocument()
    expect(screen.getByText(/add your google review link/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /done google review request for sri bakery/i }))
    await waitFor(() => expect(done).toHaveLength(1))
  })

  it('ranks neighbourhoods by shops left, and plans from where the owner is standing', async () => {
    const asked: string[] = []
    server.use(http.get('*/api/marketing/route', ({ request }) => {
      const q = new URL(request.url).searchParams
      asked.push(q.toString())
      return HttpResponse.json({ ok: true, locality: q.get('lat') ? 'Where you are' : q.get('locality'), stops: [stop()], without_coordinates: 0, total_m: 220, minutes: 3 })
    }))
    const geo = { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: 12.931, longitude: 77.584 } } as GeolocationPosition) }
    Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true })
    const user = userEvent.setup()
    renderApp('/marketing?tab=walk-ins')
    const ranking = await screen.findByRole('region', { name: 'Where the shops are' })
    await user.click(within(ranking).getByRole('button', { name: /malleshwaram/i }))
    await waitFor(() => expect(asked[0]).toContain('locality=Malleshwaram'))
    await user.click(screen.getByRole('button', { name: /from where i am/i }))
    await waitFor(() => expect(asked[1]).toContain('lat=12.931'))
    expect(await screen.findByText(/in Where you are/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /print every audit sheet \(1\)/i }).getAttribute('href')).toContain('lon=77.584')
  })
})

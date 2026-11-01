import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../test/server'
import { mock } from '../test/mock'
import { mockMountCalls, renderApp } from '../test/render'

const deal = (over = {}) => ({
  id: 1, email: 'ravi@sri.in', contact: 'Ravi', company: 'Sri Bakery', phone: '', service: 'Website', stage: 'interested',
  amount: 20000, advance_paid: 0, balance_paid: 0, minutes_logged: 0, notes: '', paid_at: '', updated_at: 'x', ...over,
})
const money = { pipeline_value: 20000, advance_due: 0, balance_due: 0, paid_this_month: 8000, open_deals: 1 }

beforeEach(() => mockMountCalls())

describe('Pipeline', () => {
  it('shows money totals in rupees and deals in their stage', async () => {
    mock.get('/deals', { ok: true, items: [deal(), deal({ id: 2, company: 'Glow Salon', stage: 'won' })], money })
    renderApp('/pipeline')
    expect(await screen.findByLabelText('Money')).toHaveTextContent('₹20,000')
    expect(within(screen.getByRole('region', { name: 'Won' })).getByText('Glow Salon', { selector: 'p' })).toBeInTheDocument()
  })

  it('moves a deal forward', async () => {
    mock.get('/deals', { ok: true, items: [deal()], money })
    const moves = mock.record('/deals/1/move', { ok: true, deal: deal({ stage: 'call_booked' }) })
    const user = userEvent.setup()
    renderApp('/pipeline')
    await user.click(await screen.findByRole('button', { name: /call booked for sri bakery/i }))
    await waitFor(() => expect(moves).toEqual([{ stage: 'call_booked' }]))
  })

  it('records the 50% advance on a won deal', async () => {
    mock.get('/deals', { ok: true, items: [deal({ stage: 'won' })], money })
    const paid = mock.record('/deals/1/payment', { ok: true, deal: deal({ stage: 'won', advance_paid: 10000 }) })
    const user = userEvent.setup()
    renderApp('/pipeline')
    await user.click(await screen.findByRole('button', { name: /advance received from sri bakery/i }))
    await waitFor(() => expect(paid).toEqual([{ kind: 'advance', amount: 10000 }]))
  })

  it('adds a deal by hand', async () => {
    mock.get('/deals', { ok: true, items: [], money })
    const created = mock.record('/deals', { ok: true, deal: deal() })
    const user = userEvent.setup()
    renderApp('/pipeline')
    await user.type(await screen.findByLabelText('Client email'), 'new@shop.in')
    await user.type(screen.getByLabelText('Price (₹)'), '15000')
    await user.click(screen.getByRole('button', { name: /add deal/i }))
    await waitFor(() => expect(created).toEqual([{ email: 'new@shop.in', company: '', service: '', amount: 15000 }]))
  })

  it('writes a proposal from the price list and says where the email went', async () => {
    mock.get('/deals', { ok: true, items: [deal()], money })
    const sent = mock.record('/deals/1/proposal', { ok: true, document: { id: 5, total: 18000 }, draft: { id: 9 } })
    const user = userEvent.setup()
    renderApp('/pipeline')
    await user.click(await screen.findByRole('button', { name: /proposal for sri bakery/i }))
    const dialog = await screen.findByRole('dialog')
    await user.clear(within(dialog).getByLabelText(/quantity of business website/i))
    await user.type(within(dialog).getByLabelText(/quantity of business website/i), '1')
    await user.clear(within(dialog).getByLabelText(/quantity of photo editing/i))
    await user.type(within(dialog).getByLabelText(/quantity of photo editing/i), '20')
    expect(dialog).toHaveTextContent('₹18,000')
    await user.click(within(dialog).getByRole('button', { name: /write proposal/i }))
    await waitFor(() => expect(sent).toEqual([{ items: [{ rate_id: 'business_site', qty: 1 }, { rate_id: 'photo_edit', qty: 20 }] }]))
    expect(await screen.findByText(/approve the email on the outreach page/i)).toBeInTheDocument()
  })

  it('offers the advance invoice on a won deal and links issued documents', async () => {
    mock.get('/deals', { ok: true, items: [deal({ stage: 'won' })], money })
    mock.get('/deals/:id/documents', { ok: true, items: [{ id: 3, kind: 'invoice', number: 'INV-2026-0001', created_at: 'x' }] })
    const inv = mock.record('/deals/1/invoice', { ok: true, document: { id: 4, number: 'INV-2026-0002', amount: 10000 }, draft: { id: 1 } })
    const user = userEvent.setup()
    renderApp('/pipeline')
    expect(await screen.findByRole('link', { name: 'INV-2026-0001' })).toHaveAttribute('href', '/api/documents/3')
    await user.click(screen.getByRole('button', { name: /advance invoice for sri bakery/i }))
    await waitFor(() => expect(inv).toEqual([{ kind: 'advance' }]))
  })

  it('prints a handover sheet for a delivered site', async () => {
    mock.get('/deals', { ok: true, items: [deal({ stage: 'delivered', amount: 15000, advance_paid: 7500 })], money })
    const made = mock.record('/deals/1/handover', { ok: true, document: { id: 9, kind: 'handover' } })
    const opened = vi.spyOn(window, 'open').mockReturnValue(null)
    const user = userEvent.setup()
    renderApp('/pipeline')
    await user.click(await screen.findByRole('button', { name: /handover sheet for sri bakery/i }))
    await waitFor(() => expect(made).toHaveLength(1))
    expect(opened).toHaveBeenCalledWith('/api/documents/9', '_blank', 'noopener,noreferrer')
    opened.mockRestore()
  })

  it('records what a finished client lets you show and drafts only from it', async () => {
    mock.get('/deals', { ok: true, items: [deal({ stage: 'paid', amount: 15000 })], money })
    const items = { name: 'Their business name', logo: 'Their logo', screenshots: 'Screenshots of the site', quote: 'A quote from them', numbers: 'Results with numbers' }
    mock.get('/marketing/proof/:id', { ok: true, items, proof: { permissions: {}, facts: {} }, drafts: { ok: false, reason: 'Drafts need a real number or a quote.' } })
    const saved: unknown[] = []
    server.use(http.put('*/api/marketing/proof/1', async ({ request }) => {
      saved.push(await request.json())
      return HttpResponse.json({ ok: true, items, proof: { permissions: { numbers: true }, facts: { results: '42 direct orders' } },
        drafts: { ok: true, case_study: 'A Bengaluru shop: website. 42 direct orders', linkedin: 'I built a website', gbp: 'New work', status: ['Before', 'Built', 'After'] } })
    }))
    const user = userEvent.setup()
    renderApp('/pipeline')
    await user.click(await screen.findByRole('button', { name: /proof from sri bakery/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Proof from Sri Bakery' })
    expect(await within(dialog).findByText(/drafts need a real number or a quote/i)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('checkbox', { name: 'Results with numbers' }))
    await user.type(within(dialog).getByLabelText('What changed, with numbers'), '42 direct orders')
    await user.click(within(dialog).getByRole('button', { name: 'Save and draft' }))
    expect(await within(dialog).findByText('A Bengaluru shop: website. 42 direct orders')).toBeInTheDocument()
    expect(saved[0]).toMatchObject({ permissions: { numbers: true }, facts: { results: '42 direct orders' } })
  })

  it('makes a review QR card for a finished client from their Google review link', async () => {
    mock.get('/deals', { ok: true, items: [deal({ stage: 'delivered', amount: 15000, advance_paid: 7500 })], money })
    const made = mock.record('/deals/1/review-card', { ok: true, document: { id: 12, kind: 'review_card' } })
    const opened = vi.spyOn(window, 'open').mockReturnValue(null)
    const user = userEvent.setup()
    renderApp('/pipeline')
    await user.click(await screen.findByRole('button', { name: /review qr card for sri bakery/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Review card for Sri Bakery' })
    await user.type(within(dialog).getByLabelText('Their Google review link'), 'https://g.page/r/CbX9/review')
    await user.click(within(dialog).getByRole('button', { name: 'Make the card' }))
    await waitFor(() => expect(made[0]).toEqual({ link: 'https://g.page/r/CbX9/review' }))
    expect(opened).toHaveBeenCalledWith('/api/documents/12', '_blank', 'noopener,noreferrer')
    opened.mockRestore()
  })
})

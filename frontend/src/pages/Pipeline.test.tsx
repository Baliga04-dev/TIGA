import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
})

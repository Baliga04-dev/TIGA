import { beforeEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mock } from '../test/mock'
import { mockMountCalls, renderApp } from '../test/render'

const missions = [
  { id: 'tour', title: 'Follow one order through the shop', topic: 'Networking and the request path', actions: ['break'] },
  { id: 'race', title: 'The last honey cake, sold twice', topic: 'Concurrency: race conditions and transactions', actions: ['break', 'fix', 'undo'] },
]
const race = {
  ...missions[1],
  sections: [
    { title: "Why you're doing this", text: 'Menu reads stock, **thinks**, then writes it back.' },
    { title: 'The benefit, and the cost', text: 'Atomic updates.\n\n- one\n- two' },
    { title: 'What interviewers ask', text: '**Q: What is a race condition?**\nA bug where timing decides the result.' },
  ],
}
const running = {
  ok: true, docker: true, running: true, job: null, last_job: null,
  services: [{ name: 'gateway', container: 'shoplab-gateway-1', state: 'running', health: 'healthy' },
             { name: 'orders', container: 'shoplab-orders-1', state: 'running', health: 'unhealthy' }],
}
const snap = {
  ok: true, up: true, health: { gateway: 'up', orders: 'unhealthy' },
  customers: { requests: 120, ok: 90, failed: 30, sold_out: 0, rejected: 0, error_rate: 0.25, p50_s: 0.2, p95_s: 4.5, rps_target: 2 },
  services: { orders: { rps: 1.5, error_rate: 0.3, p95_s: 2.0 } },
  stock: { items: [{ sku: 'BAK-001', name: 'Honey cake', price_paise: 4000, stock: -3 }], oversold: [], indexes: ['items_pkey'] },
  ledger: { charges: 40, charged_more_than_once: [{ order_ref: '12', times: 2 }] },
  queue: { backlog: 7, dead: 1, consumers: 1 },
  orders: { by_status: {}, breaker: 'open' },
}

beforeEach(() => {
  mockMountCalls()
  mock.get('/features', { learn: true })
  mock.get('/lab/missions', { ok: true, items: missions })
  mock.get('/lab/missions/tour', { ok: true, mission: { ...missions[0], sections: [{ title: "Why you're doing this", text: 'Six programs.' }] } })
  mock.get('/lab/missions/race', { ok: true, mission: race })
  mock.get('/lab/logs', { ok: true, items: [] })
})

describe('Learn (ShopLab)', () => {
  it('says how to switch Learn on when it is off', async () => {
    mock.get('/features', { learn: false })
    mock.get('/lab/missions', { detail: 'Not Found' }, 404)
    renderApp('/learn')
    expect(await screen.findByText(/TIGA_LEARN_ENABLED/)).toBeInTheDocument()
  })

  it('without Docker, shows the one install command and still lets you read missions', async () => {
    mock.get('/lab/status', { ok: true, docker: false, running: false, services: [], job: null, last_job: null })
    renderApp('/learn')
    expect(await screen.findByText(/docker.io docker-compose-v2/)).toBeInTheDocument()
    expect(await screen.findByText('Six programs.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Break it' })).toBeDisabled()
  })

  it('shows the running lab: service health, what customers feel and open incidents', async () => {
    mock.get('/lab/status', running)
    mock.get('/lab/snapshot', snap)
    mock.get('/lab/incidents', { ok: true, items: [{ id: 1, rule: 'down:orders', title: 'orders is unhealthy (500)', detail: 'Requests will fail.', mission: 'race', opened_at: '2026-10-24T10:00:00Z', last_seen: '2026-10-24T10:01:00Z', resolved_at: '', seen: 4 }] })
    renderApp('/learn')
    const services = await screen.findByRole('list', { name: 'Services' })
    const orders = within(services).getByText('orders', { selector: 'p' }).closest('li')!
    expect(await within(orders).findByText('unhealthy')).toBeInTheDocument()
    expect(await screen.findByText('25%')).toBeInTheDocument()
    expect(screen.getByText('4.5s')).toBeInTheDocument()
    expect(screen.getByText('orders is unhealthy (500)')).toBeInTheDocument()
    const stock = screen.getByRole('list', { name: 'Stock' })
    expect(within(stock).getByText('-3')).toHaveClass('text-flag')
    expect(screen.getByText('Indexes on items: items_pkey')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Learn why' }))
    expect(await screen.findByRole('heading', { name: 'The last honey cake, sold twice' })).toBeInTheDocument()
  })

  it('reads a mission in its parts and runs its buttons and check', async () => {
    mock.get('/lab/status', running)
    mock.get('/lab/snapshot', snap)
    mock.get('/lab/incidents', { ok: true, items: [] })
    const acted = mock.record('/lab/missions/race/break', { ok: true, detail: '40 customers tried to buy BAK-001 at once' })
    mock.post('/lab/missions/race/check', { ok: true, passed: false, detail: 'It went below zero: the race is still there.' })
    renderApp('/learn')
    await userEvent.click(await screen.findByRole('button', { name: /The last honey cake/ }))
    expect(await screen.findByText('thinks')).toBeInTheDocument()
    expect(screen.getByText('two').tagName).toBe('LI')
    expect(screen.getByText('Q: What is a race condition?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Break it' }))
    expect(await screen.findByText(/40 customers tried/)).toBeInTheDocument()
    expect(acted).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Check' }))
    expect(await screen.findByText(/Not yet\. It went below zero/)).toBeInTheDocument()
  })

  it('starts the lab', async () => {
    mock.get('/lab/status', { ok: true, docker: true, running: false, services: [], job: null, last_job: null })
    const started = mock.record('/lab/up', { ok: true, started: true })
    renderApp('/learn')
    await userEvent.click(await screen.findByRole('button', { name: 'Start the lab' }))
    expect(started).toHaveLength(1)
  })
})

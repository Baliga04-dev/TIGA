import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mock } from '../test/mock'
import { mockMountCalls, renderApp } from '../test/render'

const usage = {
  ok: true, provider: 'claude', model: 'sonnet', today: { calls: 12, cap: 150 },
  by_day: [{ day: '2026-10-22', calls: 12, input_tokens: 9000, output_tokens: 800, cost_usd: 0.05, failed: 0 }],
  by_feature: [{ feature: 'chat', calls: 9, input_tokens: 7000, output_tokens: 500, cost_usd: 0.03, failed: 1 },
               { feature: 'email writer', calls: 3, input_tokens: 2000, output_tokens: 300, cost_usd: 0.02, failed: 0 }],
}
const call = { id: 1, ts: '2026-10-22T10:00:00+00:00', feature: 'email writer', model: 'sonnet', system: 'You write one short email',
  prompt: 'Company: Sri Bakery', reply: '{"subject":"Hi"}', input_tokens: 900, output_tokens: 40, cost_usd: 0.002, duration_ms: 1500, ok: 1, error: '' }

beforeEach(() => {
  mockMountCalls()
  mock.get('/ai/usage', usage)
  mock.get('/ai/calls', { ok: true, items: [call] })
  mock.get('/chat/history', { ok: true, items: [{ id: 1, ts: '2026-10-22T10:00:00+00:00', user_text: 'good morning', reply: 'Good morning, Adithya.', mode: 'builtin', actions: [{ tool: 'morning_briefing', ok: true, status: '' }] }] })
})

describe('AI usage', () => {
  it('shows today against the cap and usage by agent', async () => {
    renderApp('/usage')
    expect(await screen.findByText(/12 of 150 Claude calls used/)).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: /daily claude calls/i })).toHaveAttribute('aria-valuenow', '8')
    expect(screen.getByRole('cell', { name: 'email writer' })).toBeInTheDocument()
    expect(screen.getByText('9 (1 failed)')).toBeInTheDocument()
  })

  it('lets you read what each agent asked and what Claude answered', async () => {
    const user = userEvent.setup()
    renderApp('/usage')
    await user.click(await screen.findByText('email writer', { selector: 'summary span' }))
    expect(screen.getByText('Company: Sri Bakery')).toBeVisible()
    expect(screen.getByText('{"subject":"Hi"}')).toBeVisible()
  })

  it('keeps the chat history with the tools used', async () => {
    renderApp('/usage')
    expect(await screen.findByText('good morning')).toBeInTheDocument()
    expect(screen.getByText(/used morning_briefing/)).toBeInTheDocument()
  })
})

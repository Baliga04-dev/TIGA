import { beforeEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../test/server'
import { mock } from '../test/mock'
import { mockMountCalls, renderApp } from '../test/render'

const done = { id: 2, title: 'Call with Sri Bakery', created_at: '2026-10-22T10:00:00+00:00', status: 'done', duration_s: 754, notes: 'Summary\n- Launch on Friday', error: '' }
const busy = { id: 3, title: 'Call with Glow Salon', created_at: '2026-10-22T11:00:00+00:00', status: 'transcribing', duration_s: 0, notes: '', error: '' }
const failed = { id: 1, title: 'Broken call', created_at: '2026-10-21T09:00:00+00:00', status: 'failed', duration_s: 0, notes: '', error: 'could not decode audio' }

beforeEach(() => mockMountCalls())

describe('Meetings', () => {
  it('lists calls with where each one is up to', async () => {
    mock.get('/meetings', { ok: true, items: [busy, done, failed] })
    renderApp('/meetings')
    const salon = (await screen.findByText('Call with Glow Salon')).closest('li')!
    expect(within(salon).getByText('Transcribing on this PC')).toBeInTheDocument()
    const bakery = screen.getByText('Call with Sri Bakery').closest('li')!
    expect(within(bakery).getByText('Notes ready')).toBeInTheDocument()
    expect(within(bakery).getByText('12:34')).toBeInTheDocument()
    expect(screen.getByText('could not decode audio')).toBeInTheDocument()
  })

  it('opens the notes and the transcript', async () => {
    mock.get('/meetings', { ok: true, items: [done] })
    mock.get('/meetings/2', { ok: true, meeting: { ...done, transcript: "[00:00] We'll launch on Friday." } })
    renderApp('/meetings')
    await userEvent.click(await screen.findByRole('button', { name: /^Call with Sri Bakery/ }))
    expect(screen.getByText(/Launch on Friday/)).toBeInTheDocument()
    expect(await screen.findByText("[00:00] We'll launch on Friday.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy notes' })).toBeInTheDocument()
  })

  it('deletes a call', async () => {
    let items = [done]
    mock.get('/meetings', () => ({ ok: true, items }))
    server.use(http.delete('*/api/meetings/2', () => { items = []; return HttpResponse.json({ ok: true }) }))
    renderApp('/meetings')
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Call with Sri Bakery' }))
    expect(await screen.findByText(/No calls yet/)).toBeInTheDocument()
  })

  it('says when the browser cannot record', async () => {
    mock.get('/meetings', { ok: true, items: [] })
    renderApp('/meetings')
    expect(await screen.findByText(/can't record a call/)).toBeInTheDocument()
  })
})

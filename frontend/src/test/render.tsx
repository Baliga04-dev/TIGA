import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { mock } from './mock'
import { statusOk, summaryOk } from './fixtures'

/** Answer the calls every page makes on mount, so a test only overrides what it cares about. */
export function mockMountCalls() {
  mock.get('/features', { learn: false })
  mock.get('/assistant', { ok: true, paused: false })
  mock.get('/pricing', { ok: true, rates: [{ id: 'business_site', name: 'Business website', price: 15000, unit: 'project', days: 10, description: 'Five pages' }, { id: 'photo_edit', name: 'Photo editing', price: 150, unit: 'image', days: 2, description: 'Per image' }] })
  mock.get('/deals/:id/documents', { ok: true, items: [] })
  mock.get('/reminders/due', { ok: true, items: [] })
  mock.get('/bridge/status', { ok: true, connected: false, configured: true })
  mock.get('/bridge/setup', { ok: true, token: 'tok', server: 'ws://127.0.0.1:8000/ws/bridge' })
  mock.get('/reminders', { ok: true, items: [] })
  mock.get('/notes', { ok: true, items: [] })
  mock.get('/routines', { ok: true, items: [] })
  mock.get('/rnd/status', { ok: true, last_run: '', manual_left: 2, manual_limit: 2, latest: null })
  mock.get('/dev', { ok: true, busy: false, runs_today: 0, daily_limit: 2, auto: false, ready: true })
  mock.get('/briefing', { ok: true, cards: [{ title: 'To do today', lines: ['1 email draft to approve'] }], text: 'Good morning, Adithya.' })
  mock.get('/outreach/scorecard', { ok: true, scorecard: { sent_today: 0, sent_week: 0, replies: 0, interested: 0, declined: 0, unsubscribed: 0, bounced: 0, followups_sent: 0, awaiting_approval: 0, daily_cap: 5, pipeline: {} } })
  mock.get('/reports', { ok: true, items: [] })
  mock.get('/status', statusOk as never)
  mock.post('/email/summary', summaryOk as never)
  mock.post('/email/fetch', { ok: true, source: 'live', emails: [], count: 0, ms: 1 })
  mock.get('/agents/status', {
    name: 'Tiga',
    agents: [{ name: 'manager', role: 'triage', status: 'ready' }],
    github: { repository: 'Baliga04-dev/TIGA', configured: true, token_configured: false, branch: 'main', working_tree: 'clean' },
  })
  mock.get('/env-example', [] as never)
}

export function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

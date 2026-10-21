import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { mock } from './mock'
import { statusOk, summaryOk } from './fixtures'

/** Answer the calls every page makes on mount, so a test only overrides what it cares about. */
export function mockMountCalls() {
  mock.get('/features', { learn: false })
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

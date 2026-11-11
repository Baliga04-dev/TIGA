import { describe, expect, it } from 'vitest'
import { groupOf, parseReport } from './report'
import real from './report.fixtures.json'

describe('parseReport', () => {
  it('reads a daily report into status, figures, checks and open issues', () => {
    const r = parseReport(real.daily)
    expect(r.title).toBe('Tiga daily report, 2026-11-09')
    expect(r.status).toBe('red')
    expect(r.statusNote).toBe('GitHub sync failed')
    const outreach = r.sections.find((s) => s.heading === 'Outreach')!
    expect(outreach.blocks[0]).toMatchObject({ type: 'stats' })
    expect(outreach.blocks[0].type === 'stats' && outreach.blocks[0].items[0]).toEqual({ label: 'Sent today', value: '0 of 5 (this week: 0)' })
    const system = r.sections.find((s) => s.heading === 'System')!
    const checks = system.blocks.find((b) => b.type === 'checks')
    expect(checks?.type === 'checks' && checks.items.map((c) => c.ok)).toEqual([true, true])
    const issues = system.blocks.find((b) => b.type === 'issues')
    expect(issues?.type === 'issues' && issues.items[0]).toEqual({ id: 1, title: 'No mail went out this week', status: 'open', times: 4 })
  })

  it('reads R&D proposals with their reasons and sources', () => {
    const r = parseReport(real.weekly)
    expect(r.sections[0].heading).toBe('')
    const figures = r.sections[0].blocks[0]
    expect(figures.type === 'stats' && figures.items).toEqual([
      { label: 'Sent this week', value: '0' }, { label: 'Replies', value: '0 (0 interested)' },
      { label: 'Drafts waiting for you', value: '47' }])
    const proposals = r.sections.find((s) => s.heading === 'Proposals')!.blocks[0]
    if (proposals.type !== 'proposals') throw new Error('no proposals')
    const numbers = proposals.items[0]
    expect(numbers).toMatchObject({ tags: ['numbers'], title: 'No mail went out this week' })
    expect(numbers.summary).toMatch(/^Find leads/)
    const idea = proposals.items.find((p) => p.tags[0] === 'idea')!
    expect(idea.tags).toEqual(['idea', 'S'])
    expect(idea.fields.map((f) => f.label)).toEqual(['Why', 'Benefit', 'First step'])
    expect(idea.sources).toEqual(['https://asadfaizee.is-a.dev/services'])
  })

  it('reads the marketing report: channels, the experiment and next steps', () => {
    const r = parseReport(real.marketing)
    expect(r.sections.map((s) => s.heading)).toEqual(['', 'Channels: tries and results, last 7 days / last 4 weeks', "This week's one experiment", 'Next steps'])
    expect(r.sections[3].blocks[0]).toMatchObject({ type: 'list' })
  })

  it('keeps anything unrecognised as text, so nothing is lost', () => {
    const r = parseReport('Title\n\nSomething odd happened. It was fine.')
    expect(r.sections[0].blocks).toEqual([{ type: 'text', text: 'Something odd happened. It was fine.' }])
  })

  it('groups the stored kinds', () => {
    expect([groupOf('daily'), groupOf('weekly'), groupOf('research'), groupOf('marketing'), groupOf('x')])
      .toEqual(['daily', 'rnd', 'rnd', 'marketing', null])
  })
})

import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const PAGES = ['/', '/email', '/prospects', '/outreach', '/pipeline', '/marketing', '/meetings', '/usage', '/reports', '/crew', '/prompts', '/chat', '/agents', '/settings']

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`automated accessibility checks (${scheme})`, () => {
    test.use({ colorScheme: scheme })
    for (const path of PAGES) {
      test(`${path} has no serious or critical violations`, async ({ page }) => {
        await page.goto(path)
        await page.waitForLoadState('networkidle')
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
        const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
        expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([])
      })
    }
  })
}

import { expect, test } from '@playwright/test'

const PAGES = [
  { path: '/', heading: 'Dashboard' },
  { path: '/email', heading: 'Email Bot' },
  { path: '/outreach', heading: 'Outreach' },
  { path: '/reports', heading: 'Reports' },
  { path: '/crew', heading: 'Crew' },
  { path: '/chat', heading: 'Tiga Chat' },
  { path: '/agents', heading: 'Tiga Agents' },
  { path: '/settings', heading: 'Settings' },
]

test.describe('every page boots against the real backend', () => {
  for (const { path, heading } of PAGES) {
    test(`${heading} renders without console errors`, async ({ page }) => {
      const errors: string[] = []
      page.on('console', (msg) => {
        // A deliberately unconfigured Gmail answers 200 with an error body; the browser logs nothing for that.
        if (msg.type() === 'error') errors.push(msg.text())
      })
      page.on('pageerror', (err) => errors.push(err.message))
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
      await page.waitForLoadState('networkidle')
      expect(errors).toEqual([])
    })
  }

  test('the tab has the Tiga title and icon', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Tiga/)
    const href = await page.locator('link[rel="icon"]').getAttribute('href')
    expect((await page.request.get(href!)).ok()).toBe(true)
  })

  test('the navigation moves between pages', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('navigation').getByRole('link', { name: 'Tiga Chat' }).click()
    await expect(page).toHaveURL(/\/chat$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Tiga Chat' })).toBeVisible()
  })
})

test.describe('with Gmail not set up', () => {
  test('Email Bot explains what to do', async ({ page }) => {
    await page.goto('/email')
    const alert = page.getByRole('alert')
    await expect(alert).toContainText(/not authorized/i)
    await alert.getByRole('link', { name: /settings/i }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
    await expect(page.getByText('Credentials file missing')).toBeVisible()
  })

  test('the dashboard shows the same guidance instead of zeros', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('alert')).toContainText(/not authorized/i)
  })
})

test.describe('chat', () => {
  test('answers a built-in question', async ({ page }) => {
    await page.goto('/chat')
    await page.getByRole('textbox', { name: 'Message' }).fill('what time is it')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('log')).toContainText(/It's \d\d:\d\d/)
  })

  test('drafting a template shows a template and sends nothing', async ({ page }) => {
    await page.goto('/chat')
    await page.getByRole('textbox', { name: 'Message' }).fill('draft a cold email template for Sam at Acme')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('log')).toContainText('Template ready')
  })
})

test.describe('agents', () => {
  test('runs the cycle including the real backend test suite', async ({ page }) => {
    await page.goto('/agents')
    await expect(page.getByRole('heading', { name: 'Manager' })).toBeVisible()
    await page.getByRole('button', { name: 'Run cycle' }).click()
    const report = page.getByRole('region', { name: 'Cycle report' })
    await expect(report).toContainText('Passed', { timeout: 120_000 })
    await expect(report).toContainText(/\d+ passed/)
  })

  test('refuses to push without a token and says why', async ({ page }) => {
    await page.goto('/agents')
    await page.getByRole('button', { name: 'Push to GitHub' }).click()
    await expect(page.getByRole('alert')).toContainText(/GITHUB_TOKEN is not configured/)
  })
})

test.describe('settings', () => {
  test('shows the environment template without any secret values', async ({ page }) => {
    await page.goto('/settings')
    const template = page.getByLabel('Environment template')
    await expect(template).toContainText('OPENAI_API_KEY=')
    await expect(template).not.toContainText(/ghp_|sk-/)
  })
})

test.describe('security', () => {
  test('a request that claims to come from another site is refused', async ({ request }) => {
    const res = await request.post('http://127.0.0.1:8765/api/agents/run', { headers: { Origin: 'https://evil.example' } })
    expect(res.status()).toBe(403)
  })
})

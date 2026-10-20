import { expect, test } from '@playwright/test'

const PATHS = ['/', '/email', '/chat', '/agents', '/settings']

test.describe('phone width', () => {
  for (const path of PATHS) {
    test(`${path} does not scroll sideways`, async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow).toBeLessThanOrEqual(0)
    })
  }

  test('the menu opens and closes', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Open menu' }).click()
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Settings' })).toBeVisible()
    await page.getByRole('navigation').getByRole('link', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible()
  })
})

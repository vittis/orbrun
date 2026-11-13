import { test as base, expect, type Page } from '@playwright/test'

// Every test gets a fresh browser context. Fixture exceptions must fail the gate,
// including errors that happen after a fixture writes its initial status.
export const test = base.extend<{ pageErrors: void }>({
  pageErrors: [async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await use()
    expect(errors, 'uncaught browser errors').toEqual([])
  }, { auto: true }],
})

export async function result(page: Page) {
  const text = await page.locator('#result').innerText()
  return text.trim() ? JSON.parse(text) : {}
}


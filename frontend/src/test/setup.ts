import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { cleanup, configure } from '@testing-library/react'
import { server } from './server'

// Node's fetch rejects relative URLs; the app calls /api/... so anchor them.
const nodeFetch = globalThis.fetch
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  nodeFetch(typeof input === 'string' && input.startsWith('/') ? `http://localhost:3000${input}` : input, init)) as typeof fetch

// The whole suite runs in parallel jsdom workers; under that load a first render can take over the 1 s default.
configure({ asyncUtilTimeout: 4000 })

// jsdom does not implement layout APIs.
Element.prototype.scrollIntoView = vi.fn()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
  vi.restoreAllMocks()
})
afterAll(() => server.close())

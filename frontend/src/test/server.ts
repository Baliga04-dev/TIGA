import { setupServer } from 'msw/node'

// The network boundary: tests register the /api responses they need.
export const server = setupServer()

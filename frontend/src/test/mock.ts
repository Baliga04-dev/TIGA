import { http, HttpResponse, delay } from 'msw'
import { server } from './server'

type Json = Record<string, unknown> | unknown[]

function on(method: 'get' | 'post' | 'patch', path: string, body: Json | (() => Json), status = 200) {
  server.use(
    http[method](`*/api${path}`, async () => {
      await delay(0)
      return HttpResponse.json(typeof body === 'function' ? body() : body, { status })
    }),
  )
}

/** Register a JSON response for an /api route. */
export const mock = {
  get: (path: string, body: Json | (() => Json), status = 200) => on('get', path, body, status),
  post: (path: string, body: Json | (() => Json), status = 200) => on('post', path, body, status),
  patch: (path: string, body: Json | (() => Json), status = 200) => on('patch', path, body, status),
  /** Record request bodies for a POST route while answering with `body`. */
  record: (path: string, body: Json, status = 200) => {
    const bodies: unknown[] = []
    server.use(
      http.post(`*/api${path}`, async ({ request }) => {
        bodies.push(await request.json().catch(() => null))
        return HttpResponse.json(body, { status })
      }),
    )
    return bodies
  },
}

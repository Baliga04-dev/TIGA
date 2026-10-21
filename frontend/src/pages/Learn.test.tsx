import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mock } from '../test/mock'
import { mockMountCalls, renderApp } from '../test/render'

beforeEach(() => mockMountCalls())

describe('Learn', () => {
  it('has no nav tab when the service is off, and says how to enable it', async () => {
    mock.get('/learn/lessons', { detail: 'Not Found' }, 404)
    mock.get('/learn/mission', { detail: 'Not Found' }, 404)
    renderApp('/learn')
    expect(await screen.findByText(/TIGA_LEARN_ENABLED/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Learn' })).not.toBeInTheDocument()
  })

  it('shows the tab, lesson list and a sandboxed lesson when enabled', async () => {
    mock.get('/features', { learn: true })
    mock.get('/learn/lessons', { lessons: [{ name: '01-network', title: 'The network path' }, { name: '02-db', title: 'Databases' }] })
    mock.get('/learn/mission', { text: 'Interview ready' })
    const user = userEvent.setup()
    renderApp('/learn')
    expect(await screen.findByRole('link', { name: 'Learn' })).toBeInTheDocument()
    expect(await screen.findByText('Interview ready')).toBeInTheDocument()
    const frame = await screen.findByTitle('Lesson')
    expect(frame).toHaveAttribute('src', '/api/learn/lessons/01-network')
    expect(frame).toHaveAttribute('sandbox', '')
    await user.click(screen.getByRole('button', { name: 'Databases' }))
    expect(screen.getByTitle('Lesson')).toHaveAttribute('src', '/api/learn/lessons/02-db')
  })
})

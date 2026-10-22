import { beforeEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mock } from '../test/mock'
import { mockMountCalls, renderApp } from '../test/render'

const routine = {
  id: 1, command: 'who is waiting on me', when: 'every Monday at 9 am', next_at: '2026-10-26T09:00:00+05:30',
  last_at: '', last_result: 'Two people are waiting.', runs: 3, active: 1,
}

beforeEach(() => mockMountCalls())

describe('Routines', () => {
  it('lists routines with their schedule and last result', async () => {
    mock.get('/routines', { ok: true, items: [routine] })
    renderApp('/')
    const card = (await screen.findByText('who is waiting on me')).closest('li')!
    expect(within(card).getByText(/every Monday at 9 am, next/)).toBeInTheDocument()
    expect(within(card).getByText('Last time: Two people are waiting.')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Pause routine: who is waiting on me' })).toBeInTheDocument()
  })

  it('adds a routine from the form', async () => {
    const sent = mock.record('/routines', { ok: true, routine })
    renderApp('/')
    await screen.findByText(/Nothing repeats yet/)
    await userEvent.type(screen.getByLabelText('What to do'), 'who is waiting on me')
    await userEvent.type(screen.getByLabelText('When'), 'every Monday at 9am')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(sent).toEqual([{ command: 'who is waiting on me', when: 'every Monday at 9am' }])
  })

  it('shows why a schedule was not understood', async () => {
    mock.post('/routines', { ok: false, error: "I couldn't read 'now and then' as a schedule" })
    renderApp('/')
    await screen.findByText(/Nothing repeats yet/)
    await userEvent.type(screen.getByLabelText('What to do'), 'check mail')
    await userEvent.type(screen.getByLabelText('When'), 'now and then')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText(/couldn't read 'now and then'/)).toBeInTheDocument()
  })
})

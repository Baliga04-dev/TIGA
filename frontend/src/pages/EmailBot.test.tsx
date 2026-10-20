import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mock } from '../test/mock'
import { gmailNotAuthorized, parsedEmail, summaryOk } from '../test/fixtures'
import { mockMountCalls, renderApp } from '../test/render'

const alex = parsedEmail()
const cold = parsedEmail(
  { id: 'e2', subject: 'Website redesign services', from: 'Bo <bo@agency.io>', body: 'We build websites.' },
  { is_cold_email: true, is_reply: false, sentiment: 'neutral', key_topics: ['web_development'], contact_info: { emails: ['bo@agency.io'], phones: [], linkedin: ['linkedin.com/in/bo'], websites: [] } },
)

function inbox(...emails: ReturnType<typeof parsedEmail>[]) {
  mock.post('/email/fetch', { ok: true, source: 'live', emails, count: emails.length, ms: 1 })
}

beforeEach(() => {
  mockMountCalls()
  inbox(alex, cold)
})

async function open(path = '/email') {
  const user = userEvent.setup()
  renderApp(path)
  return user
}

describe('EmailBot inbox', () => {
  it('loads the inbox on arrival', async () => {
    await open()
    expect(await screen.findByRole('button', { name: 'Re: your proposal' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Website redesign services' })).toBeInTheDocument()
  })

  it('asks for the last week of mail', async () => {
    const bodies = mock.record('/email/fetch', { ok: true, source: 'live', emails: [], count: 0, ms: 1 }) as { days_back: number }[]
    await open()
    await waitFor(() => expect(bodies.length).toBeGreaterThan(0))
    expect(bodies[0].days_back).toBe(7)
  })

  it('says so when there is no mail', async () => {
    inbox()
    await open()
    expect(await screen.findByText(/no emails in the last 7 days/i)).toBeInTheDocument()
  })

  it('shows one clear message with a link to Settings when Gmail is not set up', async () => {
    mock.post('/email/fetch', gmailNotAuthorized)
    mock.post('/email/summary', gmailNotAuthorized)
    await open()
    const alerts = await screen.findAllByRole('alert')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toHaveTextContent(/not authorized/i)
    expect(within(alerts[0]).getByRole('link', { name: /settings/i })).toHaveAttribute('href', '/settings')
  })

  it('searches subject, sender and body', async () => {
    const user = await open()
    await screen.findByRole('button', { name: 'Re: your proposal' })
    await user.type(screen.getByRole('searchbox', { name: /search emails/i }), 'agency.io')
    expect(screen.queryByRole('button', { name: 'Re: your proposal' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Website redesign services' })).toBeInTheDocument()
  })

  it('filters by type', async () => {
    const user = await open()
    await screen.findByRole('button', { name: 'Re: your proposal' })
    await user.selectOptions(screen.getByRole('combobox', { name: /show/i }), 'cold')
    expect(screen.queryByRole('button', { name: 'Re: your proposal' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Website redesign services' })).toBeInTheDocument()
  })

  it('shows an inbox summary of today', async () => {
    mock.post('/email/summary', { ...summaryOk, total_emails: 21 } as never)
    await open()
    expect(await screen.findByText('21')).toBeInTheDocument()
  })
})

describe('EmailBot message detail', () => {
  async function openDetail() {
    const user = await open()
    await user.click(await screen.findByRole('button', { name: 'Re: your proposal' }))
    return { user, dialog: await screen.findByRole('dialog', { name: 'Re: your proposal' }) }
  }

  it('shows the message, contact details and sentiment in an accessible dialog', async () => {
    const { dialog } = await openDetail()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByText('Sounds great, let us talk.')).toBeInTheDocument()
    expect(within(dialog).getByText('+1 415-555-0132')).toBeInTheDocument()
    expect(within(dialog).getByText('Positive')).toBeInTheDocument()
  })

  it('shows LinkedIn contacts as safe links even without a phone or email', async () => {
    const user = await open()
    await user.click(await screen.findByRole('button', { name: 'Website redesign services' }))
    const link = await screen.findByRole('link', { name: 'linkedin.com/in/bo' })
    expect(link).toHaveAttribute('href', 'https://linkedin.com/in/bo')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('closes with Escape and returns focus to the message that opened it', async () => {
    const { user } = await openDetail()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Re: your proposal' })).toHaveFocus()
  })

  it('closes from the close button', async () => {
    const { user, dialog } = await openDetail()
    await user.click(within(dialog).getByRole('button', { name: /close/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('copies the body and confirms', async () => {
    const { user, dialog } = await openDetail()
    await user.click(within(dialog).getByRole('button', { name: /copy body/i }))
    expect(await navigator.clipboard.readText()).toBe('Sounds great, let us talk.')
    expect(within(dialog).getByRole('button', { name: /copied/i })).toBeInTheDocument()
  })

  it('replies with a clean address, a single Re: and the quoted message', async () => {
    const { user, dialog } = await openDetail()
    await user.click(within(dialog).getByRole('button', { name: /^reply$/i }))
    const compose = await screen.findByRole('dialog', { name: /compose email/i })
    expect(within(compose).getByLabelText('To')).toHaveValue('alex@acme.com')
    expect(within(compose).getByLabelText('Subject')).toHaveValue('Re: your proposal')
    expect((within(compose).getByLabelText('Message') as HTMLTextAreaElement).value).toContain('Sounds great, let us talk.')
  })
})

describe('EmailBot compose', () => {
  async function openCompose() {
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /^compose$/i }))
    return { user, dialog: await screen.findByRole('dialog', { name: /compose email/i }) }
  }

  it('opens straight from the dashboard link', async () => {
    await open('/email?compose=1')
    expect(await screen.findByRole('dialog', { name: /compose email/i })).toBeInTheDocument()
  })

  it('sends exactly what was typed, including several Cc addresses', async () => {
    const bodies = mock.record('/email/send', { ok: true, message_id: 'm1', ms: 1 }) as Record<string, unknown>[]
    const { user, dialog } = await openCompose()
    await user.type(within(dialog).getByLabelText('To'), 'bob@example.com')
    await user.type(within(dialog).getByLabelText('Cc'), 'a@b.com, c@d.com')
    await user.type(within(dialog).getByLabelText('Subject'), 'Hello')
    await user.type(within(dialog).getByLabelText('Message'), 'Hi Bob')
    await user.click(within(dialog).getByRole('button', { name: /send email/i }))
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toMatchObject({ to: 'bob@example.com', cc: 'a@b.com, c@d.com', subject: 'Hello', body: 'Hi Bob', is_html: false })
  })

  it('confirms a sent email, closes the dialog and refreshes the inbox', async () => {
    mock.post('/email/send', { ok: true, message_id: 'm1', ms: 1 })
    const refreshed = mock.record('/email/fetch', { ok: true, source: 'live', emails: [alex], count: 1, ms: 1 })
    const { user, dialog } = await openCompose()
    const before = refreshed.length
    await user.type(within(dialog).getByLabelText('To'), 'bob@example.com')
    await user.type(within(dialog).getByLabelText('Subject'), 'Hello')
    await user.type(within(dialog).getByLabelText('Message'), 'Hi')
    await user.click(within(dialog).getByRole('button', { name: /send email/i }))
    expect(await screen.findByRole('status')).toHaveTextContent('Email sent')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(refreshed.length).toBeGreaterThan(before))
  })

  it('keeps the dialog and the typing when sending fails, and says why', async () => {
    mock.post('/email/send', gmailNotAuthorized)
    const { user, dialog } = await openCompose()
    await user.type(within(dialog).getByLabelText('To'), 'bob@example.com')
    await user.type(within(dialog).getByLabelText('Subject'), 'Hello')
    await user.type(within(dialog).getByLabelText('Message'), 'Hi')
    await user.click(within(dialog).getByRole('button', { name: /send email/i }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/not authorized/i)
    expect(within(dialog).getByLabelText('Message')).toHaveValue('Hi')
  })

  it('starts the follow-up and proposal shortcuts from a clean form', async () => {
    const user = await open()
    await user.click(await screen.findByRole('button', { name: 'Reply to Re: your proposal' }))
    const reply = await screen.findByRole('dialog', { name: /compose email/i })
    expect(within(reply).getByLabelText('To')).toHaveValue('alex@acme.com')
    await user.click(within(reply).getByRole('button', { name: /cancel/i }))
    await user.click(screen.getByRole('button', { name: /follow-up email/i }))
    const followUp = await screen.findByRole('dialog', { name: /compose email/i })
    expect(within(followUp).getByLabelText('To')).toHaveValue('')
    expect(within(followUp).getByLabelText('Subject')).toHaveValue('Follow up')
  })
})

describe('EmailBot templates', () => {
  async function openTemplate() {
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /new template/i }))
    return { user, dialog: await screen.findByRole('dialog', { name: /cold email template/i }) }
  }

  it('opens straight from the dashboard link', async () => {
    await open('/email?template=1')
    expect(await screen.findByRole('dialog', { name: /cold email template/i })).toBeInTheDocument()
  })

  it('generates a template and hands it to compose without an address', async () => {
    const bodies = mock.record('/email/template', { ok: true, source: 'local', template: { subject: 'Websites for Acme', body: 'Hi Sam,\n\nI build websites.' }, ms: 1 }) as Record<string, unknown>[]
    const { user, dialog } = await openTemplate()
    await user.type(within(dialog).getByLabelText('Recipient name'), 'Sam')
    await user.type(within(dialog).getByLabelText('Company name'), 'Acme')
    await user.click(within(dialog).getByRole('button', { name: /generate template/i }))
    expect(await within(dialog).findByDisplayValue('Websites for Acme')).toBeInTheDocument()
    expect(bodies[0]).toMatchObject({ service_type: 'web_development', recipient_name: 'Sam', company_name: 'Acme' })
    await user.click(within(dialog).getByRole('button', { name: /use this template/i }))
    const compose = await screen.findByRole('dialog', { name: /compose email/i })
    expect(within(compose).getByLabelText('Subject')).toHaveValue('Websites for Acme')
    expect(within(compose).getByLabelText('To')).toHaveValue('')
  })

  it('shows a failure instead of crashing', async () => {
    mock.post('/email/template', { ok: false, error: 'template engine offline', ms: 1 })
    const { user, dialog } = await openTemplate()
    await user.click(within(dialog).getByRole('button', { name: /generate template/i }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('template engine offline')
    expect(within(dialog).getByRole('button', { name: /generate template/i })).toBeInTheDocument()
  })

  it('preselects the service from the quick action', async () => {
    const user = await open()
    await user.click(await screen.findByRole('button', { name: /software dev cold email/i }))
    const dialog = await screen.findByRole('dialog', { name: /cold email template/i })
    expect(within(dialog).getByLabelText('Service')).toHaveValue('software_development')
  })
})

import { useState } from 'react';
import { useEmailSummary, useEmails } from '../hooks/useApi';
import { api } from '../services/api';
import type { ParsedEmail, SendEmailRequest, TemplateGenRequest, TemplateResponse } from '../types';
import { Layout, PageHeader, Card } from '../components/Layout';
import { cn, formatRelativeTime, getSentimentColor, getSentimentLabel, copyToClipboard, speak } from '../lib/utils';
import {
  RefreshCw,
  Send,
  FileText,
  Plus,
  Search,
  Copy,
  Volume2,
  CheckCircle,
  Clock,
  Mail,
  ArrowUpRight,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';

const SERVICE_TYPES = [
  { value: 'web_development', label: 'Web Development' },
  { value: 'software_development', label: 'Software Development' },
  { value: 'general', label: 'General Freelance' },
] as const;

export function EmailBot() {
  const { summary, loading: summaryLoading, error: summaryError, refetch: refetchSummary } = useEmailSummary(1);
  const [selectedEmail, setSelectedEmail] = useState<ParsedEmail | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [composeData, setComposeData] = useState<SendEmailRequest>({
    to: '',
    subject: '',
    body: '',
    cc: '',
    bcc: '',
    is_html: false,
  });
  const [templateData, setTemplateData] = useState<TemplateGenRequest>({
    service_type: 'web_development',
    recipient_name: '',
    company_name: '',
    portfolio_link: '',
  });
  const [templateResult, setTemplateResult] = useState<TemplateResponse | null>(null);
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [filter, setFilter] = useState<'all' | 'cold' | 'replies' | 'positive'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { emails, loading: emailsLoading, refetch: refetchEmails } = useEmails('', 50, 1);

  const filteredEmails = emails?.emails.filter(email => {
    if (filter === 'cold' && !email.is_cold_email) return false;
    if (filter === 'replies' && !email.is_reply) return false;
    if (filter === 'positive' && email.sentiment !== 'positive') return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        email.email.subject.toLowerCase().includes(query) ||
        email.email.from.toLowerCase().includes(query) ||
        email.email.body.toLowerCase().includes(query)
      );
    }
    return true;
  }) || [];

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const result = await api.sendEmail(composeData);
      if (result.ok) {
        showToast('Email sent successfully!', 'success');
        setShowCompose(false);
        setComposeData({ to: '', subject: '', body: '', cc: '', bcc: '', is_html: false });
        refetchEmails();
        refetchSummary();
      } else {
        showToast(result.error || 'Failed to send email', 'error');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to send email', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleGenerateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    try {
      const result = await api.generateTemplate(templateData);
      setTemplateResult(result);
      if (!result.ok) {
        showToast(result.error || 'Failed to generate template', 'error');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to generate template', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const useTemplate = () => {
    if (templateResult?.template) {
      setComposeData({
        to: '',
        subject: templateResult.template.subject,
        body: templateResult.template.body,
        cc: '',
        bcc: '',
        is_html: false,
      });
      setShowTemplate(false);
      setShowCompose(true);
    }
  };

  const handleSpeak = (text: string) => {
    speak(text);
  };

  const handleCopy = async (text: string) => {
    await copyToClipboard(text);
    showToast('Copied to clipboard', 'success');
  };

  const handleReply = (email: ParsedEmail) => {
    const fromEmail = email.email.from.match(/<(.+?)>/) ? email.email.from.match(/<(.+?)>/)![1] : email.email.from;
    setComposeData({
      to: fromEmail,
      subject: `Re: ${email.email.subject.replace(/^re:\s*/i, '')}`,
      body: `\n\n---\nOn ${formatRelativeTime(email.email.date)}, ${email.email.from} wrote:\n${email.email.body}`,
      cc: '',
      bcc: '',
      is_html: false,
    });
    setShowCompose(true);
    setSelectedEmail(null);
  };

  const getTopicBadges = (topics: string[]) => {
    const topicLabels: Record<string, string> = {
      web_development: 'Web Dev',
      mobile_development: 'Mobile',
      ai_ml: 'AI/ML',
      freelance: 'Freelance',
      agency: 'Agency',
      ecommerce: 'E-commerce',
      saas: 'SaaS',
    };
    return topics.map(t => topicLabels[t] || t);
  };

  return (
    <Layout>
      <PageHeader
        title="Email Bot"
        description="Cold email outreach, inbox monitoring, and AI-powered summaries for freelancing"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => { refetchSummary(); refetchEmails(); }}
              disabled={summaryLoading || emailsLoading}
              className="btn btn-secondary btn-sm"
            >
              <RefreshCw className={cn('size-4', (summaryLoading || emailsLoading) && 'animate-spin')} />
              Refresh
            </button>
            <button onClick={() => setShowTemplate(true)} className="btn btn-primary btn-sm">
              <Sparkles className="size-4" />
              New Template
            </button>
            <button onClick={() => setShowCompose(true)} className="btn btn-success btn-sm">
              <Plus className="size-4" />
              Compose
            </button>
          </div>
        }
      />

      {toast && (
        <div className={cn(
          'fixed bottom-4 right-4 z-50 animate-fade-in px-4 py-3 rounded-lg shadow-lg flex items-center gap-2',
          toast.type === 'success' ? 'bg-[var(--accent-green)]/90' : 'bg-[var(--accent-red)]/90'
        )}>
          <CheckCircle className="size-5" />
          <span>{toast.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card title="Today's Summary">
          {summaryLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-8 animate-spin text-[var(--accent-blue)]" />
            </div>
          ) : summaryError ? (
            <p className="text-[var(--accent-red)]">{summaryError}</p>
          ) : summary ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-[var(--bg-tertiary)] rounded-lg">
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{summary.total_emails}</p>
                  <p className="text-xs text-[var(--text-muted)]">Total Emails</p>
                </div>
                <div className="p-3 bg-[var(--bg-tertiary)] rounded-lg">
                  <p className="text-2xl font-bold text-[var(--accent-blue)]">{summary.cold_emails}</p>
                  <p className="text-xs text-[var(--text-muted)]">Cold Outreach</p>
                </div>
                <div className="p-3 bg-[var(--bg-tertiary)] rounded-lg">
                  <p className="text-2xl font-bold text-[var(--accent-green)]">{summary.replies_received}</p>
                  <p className="text-xs text-[var(--text-muted)]">Replies</p>
                </div>
                <div className="p-3 bg-[var(--bg-tertiary)] rounded-lg">
                  <p className="text-2xl font-bold text-[var(--accent-amber)]">{summary.positive_responses}</p>
                  <p className="text-xs text-[var(--text-muted)]">Positive</p>
                </div>
              </div>

              {summary.top_topics && Object.keys(summary.top_topics).length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Top Topics</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(summary.top_topics).map(([topic, count]) => (
                      <span key={topic} className="badge badge-blue text-xs">
                        {topic.replace(/_/g, ' ')} ({count})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {summary.action_items && summary.action_items.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Action Items</h4>
                  <ul className="space-y-1">
                    {summary.action_items.slice(0, 5).map((item, i) => (
                      <li key={i} className="text-sm text-[var(--text-secondary)] flex items-start gap-2">
                        <Clock className="size-4 mt-0.5 flex-shrink-0" />
                        <span>{truncate(item, 80)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[var(--text-muted)]">No data available</p>
          )}
        </Card>

        <Card title="Quick Actions" className="lg:col-span-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => { setTemplateData({...templateData, service_type: 'web_development' }); setShowTemplate(true); }}
              className="btn btn-secondary text-left p-4 hover:bg-[var(--bg-tertiary)]"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent-blue)]/10 flex items-center justify-center">
                  <Mail className="size-5 text-[var(--accent-blue)]" />
                </div>
                <div>
                  <p className="font-medium">Web Dev Cold Email</p>
                  <p className="text-xs text-[var(--text-muted)]">Generate template for website projects</p>
                </div>
              </div>
            </button>
            <button
              onClick={() => { setTemplateData({...templateData, service_type: 'software_development' }); setShowTemplate(true); }}
              className="btn btn-secondary text-left p-4 hover:bg-[var(--bg-tertiary)]"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent-purple)]/10 flex items-center justify-center">
                  <Sparkles className="size-5 text-[var(--accent-purple)]" />
                </div>
                <div>
                  <p className="font-medium">Software Dev Cold Email</p>
                  <p className="text-xs text-[var(--text-muted)]">Generate template for custom software</p>
                </div>
              </div>
            </button>
            <button
              onClick={() => { setComposeData({...composeData, subject: 'Follow up', body: 'Hi,\n\nJust following up on my previous email...\n\nBest,' }); setShowCompose(true); }}
              className="btn btn-secondary text-left p-4 hover:bg-[var(--bg-tertiary)]"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent-amber)]/10 flex items-center justify-center">
                  <ArrowUpRight className="size-5 text-[var(--accent-amber)]" />
                </div>
                <div>
                  <p className="font-medium">Follow-up Email</p>
                  <p className="text-xs text-[var(--text-muted)]">Quick follow-up to previous outreach</p>
                </div>
              </div>
            </button>
            <button
              onClick={() => { setComposeData({...composeData, subject: 'Proposal', body: 'Hi,\n\nThanks for your interest. Here\'s my proposal...\n\nBest,' }); setShowCompose(true); }}
              className="btn btn-secondary text-left p-4 hover:bg-[var(--bg-tertiary)]"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent-green)]/10 flex items-center justify-center">
                  <FileText className="size-5 text-[var(--accent-green)]" />
                </div>
                <div>
                  <p className="font-medium">Send Proposal</p>
                  <p className="text-xs text-[var(--text-muted)]">Send a project proposal to a lead</p>
                </div>
              </div>
            </button>
          </div>
        </Card>
      </div>

      <Card title="Inbox" className="flex-1 min-h-[500px]">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search emails..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              className="input py-2 px-3 text-sm w-auto"
            >
              <option value="all">All</option>
              <option value="cold">Cold Emails</option>
              <option value="replies">Replies</option>
              <option value="positive">Positive</option>
            </select>
            <button onClick={() => refetchEmails()} disabled={emailsLoading} className="btn btn-ghost btn-sm">
              <RefreshCw className={cn('size-4', emailsLoading && 'animate-spin')} />
            </button>
          </div>
        </div>

        <div className="border border-[var(--border-color)] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--bg-tertiary)] border-b border-[var(--border-color)]">
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)] w-10"></th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">Subject</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">From</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)] w-32">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)] w-32">Type</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)] w-24">Sentiment</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)] w-10"></th>
                </tr>
              </thead>
              <tbody>
                {emailsLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)]">
                      <Loader2 className="size-8 animate-spin text-[var(--accent-blue)] mx-auto mb-2" />
                      Loading emails...
                    </td>
                  </tr>
                ) : filteredEmails.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)]">
                      No emails found
                    </td>
                  </tr>
                ) : (
                  filteredEmails.map((email) => (
                    <tr
                      key={email.email.id}
                      onClick={() => setSelectedEmail(email)}
                      className={cn(
                        'border-b border-[var(--border-color)] hover:bg-[var(--bg-tertiary)] cursor-pointer transition-colors',
                        selectedEmail?.email.id === email.email.id && 'bg-[var(--accent-blue)]/5'
                      )}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedEmails.has(email.email.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            setSelectedEmails(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(email.email.id);
                              else next.delete(email.email.id);
                              return next;
                            });
                          }}
                          className="w-4 h-4 accent-[var(--accent-blue)]"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium truncate max-w-xs" title={email.email.subject}>
                          {email.email.subject || '(no subject)'}
                        </div>
                        <div className="text-xs text-[var(--text-muted)] truncate max-w-xs">
                          {email.summary}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="truncate max-w-xs" title={email.email.from}>
                          {email.email.from}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">
                        {formatRelativeTime(email.email.date)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {email.is_cold_email && <span className="badge badge-blue text-xs">Cold</span>}
                          {email.is_reply && <span className="badge badge-amber text-xs">Reply</span>}
                          {getTopicBadges(email.key_topics).map((t, i) => (
                            <span key={i} className="badge badge-gray text-xs">{t}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('badge text-xs', getSentimentColor(email.sentiment))}>
                          {getSentimentLabel(email.sentiment)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleReply(email); }}
                          className="btn btn-ghost btn-sm p-1.5"
                          aria-label="Reply"
                        >
                          <Mail className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {selectedEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setSelectedEmail(null)}>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl max-w-3xl w-full max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--border-color)]">
              <h3 className="font-semibold truncate pr-4">{selectedEmail.email.subject || '(no subject)'}</h3>
              <button onClick={() => setSelectedEmail(null)} className="btn btn-ghost p-1.5">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <div className="space-y-3 mb-4 pb-4 border-b border-[var(--border-color)]">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-[var(--text-muted)]">From:</span>
                  <span className="font-medium">{selectedEmail.email.from}</span>
                  <span className="text-[var(--text-muted)]">To:</span>
                  <span>{selectedEmail.email.to}</span>
                  <span className="text-[var(--text-muted)]">Date:</span>
                  <span>{formatRelativeTime(selectedEmail.email.date)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedEmail.is_cold_email && <span className="badge badge-blue">Cold Email</span>}
                  {selectedEmail.is_reply && <span className="badge badge-amber">Reply</span>}
                  <span className={cn('badge', getSentimentColor(selectedEmail.sentiment))}>
                    {getSentimentLabel(selectedEmail.sentiment)}
                  </span>
                  {getTopicBadges(selectedEmail.key_topics).map((t, i) => (
                    <span key={i} className="badge badge-gray">{t}</span>
                  ))}
                </div>
              </div>

              <div className="prose prose-invert max-w-none whitespace-pre-wrap text-sm">
                {selectedEmail.email.body}
              </div>

              {selectedEmail.action_items.length > 0 && (
                <div className="mt-4 pt-4 border-t border-[var(--border-color)]">
                  <h4 className="font-medium mb-2">Action Items</h4>
                  <ul className="space-y-1">
                    {selectedEmail.action_items.map((item, i) => (
                      <li key={i} className="text-sm text-[var(--text-secondary)] flex items-start gap-2">
                        <Clock className="size-4 mt-0.5 flex-shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedEmail.contact_info.emails.length > 0 && (
                <div className="mt-4 pt-4 border-t border-[var(--border-color)]">
                  <h4 className="font-medium mb-2">Contact Info</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedEmail.contact_info.emails.map((e, i) => (
                      <span key={i} className="badge badge-gray text-xs">{e}</span>
                    ))}
                    {selectedEmail.contact_info.phones.map((p, i) => (
                      <span key={i} className="badge badge-gray text-xs">{p}</span>
                    ))}
                    {selectedEmail.contact_info.linkedin.map((l, i) => (
                      <a key={i} href={`https://${l}`} target="_blank" rel="noopener noreferrer" className="badge badge-blue text-xs">{l}</a>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <button onClick={() => handleReply(selectedEmail)} className="btn btn-primary btn-sm">
                  <Mail className="size-4" />
                  Reply
                </button>
                <button onClick={() => handleCopy(selectedEmail.email.body)} className="btn btn-secondary btn-sm">
                  <Copy className="size-4" />
                  Copy Body
                </button>
                <button onClick={() => handleSpeak(selectedEmail.summary)} className="btn btn-secondary btn-sm">
                  <Volume2 className="size-4" />
                  Speak Summary
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowCompose(false)}>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--border-color)]">
              <h3 className="font-semibold">Compose Email</h3>
              <button onClick={() => setShowCompose(false)} className="btn btn-ghost p-1.5">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSendEmail} className="p-4 overflow-y-auto max-h-[70vh]">
              <div className="space-y-4">
                <div>
                  <label className="label">To</label>
                  <input
                    type="email"
                    value={composeData.to}
                    onChange={(e) => setComposeData({...composeData, to: e.target.value})}
                    className="input"
                    placeholder="recipient@example.com"
                    required
                  />
                </div>
                <div>
                  <label className="label">Subject</label>
                  <input
                    type="text"
                    value={composeData.subject}
                    onChange={(e) => setComposeData({...composeData, subject: e.target.value})}
                    className="input"
                    placeholder="Email subject"
                    required
                  />
                </div>
                <div>
                  <label className="label">CC</label>
                  <input
                    type="email"
                    value={composeData.cc}
                    onChange={(e) => setComposeData({...composeData, cc: e.target.value})}
                    className="input"
                    placeholder="cc@example.com (optional)"
                  />
                </div>
                <div>
                  <label className="label">BCC</label>
                  <input
                    type="email"
                    value={composeData.bcc}
                    onChange={(e) => setComposeData({...composeData, bcc: e.target.value})}
                    className="input"
                    placeholder="bcc@example.com (optional)"
                  />
                </div>
                <div>
                  <label className="label">Body</label>
                  <textarea
                    value={composeData.body}
                    onChange={(e) => setComposeData({...composeData, body: e.target.value})}
                    className="input min-h-[200px] resize-y font-mono text-sm"
                    placeholder="Email body..."
                    required
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={composeData.is_html}
                    onChange={(e) => setComposeData({...composeData, is_html: e.target.checked})}
                    className="w-4 h-4 accent-[var(--accent-blue)]"
                  />
                  Send as HTML
                </label>
                <div className="flex justify-end gap-2 pt-4 border-t border-[var(--border-color)]">
                  <button type="button" onClick={() => setShowCompose(false)} className="btn btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" disabled={sending} className="btn btn-success">
                    {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    {sending ? 'Sending...' : 'Send Email'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => { setShowTemplate(false); setTemplateResult(null); }}>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--border-color)]">
              <h3 className="font-semibold">Generate Cold Email Template</h3>
              <button onClick={() => { setShowTemplate(false); setTemplateResult(null); }} className="btn btn-ghost p-1.5">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[70vh]">
              {templateResult ? (
                <div className="space-y-4">
                  <div className="p-4 bg-[var(--bg-tertiary)] rounded-lg">
                    <label className="label">Subject</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={templateResult.template.subject}
                        readOnly
                        className="input flex-1 bg-[var(--bg-secondary)]"
                      />
                      <button
                        type="button"
                        onClick={() => handleCopy(templateResult.template.subject)}
                        className="btn btn-ghost btn-sm"
                        aria-label="Copy subject"
                      >
                        <Copy className="size-4" />
                      </button>
                    </div>
                  </div>
                  <div className="p-4 bg-[var(--bg-tertiary)] rounded-lg">
                    <label className="label">Body</label>
                    <div className="flex items-start justify-between gap-2">
                      <textarea
                        value={templateResult.template.body}
                        readOnly
                        className="input min-h-[300px] resize-y font-mono text-sm flex-1 bg-[var(--bg-secondary)]"
                      />
                      <button
                        type="button"
                        onClick={() => handleCopy(templateResult.template.body)}
                        className="btn btn-ghost btn-sm self-start"
                        aria-label="Copy body"
                      >
                        <Copy className="size-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setTemplateResult(null)} className="btn btn-secondary">
                      Generate Another
                    </button>
                    <button onClick={useTemplate} className="btn btn-primary">
                      <ArrowUpRight className="size-4" />
                      Use This Template
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleGenerateTemplate} className="space-y-4">
                  <div>
                    <label className="label">Service Type</label>
                    <select
                      value={templateData.service_type}
                      onChange={(e) => setTemplateData({...templateData, service_type: e.target.value as TemplateGenRequest['service_type']})}
                      className="input"
                    >
                      {SERVICE_TYPES.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Recipient Name</label>
                    <input
                      type="text"
                      value={templateData.recipient_name}
                      onChange={(e) => setTemplateData({...templateData, recipient_name: e.target.value})}
                      className="input"
                      placeholder="John"
                    />
                  </div>
                  <div>
                    <label className="label">Company Name</label>
                    <input
                      type="text"
                      value={templateData.company_name}
                      onChange={(e) => setTemplateData({...templateData, company_name: e.target.value})}
                      className="input"
                      placeholder="Acme Inc."
                    />
                  </div>
                  <div>
                    <label className="label">Portfolio Link (optional)</label>
                    <input
                      type="url"
                      value={templateData.portfolio_link}
                      onChange={(e) => setTemplateData({...templateData, portfolio_link: e.target.value})}
                      className="input"
                      placeholder="https://yourportfolio.com"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-4 border-t border-[var(--border-color)]">
                    <button type="button" onClick={() => { setShowTemplate(false); setTemplateResult(null); }} className="btn btn-secondary">
                      Cancel
                    </button>
                    <button type="submit" disabled={generating} className="btn btn-primary">
                      {generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                      {generating ? 'Generating...' : 'Generate Template'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
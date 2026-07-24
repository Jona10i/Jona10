import React, { useState, useEffect } from 'react';
import { useFirebase } from './FirebaseProvider';
import { Mail, Search, RefreshCw, Send, Settings, User, AlertCircle, LayoutGrid } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTranslation } from 'react-i18next';

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  payload: {
    headers: { name: string; value: string }[];
    body: { size: number; data?: string };
    parts?: any[];
  };
  internalDate: string;
}

export const MailView: React.FC = () => {
  const { user, accessToken, signIn } = useFirebase();
  const { t } = useTranslation();
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isComposing, setIsComposing] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [sending, setSending] = useState(false);

  const fetchEmails = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      // First get message IDs
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error('Authentication failed or missing permissions.');
        }
        throw new Error('Failed to fetch messages');
      }
      const data = await res.json();
      const msgs = data.messages || [];

      // Fetch full details
      const fullMsgs = await Promise.all(
        msgs.map(async (m: { id: string }) => {
          const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          return detailRes.json();
        })
      );

      setMessages(fullMsgs);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accessToken) {
      fetchEmails();
    }
  }, [accessToken]);

  const getHeader = (msg: GmailMessage, name: string) => {
    return msg.payload.headers?.find(h => (h.name || "").toLowerCase() === (name || "").toLowerCase())?.value || '';
  };

  const sendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    
    // Explicit user confirmation before a mutating API call (Sending email)
    const confirmed = window.confirm(`Ready to send email to ${composeTo}?`);
    if (!confirmed) return;

    setSending(true);
    setError(null);
    try {
      const emailContent = `To: ${composeTo}
Subject: ${composeSubject}
Content-Type: text/plain; charset="UTF-8"

${composeBody}`;
      
      const encodedEmail = btoa(unescape(encodeURIComponent(emailContent)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw: encodedEmail })
      });
      
      if (!res.ok) throw new Error('Failed to send email');
      
      setIsComposing(false);
      setComposeTo('');
      setComposeSubject('');
      setComposeBody('');
      fetchEmails();
    } catch(err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  if (!accessToken) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-white p-8">
        <div className="max-w-md w-full bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-red-100 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">Connect Gmail</h2>
          <p className="text-slate-600">
            Sign in with Google and grant permission to read and send emails to use the Workspace Mail integration.
          </p>
          <button
            onClick={signIn}
            className="mt-4 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-all shadow-md flex items-center justify-center gap-2 w-full"
          >
            <User className="w-5 h-5" />
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-white relative">
      <header className="h-16 px-6 shrink-0 flex items-center justify-between border-b border-slate-100 z-20 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-slate-800 leading-tight">Inbox</h1>
            <p className="text-xs text-slate-500">Connected to Gmail</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsComposing(!isComposing)}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all font-medium text-sm"
          >
            {isComposing ? <LayoutGrid className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            {isComposing ? 'Inbox' : 'Compose'}
          </button>
          <button
            onClick={fetchEmails}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-50 rounded-lg transition-all"
            title="Refresh"
          >
            <RefreshCw className={cn("w-5 h-5", loading && "animate-spin")} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50/50">
        <div className="max-w-5xl mx-auto space-y-4">
          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm">Action failed</p>
                <p className="text-xs opacity-80 mt-0.5">{error}</p>
              </div>
              <button 
                onClick={() => setError(null)}
                className="ml-auto p-1.5 text-red-400 hover:bg-red-100 rounded-lg"
              >
                Dismiss
              </button>
            </div>
          )}

          {isComposing ? (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <form onSubmit={sendEmail} className="flex flex-col h-full">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-500 w-16">To:</span>
                  <input
                    type="email"
                    required
                    value={composeTo}
                    onChange={e => setComposeTo(e.target.value)}
                    className="flex-1 text-sm outline-none placeholder:text-slate-300"
                    placeholder="recipient@example.com"
                  />
                </div>
                <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-500 w-16">Subject:</span>
                  <input
                    type="text"
                    required
                    value={composeSubject}
                    onChange={e => setComposeSubject(e.target.value)}
                    className="flex-1 text-sm outline-none placeholder:text-slate-300"
                    placeholder="Enter subject here..."
                  />
                </div>
                <div className="p-5 flex-1 min-h-[300px]">
                  <textarea
                    required
                    value={composeBody}
                    onChange={e => setComposeBody(e.target.value)}
                    className="w-full h-full resize-none outline-none text-sm leading-relaxed"
                    placeholder="Write your email here..."
                  />
                </div>
                <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setIsComposing(false)}
                    className="text-sm font-medium text-slate-500 hover:text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={sending}
                    className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium transition-all"
                  >
                    <Send className={cn("w-4 h-4", sending && "animate-pulse")} />
                    {sending ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </form>
            </div>
          ) : loading && !messages.length ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-24 bg-white border border-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : messages.length === 0 && !error ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8" />
              </div>
              <h3 className="text-slate-500 font-medium tracking-tight">No emails found</h3>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map(msg => {
                const subject = getHeader(msg, 'Subject') || '(no subject)';
                const fromHeader = getHeader(msg, 'From');
                const fromMatch = fromHeader.match(/^(.*?)\s*<(.+?)>$/);
                const fromName = fromMatch ? fromMatch[1].replace(/"/g, '') : fromHeader;
                const fromEmail = fromMatch ? fromMatch[2] : fromHeader;
                
                const dateHeader = getHeader(msg, 'Date');
                let dateDisplay = '';
                try {
                  const d = new Date(dateHeader || parseInt(msg.internalDate));
                  dateDisplay = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                } catch(e) {}

                return (
                  <div key={msg.id} className="bg-white p-4 rounded-2xl border border-slate-100 hover:shadow-md transition-all group flex flex-col sm:flex-row sm:items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold shrink-0">
                      {(fromName || "?").charAt(0).toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                        <div className="flex border-slate-200">
                          <h3 className="font-bold text-slate-800 truncate mr-2">{fromName}</h3>
                          <span className="text-xs text-slate-400 truncate mt-0.5">&lt;{fromEmail}&gt;</span>
                        </div>
                        <span className="text-xs font-semibold text-slate-500 whitespace-nowrap shrink-0">
                          {dateDisplay}
                        </span>
                      </div>
                      <h4 className="text-sm font-medium text-slate-700 mb-1 truncate">{subject}</h4>
                      <p className="text-sm text-slate-500 line-clamp-2 md:line-clamp-1">
                        {msg.snippet || '(No content)'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

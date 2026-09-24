'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Brain, 
  Send, 
  Loader2, 
  Sparkles, 
  RefreshCw,
  FileSpreadsheet,
  FileText,
  Copy,
  Check,
  Zap,
  Trash2,
  MessageSquare,
  Plus,
  Settings,
  AlertTriangle,
  X,
  Bell,
  ExternalLink,
  Edit2
} from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  exportData?: {
    type: string;
    exportType: 'excel' | 'pdf';
    title: string;
    headers: string[];
    rows: any[][];
  } | null;
  emailDraft?: {
    to: string;
    recipientName: string;
    subject: string;
    body: string;
  } | null;
  emailSent?: boolean;
}

/** Parses inline markdown like **bold**, `code`, and financial metric badges */
function renderInlineFormatting(text: string): React.ReactNode[] {
  if (!text) return [];
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);

  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const inner = part.slice(2, -2);
      const isMetric = /^(₹|-?\$|\d+|-[0-9,]+)/.test(inner) || inner.includes('INR') || inner.includes('Voucher') || inner.includes('Students') || inner.includes('Staff');
      return (
        <strong
          key={idx}
          className={`font-semibold ${
            isMetric
              ? 'px-1.5 py-0.5 rounded bg-brand/10 text-brand font-mono text-[11px] border border-brand/20'
              : 'text-ink font-bold'
          }`}
        >
          {inner}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      const inner = part.slice(1, -1);
      return (
        <code
          key={idx}
          className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-cream border border-beige text-brand font-medium"
        >
          {inner}
        </code>
      );
    }
    return part;
  });
}

/** Rich Markdown Renderer component to replace raw markdown strings */
function FormattedMarkdown({ content, className = '' }: { content: string; className?: string }) {
  if (!content) return null;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inList = false;
  let listItems: React.ReactNode[] = [];

  const flushList = () => {
    if (inList && listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="space-y-1.5 my-2 pl-1">
          {listItems}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };

  lines.forEach((line, lineIdx) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      return;
    }

    if (trimmed.startsWith('### ')) {
      flushList();
      const text = trimmed.replace(/^###\s+/, '');
      elements.push(
        <h3 key={`h3-${lineIdx}`} className="text-xs font-bold text-ink mt-3 mb-1">
          {renderInlineFormatting(text)}
        </h3>
      );
      return;
    }
    if (trimmed.startsWith('## ')) {
      flushList();
      const text = trimmed.replace(/^##\s+/, '');
      elements.push(
        <h2 key={`h2-${lineIdx}`} className="text-sm font-extrabold text-ink mt-4 mb-2 flex items-center gap-2">
          {renderInlineFormatting(text)}
        </h2>
      );
      return;
    }
    if (trimmed.startsWith('# ')) {
      flushList();
      const text = trimmed.replace(/^#\s+/, '');
      elements.push(
        <h1 key={`h1-${lineIdx}`} className="text-base font-black text-ink mt-4 mb-2">
          {renderInlineFormatting(text)}
        </h1>
      );
      return;
    }

    // Bullet or Numbered List Item
    if (trimmed.startsWith('* ') || trimmed.startsWith('- ') || /^\d+\.\s+/.test(trimmed)) {
      inList = true;
      const text = trimmed.replace(/^(\*|-|\d+\.)\s+/, '');
      listItems.push(
        <li key={`li-${lineIdx}`} className="flex items-start gap-2 text-xs leading-relaxed text-ink">
          <span className="text-brand font-bold text-xs mt-0.5 shrink-0">•</span>
          <span className="flex-1">{renderInlineFormatting(text)}</span>
        </li>
      );
      return;
    }

    // Paragraph
    flushList();
    elements.push(
      <p key={`p-${lineIdx}`} className="text-xs leading-relaxed text-ink/90 my-1">
        {renderInlineFormatting(trimmed)}
      </p>
    );
  });

  flushList();

  return <div className={`space-y-1 ${className}`}>{elements}</div>;
}

export default function AIManagerPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState<string | null>(null);

  // Multi-chat Sessions
  const [threads, setThreads] = useState<{ threadId: string; threadTitle: string }[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState('default');
  
  // Renaming state
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Modal Overlays
  const [isAlertsModalOpen, setIsAlertsModalOpen] = useState(false);
  const [isResolvingAll, setIsResolvingAll] = useState(false);

  // System Security Alerts
  const [systemAlerts, setSystemAlerts] = useState<any[]>([]);
  const [isAlertsLoading, setIsAlertsLoading] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const DEFAULT_GREETING: ChatMessage = {
    role: 'assistant',
    content: `Greetings. I am your MGE AI Manager. I have loaded our active database state (students, staff, concessions, and recent transactions). Ask me anything regarding ledger anomalies, operational recommendations, or request reports.`
  };

  const fetchThreads = async () => {
    try {
      const res = await fetch('/api/ai/manager?listThreads=true');
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads || []);
      }
    } catch (e) {
      console.error('Failed to load threads', e);
    }
  };

  const loadChatHistory = async (threadId: string) => {
    setIsLoadingChat(true);
    try {
      const res = await fetch(`/api/ai/manager?threadId=${threadId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.messages && data.messages.length > 0) {
        const parsed = data.messages.map((m: any) => {
          let exportData = undefined;
          let emailDraft = undefined;
          let cleanContent = m.content;

          const actionIndex = m.content.indexOf('{"type": "EXPORT_ACTION"');
          const emailIndex = m.content.indexOf('{"type": "EMAIL_DRAFT"');

          if (actionIndex !== -1) {
            try {
              const potentialJson = m.content.slice(actionIndex).trim();
              exportData = JSON.parse(potentialJson);
              cleanContent = m.content.slice(0, actionIndex).trim();
            } catch {}
          } else if (emailIndex !== -1) {
            try {
              const potentialJson = m.content.slice(emailIndex).trim();
              emailDraft = JSON.parse(potentialJson);
              cleanContent = m.content.slice(0, emailIndex).trim();
            } catch {}
          }

          return {
            role: m.role,
            content: cleanContent,
            exportData,
            emailDraft
          };
        });
        setMessages(parsed);
      } else {
        setMessages([DEFAULT_GREETING]);
      }
    } catch {
      setMessages([DEFAULT_GREETING]);
    } finally {
      setIsLoadingChat(false);
    }
  };

  const handleNewChat = () => {
    const newId = Math.random().toString(36).substring(2, 15);
    setCurrentThreadId(newId);
    setMessages([DEFAULT_GREETING]);
    setThreads(prev => [{ threadId: newId, threadTitle: 'New Chat' }, ...prev]);
  };

  const handleDeleteThread = async (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this chat session?')) return;
    try {
      const res = await fetch(`/api/ai/manager?threadId=${threadId}`, { method: 'DELETE' });
      if (res.ok) {
        setThreads(prev => prev.filter(t => t.threadId !== threadId));
        if (currentThreadId === threadId) {
          setCurrentThreadId('default');
        }
      }
    } catch (err) {
      console.error('Failed to delete thread:', err);
    }
  };

  const handleRenameThread = async (threadId: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    try {
      const res = await fetch('/api/ai/manager', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, threadTitle: newTitle.trim() })
      });
      if (res.ok) {
        setThreads(prev => prev.map(t => t.threadId === threadId ? { ...t, threadTitle: newTitle.trim() } : t));
        setEditingThreadId(null);
      }
    } catch (e) {
      console.error('Failed to rename thread:', e);
    }
  };

  const handleResolveAllAlerts = async () => {
    if (!confirm('Are you sure you want to resolve and clear all active alerts?')) return;
    setIsResolvingAll(true);
    try {
      const res = await fetch('/api/ai/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolveAll: true })
      });
      if (res.ok) {
        setSystemAlerts([]);
      }
    } catch (e) {
      console.error('Failed to resolve all alerts', e);
    } finally {
      setIsResolvingAll(false);
    }
  };

  const fetchSystemAlerts = async () => {
    try {
      setIsAlertsLoading(true);
      const res = await fetch('/api/ai/alerts');
      if (res.ok) {
        const data = await res.json();
        setSystemAlerts(data.alerts || []);
      }
    } catch (e) {
      console.error('Failed to load system alerts', e);
    } finally {
      setIsAlertsLoading(false);
    }
  };

  const handleResolveAlert = async (alertId: string) => {
    try {
      const res = await fetch('/api/ai/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId })
      });
      if (res.ok) {
        setSystemAlerts(prev => prev.filter(a => a.id !== alertId));
      }
    } catch (e) {
      console.error('Failed to resolve alert', e);
    }
  };

  useEffect(() => {
    fetchThreads();
    loadChatHistory(currentThreadId);
    fetchSystemAlerts();
  }, []);

  useEffect(() => {
    if (currentThreadId) {
      loadChatHistory(currentThreadId);
    }
  }, [currentThreadId]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoadingChat]);

  // ── SEND CHAT MESSAGE ─────────────────────────────────────────────────────
  const handleSendMessage = async (textToSend?: string) => {
    const queryText = textToSend || inputValue;
    if (!queryText.trim()) return;

    if (!textToSend) setInputValue('');
    
    const userMsg: ChatMessage = { role: 'user', content: queryText };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setIsLoadingChat(true);

    try {
      const activeThread = threads.find(t => t.threadId === currentThreadId);
      const activeTitle = activeThread?.threadTitle || 'New Chat';

      const res = await fetch('/api/ai/manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: updatedMessages, 
          requestAudit: false,
          threadId: currentThreadId,
          threadTitle: activeTitle
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Chat response error.');
      }
      
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.error ? `⚠️ Error: ${data.error}` : data.text,
        exportData: data.export,
        emailDraft: data.emailDraft
      };

      setMessages(prev => [...prev, assistantMsg]);

      // Sync active thread title if updated by the AI
      if (data.threadTitle && data.threadTitle !== activeTitle) {
        setThreads(prev => {
          const match = prev.find(t => t.threadId === currentThreadId);
          if (match) {
            return prev.map(t => t.threadId === currentThreadId ? { ...t, threadTitle: data.threadTitle } : t);
          } else {
            return [{ threadId: currentThreadId, threadTitle: data.threadTitle }, ...prev];
          }
        });
      }

    } catch (err: any) {
      console.error('Chat transaction failed:', err);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ Error: ${err.message || 'Failed to reach the AI engine.'}`
      }]);
    } finally {
      setIsLoadingChat(false);
    }
  };

  // ── TRIGGER REPORT EXPORT DOWNLOAD ────────────────────────────────────────
  const triggerExport = async (msgIndex: number, exportData: any) => {
    const uniqueKey = `${msgIndex}-${exportData.title}`;
    setIsExporting(uniqueKey);
    try {
      const res = await fetch('/api/ai/manager/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: exportData.title,
          headers: exportData.headers,
          rows: exportData.rows,
          format: exportData.exportType
        })
      });

      if (!res.ok) throw new Error('Export service failed.');

      if (exportData.exportType === 'pdf') {
        const htmlText = await res.text();
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(htmlText);
          printWindow.document.close();
        }
      } else {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${exportData.title.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Export failed:', err);
      alert('Unable to generate export. Please check connection and try again.');
    } finally {
      setIsExporting(null);
    }
  };

  const triggerSendEmail = async (msgIndex: number, emailDraft: any) => {
    const uniqueKey = `${msgIndex}-${emailDraft.to}`;
    setIsSendingEmail(uniqueKey);
    try {
      const res = await fetch('/api/ai/manager/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: emailDraft.to,
          subject: emailDraft.subject,
          body: emailDraft.body
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to send email.');
      }

      setMessages(prev => {
        const copy = [...prev];
        if (copy[msgIndex]) {
          copy[msgIndex] = {
            ...copy[msgIndex],
            emailSent: true
          };
        }
        return copy;
      });

      alert('Email sent successfully / ईमेल सफलतापूर्वक भेजा गया!');
    } catch (err: any) {
      console.error('Email dispatch failed:', err);
      alert(`Error sending email: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSendingEmail(null);
    }
  };

  const suggestionChips = [
    'Analyze active fee concessions for anomalies',
    'Highlight recent transactions lacking descriptions',
    'List all student fee concessions as an Excel sheet',
    'Give strategic suggestions to optimize hostel mess expenses'
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#fcfaf5] text-ink p-4 gap-4">
      
      {/* HEADER BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-beige pb-3 gap-2 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-brand/10 border border-brand/20 text-brand">
            <Brain className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-brand to-[#6b3bb0] bg-clip-text text-transparent">
              AI Manager Portal
            </h1>
            <p className="text-xs text-mute font-medium">
              Virtual Auditor &amp; Multi-Session Advisory Console
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Security Alerts Button (Migrated from Dashboard) */}
          <button
            onClick={() => {
              fetchSystemAlerts();
              setIsAlertsModalOpen(true);
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
              systemAlerts.length > 0
                ? 'bg-red-50 text-red-800 border-red-200 hover:bg-red-100 animate-pulse'
                : 'bg-paper text-mute border-beige hover:bg-cream'
            }`}
          >
            <Bell className={`w-3.5 h-3.5 ${systemAlerts.length > 0 ? 'text-red-600' : 'text-mute'}`} />
            <span>Security Alerts</span>
            {systemAlerts.length > 0 && (
              <span className="bg-red-600 text-white rounded-full px-1.5 py-0.2 text-[9px]">
                {systemAlerts.length}
              </span>
            )}
          </button>



          <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1.5 rounded bg-brand/10 text-brand border border-brand/25">
            Director Access
          </span>
        </div>
      </div>

      {/* CORE WORKSPACE GRID */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0">
        
        {/* LEFT COLUMN: MULTI-CHAT SIDEBAR */}
        <div className="lg:col-span-3 flex flex-col bg-paper border border-beige rounded-xl overflow-hidden shadow-sm h-[650px]">
          <div className="p-3 border-b border-beige shrink-0">
            <button
              onClick={handleNewChat}
              className="flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-brand text-white hover:bg-[#1a1654] font-bold text-xs cursor-pointer shadow-xs active:scale-[0.98] transition-transform border-none"
            >
              <Plus className="w-4 h-4" />
              <span>New Conversation</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 select-none">
            {threads.length === 0 && (
              <div 
                onClick={() => setCurrentThreadId('default')}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs cursor-pointer transition-colors ${
                  currentThreadId === 'default'
                    ? 'bg-brand/10 text-brand font-bold border border-brand/10'
                    : 'text-ink font-medium hover:bg-cream'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Default Advisor Chat</span>
                </div>
              </div>
            )}

            {threads.map(thread => {
              const isEditing = editingThreadId === thread.threadId;

              if (isEditing) {
                return (
                  <div
                    key={thread.threadId}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs border ${
                      currentThreadId === thread.threadId
                        ? 'bg-brand/10 border-brand/35 text-ink'
                        : 'bg-paper border-beige text-ink'
                    }`}
                  >
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameThread(thread.threadId, editingTitle);
                        if (e.key === 'Escape') setEditingThreadId(null);
                      }}
                      className="flex-1 bg-white border border-beige rounded px-2 py-1 text-xs text-ink focus:outline-none font-medium h-7 min-w-0"
                      autoFocus
                    />
                    <button
                      onClick={() => handleRenameThread(thread.threadId, editingTitle)}
                      className="p-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 cursor-pointer h-7 w-7 flex items-center justify-center shrink-0"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingThreadId(null)}
                      className="p-1 rounded bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 cursor-pointer h-7 w-7 flex items-center justify-center shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={thread.threadId}
                  onClick={() => setCurrentThreadId(thread.threadId)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs cursor-pointer transition-colors group ${
                    currentThreadId === thread.threadId
                      ? 'bg-brand text-white font-bold'
                      : 'text-ink font-medium hover:bg-cream'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate min-w-0 flex-1">
                    <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-80" />
                    <span className="truncate">{thread.threadTitle}</span>
                  </div>
                  
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingThreadId(thread.threadId);
                        setEditingTitle(thread.threadTitle);
                      }}
                      className="p-1 rounded hover:bg-black/10 cursor-pointer text-inherit"
                      title="Rename Chat"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteThread(thread.threadId, e)}
                      className="p-1 rounded hover:bg-black/10 cursor-pointer text-inherit"
                      title="Delete Chat"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: SCROLLABLE CHAT ENGINE CONTAINER */}
        <div className="lg:col-span-9 flex flex-col bg-paper border border-beige rounded-xl overflow-hidden shadow-sm h-[650px]">
          
          <div className="px-4 py-3 bg-cream/40 border-b border-beige/60 flex items-center justify-between shrink-0">
            <span className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-brand" />
              Active Session: {threads.find(t => t.threadId === currentThreadId)?.threadTitle || 'Default Advisor Chat'}
            </span>
            <span className="text-[10px] font-semibold text-mute bg-cream px-2 py-0.5 rounded border border-beige">
              Groq Qwen 3.6
            </span>
          </div>

          {/* SCROLLABLE CONVERSATION FEED */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-field/30">
            {messages.map((msg, index) => (
              <div 
                key={index} 
                className={`flex gap-3 max-w-[85%] ${
                  msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                }`}
              >
                <div className={`p-2 rounded-xl flex-shrink-0 border h-max ${
                  msg.role === 'user' 
                    ? 'bg-brand/10 border-brand/20 text-brand' 
                    : 'bg-cream border border-beige text-brand'
                }`}>
                  <Brain className="w-4 h-4" />
                </div>
                
                <div className="space-y-2 flex-1">
                  <div className={`p-3.5 rounded-xl text-xs leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-brand text-white font-medium shadow-xs' 
                      : 'bg-cream/40 border border-beige/60 text-ink shadow-2xs'
                  }`}>
                    {msg.role === 'user' ? (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    ) : (
                      <FormattedMarkdown content={msg.content} />
                    )}
                  </div>

                  {/* Render Excel/PDF exports */}
                  {msg.exportData && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => triggerExport(index, msg.exportData)}
                        disabled={isExporting !== null}
                        className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold border border-emerald-600/25 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 transition cursor-pointer select-none disabled:opacity-50"
                      >
                        {isExporting === `${index}-${msg.exportData.title}` ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : msg.exportData.exportType === 'excel' ? (
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                        ) : (
                          <FileText className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {isExporting === `${index}-${msg.exportData.title}` 
                            ? 'Generating...' 
                            : `Download ${msg.exportData.exportType === 'excel' ? 'Excel' : 'PDF'}: ${msg.exportData.title}`}
                        </span>
                      </button>
                    </div>
                  )}

                  {/* Render email draft verification card */}
                  {msg.emailDraft && (
                    <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/50 space-y-3 max-w-full text-xs">
                      <div className="flex items-center justify-between border-b border-purple-100 pb-2">
                        <span className="font-bold text-brand uppercase tracking-wider text-[10px]">Email Draft / ईमेल ड्राफ्ट</span>
                        {msg.emailSent ? (
                          <span className="flex items-center gap-1 font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            ✓ Sent / भेजा गया
                          </span>
                        ) : (
                          <span className="text-[10px] text-mute italic">Pending Confirmation</span>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <div>
                          <span className="font-bold text-ink">To:</span> <code className="font-mono text-brand bg-white px-1.5 py-0.5 rounded border border-beige">{msg.emailDraft.to}</code>
                        </div>
                        <div>
                          <span className="font-bold text-ink">Subject:</span> <span className="text-ink font-medium">{msg.emailDraft.subject}</span>
                        </div>
                        <div className="flex flex-col space-y-1">
                          <span className="font-bold text-ink">Body:</span>
                          <textarea
                            value={msg.emailDraft.body}
                            onChange={(e) => {
                              const updatedBody = e.target.value;
                              setMessages(prev => {
                                const copy = [...prev];
                                if (copy[index] && copy[index].emailDraft) {
                                  copy[index] = {
                                    ...copy[index],
                                    emailDraft: {
                                      ...copy[index].emailDraft!,
                                      body: updatedBody
                                    }
                                  };
                                }
                                return copy;
                              });
                            }}
                            disabled={msg.emailSent || isSendingEmail !== null}
                            className="w-full h-32 p-2 rounded-lg border border-beige bg-white font-sans text-xs focus:ring-1 focus:ring-brand focus:border-brand disabled:bg-cream disabled:text-mute outline-none resize-y"
                          />
                        </div>
                      </div>
                      {!msg.emailSent && (
                        <button
                          onClick={() => triggerSendEmail(index, msg.emailDraft)}
                          disabled={isSendingEmail !== null}
                          className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-xs font-bold bg-brand text-white hover:bg-brand-dark active:scale-[0.98] transition cursor-pointer select-none disabled:opacity-50"
                        >
                          {isSendingEmail === `${index}-${msg.emailDraft.to}` ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Sending email...</span>
                            </>
                          ) : (
                            <>
                              <Send className="w-3.5 h-3.5" />
                              <span>Send Email / ईमेल भेजें</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {/* Loading bubble */}
            {isLoadingChat && (
              <div className="flex gap-3 mr-auto max-w-[85%] animate-pulse">
                <div className="p-2 rounded-xl border bg-cream border-beige text-brand">
                  <Brain className="w-4 h-4 animate-bounce" />
                </div>
                <div className="p-3 bg-cream/40 border border-beige/60 text-mute rounded-xl text-xs flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
                  <span>AI Manager is analyzing databases...</span>
                </div>
              </div>
            )}
            
            <div ref={chatEndRef} />
          </div>

          {/* SUGGESTION QUICK CHIPS */}
          <div className="px-4 py-2 border-t border-beige flex gap-2 overflow-x-auto select-none bg-cream/20 shrink-0 max-w-full whitespace-nowrap scrollbar-none">
            {suggestionChips.map((chip, i) => (
              <button
                key={i}
                onClick={() => handleSendMessage(chip)}
                disabled={isLoadingChat}
                className="px-3 py-1.5 rounded-full bg-paper border border-beige hover:bg-brand/10 hover:border-brand/30 hover:text-brand text-mute text-[10px] font-semibold transition cursor-pointer select-none disabled:opacity-50 shrink-0"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* INPUT FORM PANEL */}
          <div className="p-4 border-t border-beige bg-cream/10 flex gap-2 items-center shrink-0">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              disabled={isLoadingChat}
              placeholder="Ask for ledger reports, verify concession anomalies..."
              className="flex-1 bg-white border border-beige rounded-xl px-4 py-2.5 text-xs text-ink placeholder-mute focus:outline-none focus:ring-1 focus:ring-brand/40 focus:border-brand transition disabled:opacity-50"
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={isLoadingChat || !inputValue.trim()}
              className="p-2.5 rounded-xl bg-brand text-white hover:bg-[#1a1654] font-bold transition disabled:opacity-50 disabled:hover:bg-brand cursor-pointer shadow-xs border-none"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

        </div>

      </div>

      {/* ── MODAL 2: SECURITY ALERTS FEED OVERLAY ─────────────────────────── */}
      {isAlertsModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-paper border border-beige w-full max-w-2xl rounded-xl p-5 shadow-lg relative flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => setIsAlertsModalOpen(false)}
              className="absolute top-4 right-4 text-mute hover:text-ink cursor-pointer bg-transparent border-none p-1 rounded-md"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-between pb-3 border-b border-beige shrink-0">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600"></span>
                </span>
                <span className="text-sm font-bold uppercase tracking-wider text-red-800">
                  Security & Anomaly Alerts ({systemAlerts.length})
                </span>
              </div>
              <div className="flex items-center gap-2">
                {systemAlerts.length > 0 && (
                  <button
                    onClick={handleResolveAllAlerts}
                    disabled={isResolvingAll}
                    className="text-[10px] font-bold text-red-700 hover:text-red-800 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded border border-red-200 transition-colors cursor-pointer flex items-center gap-1"
                  >
                    {isResolvingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    Resolve All
                  </button>
                )}
                <span className="text-[10px] font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200/50">
                  Autonomous Agent Active
                </span>
              </div>
            </div>

            {/* ALERTS GRID */}
            <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-1">
              {isAlertsLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-mute">
                  <Loader2 className="w-6 h-6 animate-spin text-brand" />
                  <span className="text-xs">Loading anomalies...</span>
                </div>
              ) : systemAlerts.length === 0 ? (
                <div className="text-center py-12 text-mute text-xs font-medium space-y-1">
                  <p>🎉 All clear! No active ledger anomalies or safety threats detected.</p>
                  <p className="text-[10px] text-mute/80">Autonomous checks run instantly on database mutations.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {systemAlerts.map(alert => (
                    <div key={alert.id} className="bg-[#fcfaf5] border border-beige/65 rounded-lg p-3.5 relative hover:shadow-xs transition-shadow">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <span className={`inline-block text-[8px] font-extrabold uppercase px-1.5 py-0.2 rounded border ${
                            alert.severity === 'CRITICAL' 
                              ? 'bg-red-50 text-red-700 border-red-200' 
                              : alert.severity === 'WARNING' 
                              ? 'bg-amber-50 text-amber-700 border-amber-200' 
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>
                            {alert.severity}
                          </span>
                          <h4 className="text-xs font-bold text-ink truncate">{alert.title}</h4>
                          <p className="text-[10px] text-mute leading-relaxed">{alert.description}</p>
                          <span className="text-[9px] text-mute/80 block font-mono">
                            {new Date(alert.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        </div>
                        <button
                          onClick={() => handleResolveAlert(alert.id)}
                          className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-1.5 rounded border border-emerald-200 transition-colors shrink-0 cursor-pointer"
                        >
                          Resolve
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-beige pt-3 shrink-0 text-right">
              <button
                onClick={() => setIsAlertsModalOpen(false)}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-cream hover:bg-beige/40 text-ink cursor-pointer border-none"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

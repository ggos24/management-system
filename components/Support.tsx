import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  LifeBuoy,
  Search,
  Plus,
  ArrowLeft,
  Send,
  FileText,
  Trash2,
  CheckCircle2,
  RotateCcw,
  Inbox,
  MessageSquare,
} from 'lucide-react';
import { Avatar } from './Avatar';
import { Badge } from './ui/Badge';
import { Button, IconButton } from './ui/Button';
import { CustomSelect, type SelectOption } from './CustomSelect';
import { AlertBanner } from './AlertBanner';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useUiStore } from '../stores/uiStore';
import { supabase } from '../lib/supabase';
import * as db from '../lib/database';
import {
  isAdmin,
  TICKET_STATUS_META,
  TICKET_STATUSES,
  TICKET_STATUS_TRANSITIONS,
  TICKET_CATEGORY_META,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  PRIORITY_DOT,
} from '../constants';
import type { Member, Ticket, TicketCategory, TicketComment, TicketStatus, Priority } from '../types';
import { renderCommentContent, parseMentionedMemberIds, formatRelativeTime } from '../lib/mentions';

const StatusBadge: React.FC<{ status: TicketStatus }> = ({ status }) => {
  const meta = TICKET_STATUS_META[status];
  return <Badge color={meta.badge}>{meta.label}</Badge>;
};

const PriorityDot: React.FC<{ priority: Priority; withLabel?: boolean }> = ({ priority, withLabel }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
    <span className={`w-2 h-2 rounded-full ${PRIORITY_DOT[priority] || 'bg-zinc-400'}`} />
    {withLabel && <span className="capitalize">{priority}</span>}
  </span>
);

const isImageAttachment = (type?: string) => (type || '').startsWith('image/');

// ---------------------------------------------------------------------------
// Ticket detail (keyed by ticket id at the parent, so state resets per ticket)
// ---------------------------------------------------------------------------

interface TicketDetailProps {
  ticket: Ticket;
  members: Member[];
  admin: boolean;
  currentUserId: string;
  currentUserName: string;
  onBack: () => void;
}

const TicketDetail: React.FC<TicketDetailProps> = ({
  ticket,
  members,
  admin,
  currentUserId,
  currentUserName,
  onBack,
}) => {
  const {
    updateTicket,
    updateTicketStatus,
    assignTicket,
    reopenTicket,
    deleteTicket,
    addTicketComment,
    notifyTicketMention,
  } = useDataStore();

  const [comments, setComments] = useState<TicketComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const memberName = (id: string | null) => (id ? (members.find((m) => m.id === id)?.name ?? 'Unknown') : null);
  const memberAvatar = (id: string | null) => (id ? members.find((m) => m.id === id)?.avatar : undefined);

  const meta = TICKET_STATUS_META[ticket.status];
  const isOwner = ticket.reporterId === currentUserId;
  const canReopen = (admin || isOwner) && meta.isDone;

  // Load + live-update the conversation
  useEffect(() => {
    let active = true;
    db.fetchTicketComments(ticket.id)
      .then((d) => active && setComments(d))
      .catch(() => toast.error('Failed to load conversation'))
      .finally(() => active && setLoadingComments(false));
    const channel = supabase
      .channel(`ticket-comments-${ticket.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ticket_comments', filter: `ticket_id=eq.${ticket.id}` },
        () => {
          db.fetchTicketComments(ticket.id)
            .then((d) => active && setComments(d))
            .catch(console.error);
        },
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [ticket.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  const handleSend = async () => {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    const comment = await addTicketComment(ticket.id, text);
    setSending(false);
    if (comment) {
      setReply('');
      setComments((prev) => [...prev, comment]);
      const mentioned = parseMentionedMemberIds(text, members);
      if (mentioned.length > 0) notifyTicketMention(mentioned, currentUserName, ticket.title, ticket.id);
    }
  };

  const statusOptions: SelectOption[] = [ticket.status, ...TICKET_STATUS_TRANSITIONS[ticket.status]].map((s) => ({
    value: s,
    label: TICKET_STATUS_META[s].label,
  }));
  const priorityOptions: SelectOption[] = TICKET_PRIORITIES.map((p) => ({
    value: p,
    label: (
      <span className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${PRIORITY_DOT[p]}`} />
        <span className="capitalize">{p}</span>
      </span>
    ),
  }));
  const categoryOptions: SelectOption[] = TICKET_CATEGORIES.map((c) => ({
    value: c,
    label: TICKET_CATEGORY_META[c].label,
  }));
  const assigneeOptions: SelectOption[] = [
    { value: '', label: 'Unassigned' },
    ...members.map((m) => ({ value: m.id, label: m.name })),
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-zinc-200 dark:border-zinc-800 px-4 md:px-6 py-3 space-y-3">
        <div className="flex items-start gap-2">
          <IconButton size="sm" className="md:hidden -ml-1" onClick={onBack} aria-label="Back">
            <ArrowLeft size={18} />
          </IconButton>
          <div className="min-w-0 flex-1">
            <h2 className="text-base md:text-lg font-semibold text-zinc-900 dark:text-white break-words">
              {ticket.title}
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              {TICKET_CATEGORY_META[ticket.category].label} · reported by {memberName(ticket.reporterId)} ·{' '}
              {formatRelativeTime(ticket.createdAt)}
            </p>
          </div>
          {admin && (
            <IconButton
              size="sm"
              aria-label="Delete ticket"
              onClick={() => {
                if (confirm('Delete this ticket permanently?')) {
                  deleteTicket(ticket.id);
                  onBack();
                }
              }}
              className="hover:text-red-600 dark:hover:text-red-400"
            >
              <Trash2 size={16} />
            </IconButton>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {admin ? (
            <>
              <CustomSelect
                className="w-44"
                options={statusOptions}
                value={ticket.status}
                onChange={(v) => updateTicketStatus(ticket.id, v as TicketStatus)}
                renderValue={() => <StatusBadge status={ticket.status} />}
              />
              <CustomSelect
                className="w-32"
                options={priorityOptions}
                value={ticket.priority}
                onChange={(v) => updateTicket(ticket.id, { priority: v as Priority })}
                renderValue={(v) => <PriorityDot priority={v as Priority} withLabel />}
              />
              <CustomSelect
                className="w-40"
                options={categoryOptions}
                value={ticket.category}
                onChange={(v) => updateTicket(ticket.id, { category: v as TicketCategory })}
              />
              <CustomSelect
                className="w-48"
                searchable
                options={assigneeOptions}
                value={ticket.assigneeId ?? ''}
                onChange={(v) => assignTicket(ticket.id, v || null)}
                placeholder="Assign…"
              />
            </>
          ) : (
            <>
              <StatusBadge status={ticket.status} />
              <PriorityDot priority={ticket.priority} withLabel />
              <Badge color="zinc">{TICKET_CATEGORY_META[ticket.category].label}</Badge>
              {ticket.assigneeId && (
                <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                  <Avatar src={memberAvatar(ticket.assigneeId)} alt={memberName(ticket.assigneeId) || ''} size="xs" />
                  {memberName(ticket.assigneeId)}
                </span>
              )}
            </>
          )}

          <div className="ml-auto flex items-center gap-2">
            {admin && !meta.isDone && (
              <Button size="sm" variant="primary" onClick={() => updateTicketStatus(ticket.id, 'resolved')}>
                <CheckCircle2 size={14} className="mr-1.5" /> Resolve
              </Button>
            )}
            {canReopen && (
              <Button size="sm" variant="ghost" onClick={() => reopenTicket(ticket.id)}>
                <RotateCcw size={14} className="mr-1.5" /> Reopen
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Body (scrollable) */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-5 min-h-0">
        {meta.isDone && (
          <AlertBanner
            variant={ticket.status === 'resolved' ? 'info' : 'warning'}
            icon={CheckCircle2}
            message={
              ticket.status === 'resolved'
                ? `Marked resolved${ticket.resolvedBy ? ` by ${memberName(ticket.resolvedBy)}` : ''}. Reopen if the problem persists.`
                : 'This ticket is closed.'
            }
          />
        )}

        {ticket.description && (
          <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words">
            {ticket.description}
          </p>
        )}

        {ticket.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {ticket.attachments.map((a) =>
              isImageAttachment(a.type) ? (
                <a key={a.url} href={a.url} target="_blank" rel="noopener noreferrer" title={a.name}>
                  <img
                    src={a.url}
                    alt={a.name}
                    className="w-24 h-24 rounded-lg object-cover border border-zinc-200 dark:border-zinc-700 hover:opacity-90 transition-opacity"
                  />
                </a>
              ) : (
                <a
                  key={a.url}
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  <FileText size={15} className="text-zinc-400" />{' '}
                  <span className="truncate max-w-[160px]">{a.name}</span>
                </a>
              ),
            )}
          </div>
        )}

        {/* Conversation */}
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
            <MessageSquare size={13} /> Conversation
          </h3>
          {loadingComments ? (
            <p className="text-sm text-zinc-400">Loading…</p>
          ) : comments.length === 0 ? (
            <p className="text-sm text-zinc-400">No replies yet. Add details or ask a question below.</p>
          ) : (
            <div className="space-y-4">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-2.5">
                  <Avatar src={c.userAvatar} alt={c.userName || ''} size="sm" className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{c.userName}</span>
                      <span className="text-[11px] text-zinc-400">{formatRelativeTime(c.createdAt)}</span>
                    </div>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words">
                      {renderCommentContent(c.content, members)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      {/* Composer */}
      <div className="flex-shrink-0 border-t border-zinc-200 dark:border-zinc-800 p-3 md:px-6 safe-b">
        <div className="flex items-end gap-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={1}
            placeholder="Write a reply…  (@ to mention)"
            className="flex-1 px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-1 focus:ring-zinc-400 text-base md:text-sm text-zinc-900 dark:text-white resize-none max-h-32"
          />
          <Button variant="primary" size="md" onClick={handleSend} disabled={!reply.trim() || sending}>
            <Send size={15} />
          </Button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Support view (inbox + detail)
// ---------------------------------------------------------------------------

export default function Support() {
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const tickets = useDataStore((s) => s.tickets);
  const members = useDataStore((s) => s.members);
  const setIsNewTicketModalOpen = useUiStore((s) => s.setIsNewTicketModalOpen);
  const admin = isAdmin(currentUser.role);

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('ticket');
  const [statusFilter, setStatusFilter] = useState<'all' | TicketStatus>('all');
  const [search, setSearch] = useState('');

  const select = (id: string | null) => {
    setSearchParams(
      (prev) => {
        if (id) prev.set('ticket', id);
        else prev.delete('ticket');
        return prev;
      },
      { replace: true },
    );
  };

  const visibleTickets = useMemo(() => {
    let list = tickets;
    if (statusFilter !== 'all') list = list.filter((t) => t.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
    }
    return list;
  }, [tickets, statusFilter, search]);

  const selected = selectedId ? (tickets.find((t) => t.id === selectedId) ?? null) : null;

  const tabs: Array<{ key: 'all' | TicketStatus; label: string }> = [
    { key: 'all', label: 'All' },
    ...TICKET_STATUSES.map((s) => ({ key: s, label: TICKET_STATUS_META[s].label })),
  ];

  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? 'Unknown';

  return (
    <div className="h-full flex">
      {/* List rail */}
      <div
        className={`w-full md:w-80 lg:w-96 flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 flex-col bg-white dark:bg-zinc-950 ${
          selected ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div className="flex-shrink-0 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <h1 className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-white">
              <LifeBuoy size={18} /> {admin ? 'Support' : 'My tickets'}
            </h1>
            <Button size="sm" variant="primary" onClick={() => setIsNewTicketModalOpen(true)}>
              <Plus size={14} className="mr-1" /> New
            </Button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tickets…"
              className="w-full pl-8 pr-3 py-1.5 bg-zinc-100 dark:bg-zinc-800/50 border-none rounded-md text-sm outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
            />
          </div>
          <div className="flex gap-1 mt-2 overflow-x-auto -mx-1 px-1 custom-scrollbar">
            {tabs.map((t) => {
              const count = t.key === 'all' ? tickets.length : tickets.filter((tk) => tk.status === t.key).length;
              const active = statusFilter === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setStatusFilter(t.key)}
                  className={`flex-shrink-0 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    active
                      ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                      : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {t.label}
                  {count > 0 && <span className={`ml-1 ${active ? 'opacity-70' : 'text-zinc-400'}`}>{count}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {visibleTickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center h-full px-6 py-12 text-zinc-400">
              <Inbox size={28} className="mb-3" />
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                {tickets.length === 0 ? 'No tickets yet' : 'No tickets match'}
              </p>
              {tickets.length === 0 && (
                <button
                  onClick={() => setIsNewTicketModalOpen(true)}
                  className="mt-2 text-sm text-blue-600 hover:underline"
                >
                  Report a problem
                </button>
              )}
            </div>
          ) : (
            visibleTickets.map((t) => {
              const isActive = t.id === selectedId;
              return (
                <button
                  key={t.id}
                  onClick={() => select(t.id)}
                  className={`w-full text-left px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/70 transition-colors ${
                    isActive ? 'bg-zinc-100 dark:bg-zinc-800/60' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <StatusBadge status={t.status} />
                    <PriorityDot priority={t.priority} />
                  </div>
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100 truncate">{t.title}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
                    {TICKET_CATEGORY_META[t.category].label}
                    {admin && ` · ${memberName(t.reporterId)}`} · {formatRelativeTime(t.updatedAt || t.createdAt)}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Detail */}
      <div className={`flex-1 min-w-0 flex-col bg-white dark:bg-zinc-950 ${selected ? 'flex' : 'hidden md:flex'}`}>
        {selected ? (
          <TicketDetail
            key={selected.id}
            ticket={selected}
            members={members}
            admin={admin}
            currentUserId={currentUser.id}
            currentUserName={currentUser.name}
            onBack={() => select(null)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center text-zinc-400 px-6">
            <LifeBuoy size={36} className="mb-3" />
            <p className="text-sm">{selectedId ? 'Ticket not found' : 'Select a ticket to view the conversation'}</p>
          </div>
        )}
      </div>
    </div>
  );
}

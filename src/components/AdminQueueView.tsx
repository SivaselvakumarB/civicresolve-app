import { useMemo, useState } from 'react';
import { Check, Copy, Loader2, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import {
  LIMITS,
  TICKET_STATUSES,
  getNextAdminStatus,
  validateStatusTransition,
  type CivicTicket,
  type TicketStatus,
} from '../shared/civicDomain';
import { FIREBASE_DATABASE_ID, FIREBASE_PROJECT_ID } from '../lib/firebase';
import { StatusTimeline } from './StatusTimeline';

interface AdminQueueViewProps {
  isAdmin: boolean;
  checkingAdmin: boolean;
  userUid: string;
  userEmail: string;
  tickets: CivicTicket[];
  loading: boolean;
  error: string | null;
  onRefreshAdminStatus: () => Promise<void>;
  onAdvanceStatus: (
    ticket: CivicTicket,
    nextStatus: TicketStatus,
    resolutionNote?: string
  ) => Promise<void>;
}

type StatusFilter = 'All' | TicketStatus;

function statusTextClass(status: TicketStatus): string {
  if (status === 'Resolved') return 'text-emerald-700';
  if (status === 'In Progress') return 'text-amber-700';
  return 'text-blue-700';
}

function urgencyTextClass(urgency: string): string {
  if (urgency === 'Critical' || urgency === 'High') return 'text-red-700';
  if (urgency === 'Medium') return 'text-amber-700';
  return 'text-slate-600';
}

function formatShortDate(ms: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms));
}

export function AdminQueueView({
  isAdmin,
  checkingAdmin,
  userUid,
  userEmail,
  tickets,
  loading,
  error,
  onRefreshAdminStatus,
  onAdvanceStatus,
}: AdminQueueViewProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [copiedUid, setCopiedUid] = useState(false);

  const filteredTickets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (statusFilter !== 'All' && ticket.status !== statusFilter) return false;
      if (!q) return true;
      return (
        ticket.id.toLowerCase().includes(q) ||
        ticket.title.toLowerCase().includes(q) ||
        ticket.location.toLowerCase().includes(q) ||
        ticket.ownerEmail.toLowerCase().includes(q) ||
        ticket.recommendedDepartment.toLowerCase().includes(q)
      );
    });
  }, [tickets, statusFilter, searchQuery]);

  const activeTicket = useMemo(() => {
    if (filteredTickets.length === 0) return null;
    if (selectedId) {
      const found = filteredTickets.find((t) => t.id === selectedId);
      if (found) return found;
    }
    return filteredTickets[0];
  }, [filteredTickets, selectedId]);

  const counts = useMemo(
    () => ({
      All: tickets.length,
      Reported: tickets.filter((t) => t.status === 'Reported').length,
      'In Progress': tickets.filter((t) => t.status === 'In Progress').length,
      Resolved: tickets.filter((t) => t.status === 'Resolved').length,
      PendingReview: tickets.filter((t) => t.triageStatus === 'pending_review').length,
    }),
    [tickets]
  );

  const handleCopyUid = async () => {
    try {
      await navigator.clipboard.writeText(userUid);
      setCopiedUid(true);
      setTimeout(() => setCopiedUid(false), 2000);
    } catch {
      // Clipboard may be unavailable in restricted contexts
    }
  };

  if (checkingAdmin) {
    return (
      <section className="bg-white border border-slate-200 rounded-xl p-8 flex items-center gap-3 text-sm text-slate-600">
        <Loader2 className="w-4 h-4 animate-spin text-slate-500" aria-hidden="true" />
        Verifying allowlist entry in admins/{userUid}…
      </section>
    );
  }

  if (!isAdmin) {
    const consoleUrl = `https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/firestore/databases/${FIREBASE_DATABASE_ID}/data`;
    return (
      <section className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
        <div className="flex items-start gap-3 pb-5 border-b border-slate-200">
          <ShieldAlert className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-slate-900">
              Admin allowlist entry required
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Firestore Security Rules enforce admin-only queue access and status updates through a
              console-managed <code className="font-mono text-xs text-slate-800">admins/&#123;uid&#125;</code>{' '}
              collection. Your account is currently signed in with standard citizen permissions.
            </p>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
          <p className="text-xs text-slate-500">Your Signed-In Firebase Auth UID</p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <code className="text-sm font-mono text-slate-900 break-all">{userUid}</code>
            <button
              type="button"
              onClick={handleCopyUid}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              {copiedUid ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                  Copied UID
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                  Copy UID
                </>
              )}
            </button>
          </div>
          <p className="text-xs text-slate-500">Signed-in email: {userEmail}</p>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Firebase Console Steps to Grant Admin Access
          </h2>
          <ol className="space-y-2 text-sm text-slate-700 leading-relaxed list-decimal list-inside">
            <li>
              Open Firestore Data for project{' '}
              <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                {FIREBASE_PROJECT_ID}
              </code>{' '}
              (database{' '}
              <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                {FIREBASE_DATABASE_ID}
              </code>
              ) in the{' '}
              <a
                href={consoleUrl}
                target="_blank"
                rel="noreferrer"
                className="text-blue-700 underline hover:text-blue-800"
              >
                Firebase Console
              </a>
              .
            </li>
            <li>
              Click <strong>Start collection</strong> (or open existing) and set Collection ID to{' '}
              <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">admins</code>.
            </li>
            <li>
              Set <strong>Document ID</strong> to your exact Firebase Auth UID shown above:{' '}
              <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">{userUid}</code>.
            </li>
            <li>
              Add fields such as{' '}
              <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                role: &quot;admin&quot;
              </code>{' '}
              and{' '}
              <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                email: &quot;{userEmail}&quot;
              </code>
              , then click <strong>Save</strong>.
            </li>
            <li>Return here and click Re-check Admin Access below.</li>
          </ol>
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={onRefreshAdminStatus}
            className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Re-check Admin Access
          </button>
        </div>
      </section>
    );
  }

  const handleSelectTicket = (ticket: CivicTicket) => {
    setSelectedId(ticket.id);
    setResolutionNote('');
    setActionError(null);
  };

  const handleTransition = async (ticket: CivicTicket, nextStatus: TicketStatus) => {
    setActionError(null);
    const check = validateStatusTransition(
      ticket.status,
      nextStatus,
      nextStatus === 'Resolved' ? resolutionNote : undefined
    );
    if (!check.valid) {
      setActionError(check.error);
      return;
    }

    setUpdatingId(ticket.id);
    try {
      await onAdvanceStatus(ticket, nextStatus, check.cleanedResolutionNote);
      setResolutionNote('');
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to update ticket status. Please try again.'
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const nextStatus = activeTicket ? getNextAdminStatus(activeTicket.status) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Municipal Admin Triage Queue</h1>
          <p className="text-sm text-slate-600 mt-1">
            Review incoming reports, verify AI department recommendations, and progress tickets from
            Reported to In Progress to Resolved.
          </p>
        </div>
        <span className="text-xs font-mono text-slate-500">
          Verified allowlist · admins/{userUid.slice(0, 10)}…
        </span>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-white p-4 sm:p-5">
          <dt className="text-xs text-slate-500">Total Tickets</dt>
          <dd className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
            {counts.All}
          </dd>
        </div>
        <div className="bg-white p-4 sm:p-5">
          <dt className="text-xs text-slate-500">Reported</dt>
          <dd className="text-2xl font-semibold font-mono tabular-nums text-blue-700 mt-1">
            {counts.Reported}
          </dd>
        </div>
        <div className="bg-white p-4 sm:p-5">
          <dt className="text-xs text-slate-500">In Progress</dt>
          <dd className="text-2xl font-semibold font-mono tabular-nums text-amber-700 mt-1">
            {counts['In Progress']}
          </dd>
        </div>
        <div className="bg-white p-4 sm:p-5">
          <dt className="text-xs text-slate-500">Resolved · Pending Triage</dt>
          <dd className="text-2xl font-semibold font-mono tabular-nums text-emerald-700 mt-1">
            {counts.Resolved}
            <span className="text-sm font-normal text-slate-500 ml-2">
              / {counts.PendingReview} pending
            </span>
          </dd>
        </div>
      </dl>

      {error && (
        <div
          role="alert"
          className="p-4 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg"
        >
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label="Filter admin queue by status"
          className="inline-flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg overflow-x-auto max-w-full"
        >
          {(['All', ...TICKET_STATUSES] as StatusFilter[]).map((tab) => {
            const active = statusFilter === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab}{' '}
                <span className="font-mono tabular-nums text-slate-400 ml-0.5">
                  {counts[tab]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-80">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <label htmlFor="admin-queue-search" className="sr-only">
            Search all municipal tickets
          </label>
          <input
            id="admin-queue-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search ticket ID, department, citizen…"
            className="w-full min-h-[40px] pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
          />
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" aria-hidden="true" />
          ))}
        </div>
      ) : filteredTickets.length === 0 ? (
        <section className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-1">
          <h2 className="text-base font-semibold text-slate-900">Queue is clear</h2>
          <p className="text-sm text-slate-600">
            No tickets match the current filter. New citizen reports appear here automatically.
          </p>
        </section>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden">
            {filteredTickets.map((ticket) => {
              const isSelected = activeTicket?.id === ticket.id;
              return (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => handleSelectTicket(ticket)}
                  className={`w-full text-left p-4 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-blue-700 ${
                    isSelected ? 'bg-blue-50/60' : 'bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-mono font-medium text-slate-800 tabular-nums">
                      {ticket.id}
                    </span>
                    <span className={`font-semibold ${statusTextClass(ticket.status)}`}>
                      {ticket.status}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 mt-1 line-clamp-1">
                    {ticket.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 mt-1.5">
                    <span>{ticket.recommendedDepartment}</span>
                    <span aria-hidden="true">·</span>
                    <span className={urgencyTextClass(ticket.urgency)}>
                      {ticket.urgency === 'Pending review'
                        ? 'Triage: Pending review'
                        : `${ticket.urgency} urgency`}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 mt-1">
                    <span className="truncate">{ticket.ownerName}</span>
                    <span className="font-mono tabular-nums">
                      {formatShortDate(ticket.createdAtMs)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {activeTicket && (
            <article className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 sm:p-7 space-y-6">
              <div className="border-b border-slate-200 pb-4 space-y-1.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                  <span className="font-mono font-semibold text-slate-800 tabular-nums">
                    {activeTicket.id}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className={`font-semibold ${statusTextClass(activeTicket.status)}`}>
                    {activeTicket.status}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Citizen: {activeTicket.ownerName} ({activeTicket.ownerEmail})
                  </span>
                </div>
                <h2 className="text-lg font-semibold text-slate-900">{activeTicket.title}</h2>
                <p className="text-sm text-slate-600">{activeTicket.location}</p>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900">Report Description</h3>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {activeTicket.description}
                </p>
                <p className="text-xs text-slate-500">
                  Citizen selected: {activeTicket.selectedCategory}
                </p>
              </div>

              {activeTicket.imageDataUrl && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900">Citizen Photo</h3>
                  <img
                    src={activeTicket.imageDataUrl}
                    alt={`Photo attached to ticket ${activeTicket.id}`}
                    referrerPolicy="no-referrer"
                    className="max-h-60 w-auto rounded-lg border border-slate-200 object-contain bg-slate-50"
                  />
                </div>
              )}

              <div
                className={`rounded-lg border p-4 space-y-2.5 ${
                  activeTicket.triageStatus === 'pending_review'
                    ? 'bg-amber-50/50 border-amber-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-xs font-semibold text-slate-900">
                    {activeTicket.triageStatus === 'pending_review'
                      ? 'Triage: Pending review'
                      : 'Gemini Triage Recommendation'}
                  </h3>
                  <span className={`text-xs font-semibold ${urgencyTextClass(activeTicket.urgency)}`}>
                    Urgency: {activeTicket.urgency}
                  </span>
                </div>
                <p className="text-sm font-medium text-slate-900">
                  {activeTicket.recommendedCategory} → {activeTicket.recommendedDepartment}
                </p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {activeTicket.triageReason}
                </p>
              </div>

              <div className="border-t border-slate-200 pt-5 space-y-4">
                <h3 className="text-sm font-semibold text-slate-900">Admin Status Action</h3>

                {actionError && (
                  <div
                    role="alert"
                    className="p-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg"
                  >
                    {actionError}
                  </div>
                )}

                {nextStatus === 'In Progress' && (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-600">
                      Move this report from <strong>Reported</strong> to{' '}
                      <strong>In Progress</strong> once assigned for municipal crew dispatch.
                    </p>
                    <button
                      type="button"
                      disabled={updatingId === activeTicket.id}
                      onClick={() => handleTransition(activeTicket, 'In Progress')}
                      className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      {updatingId === activeTicket.id && (
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      )}
                      Move to In Progress
                    </button>
                  </div>
                )}

                {nextStatus === 'Resolved' && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex items-baseline justify-between">
                        <label
                          htmlFor="admin-resolution-note"
                          className="text-sm font-medium text-slate-900"
                        >
                          Resolution Note (Required)
                        </label>
                        <span className="text-xs font-mono text-slate-400 tabular-nums">
                          {resolutionNote.trim().length}/{LIMITS.RESOLUTION_NOTE_MAX}
                        </span>
                      </div>
                      <textarea
                        id="admin-resolution-note"
                        rows={3}
                        maxLength={LIMITS.RESOLUTION_NOTE_MAX}
                        value={resolutionNote}
                        onChange={(e) => setResolutionNote(e.target.value)}
                        placeholder="Document the work completed, crew action, and verification result (min 10 characters)…"
                        className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={updatingId === activeTicket.id}
                      onClick={() => handleTransition(activeTicket, 'Resolved')}
                      className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      {updatingId === activeTicket.id && (
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      )}
                      Mark as Resolved
                    </button>
                  </div>
                )}

                {nextStatus === null && (
                  <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-lg space-y-1">
                    <p className="text-sm font-semibold text-emerald-900">
                      Ticket Resolved (Closed)
                    </p>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {activeTicket.resolutionNote}
                    </p>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 pt-5">
                <StatusTimeline
                  currentStatus={activeTicket.status}
                  timeline={activeTicket.timeline}
                />
              </div>
            </article>
          )}
        </div>
      )}
    </div>
  );
}

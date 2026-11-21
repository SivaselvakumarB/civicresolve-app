import { useMemo, useState } from 'react';
import { FileText, Plus, Search } from 'lucide-react';
import { TICKET_STATUSES, type CivicTicket, type TicketStatus } from '../shared/civicDomain';
import { StatusTimeline } from './StatusTimeline';

interface MyReportsViewProps {
  tickets: CivicTicket[];
  loading: boolean;
  error: string | null;
  initialSelectedId: string | null;
  onStartNewReport: () => void;
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
    year: 'numeric',
  }).format(new Date(ms));
}

export function MyReportsView({
  tickets,
  loading,
  error,
  initialSelectedId,
  onStartNewReport,
}: MyReportsViewProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);

  const filteredTickets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (statusFilter !== 'All' && ticket.status !== statusFilter) return false;
      if (!q) return true;
      return (
        ticket.id.toLowerCase().includes(q) ||
        ticket.title.toLowerCase().includes(q) ||
        ticket.location.toLowerCase().includes(q) ||
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
    }),
    [tickets]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">My Reports</h1>
          <p className="text-sm text-slate-600 mt-1">
            Tickets submitted under your account, with AI routing recommendations and status
            timeline.
          </p>
        </div>

        <button
          type="button"
          onClick={onStartNewReport}
          className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          New Report
        </button>
      </div>

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
          aria-label="Filter my reports by status"
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

        <div className="relative w-full sm:w-72">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <label htmlFor="my-reports-search" className="sr-only">
            Search your reports
          </label>
          <input
            id="my-reports-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search ID, title, or street…"
            className="w-full min-h-[40px] pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
          />
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          {[0, 1, 2].map((idx) => (
            <div
              key={idx}
              className="h-16 bg-slate-100 rounded-lg animate-pulse"
              aria-hidden="true"
            />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <section className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-4">
          <FileText className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-900">No reports submitted yet</h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Submit a civic infrastructure issue to receive a ticket ID, department routing
              recommendation, and real-time resolution timeline.
            </p>
          </div>
          <div>
            <button
              type="button"
              onClick={onStartNewReport}
              className="min-h-[44px] px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              Submit First Report
            </button>
          </div>
        </section>
      ) : filteredTickets.length === 0 ? (
        <section className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
          <h2 className="text-base font-semibold text-slate-900">No matching tickets</h2>
          <p className="text-sm text-slate-600">
            Try clearing your search filter or switching back to All statuses.
          </p>
        </section>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden">
            {filteredTickets.map((ticket) => {
              const isSelected = activeTicket?.id === ticket.id;
              return (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedId(ticket.id)}
                  className={`w-full text-left p-4 sm:p-5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-blue-700 ${
                    isSelected ? 'bg-blue-50/60' : 'bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2 text-xs text-slate-500">
                    <span className="font-mono tabular-nums text-slate-700 font-medium">
                      {ticket.id}
                    </span>
                    <span className={`font-semibold ${statusTextClass(ticket.status)}`}>
                      {ticket.status}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 mt-1 line-clamp-1">
                    {ticket.title}
                  </p>
                  <p className="text-xs text-slate-600 mt-1 line-clamp-1">{ticket.location}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 mt-2">
                    <span>{ticket.recommendedDepartment}</span>
                    <span aria-hidden="true">·</span>
                    <span className={urgencyTextClass(ticket.urgency)}>
                      {ticket.urgency === 'Pending review'
                        ? 'Triage: Pending review'
                        : `Urgency: ${ticket.urgency}`}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {formatShortDate(ticket.createdAtMs)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {activeTicket && (
            <article className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
              <div className="border-b border-slate-200 pb-5 space-y-2">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
                  <span className="font-mono font-semibold text-slate-800 tabular-nums">
                    {activeTicket.id}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className={`font-semibold ${statusTextClass(activeTicket.status)}`}>
                    Status: {activeTicket.status}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    Filed {formatShortDate(activeTicket.createdAtMs)}
                  </span>
                </div>
                <h2 className="text-xl font-semibold text-slate-900">{activeTicket.title}</h2>
                <p className="text-sm text-slate-600">{activeTicket.location}</p>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900">Citizen Report Details</h3>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {activeTicket.description}
                </p>
                <p className="text-xs text-slate-500 pt-1">
                  Submitted category selection: {activeTicket.selectedCategory}
                </p>
              </div>

              {activeTicket.imageDataUrl && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900">Attached Photo</h3>
                  <img
                    src={activeTicket.imageDataUrl}
                    alt={`Photo evidence for ticket ${activeTicket.id}`}
                    referrerPolicy="no-referrer"
                    className="max-h-72 w-auto rounded-lg border border-slate-200 object-contain bg-slate-50"
                  />
                </div>
              )}

              <div
                className={`rounded-lg border p-5 space-y-3 ${
                  activeTicket.triageStatus === 'pending_review'
                    ? 'bg-amber-50/50 border-amber-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {activeTicket.triageStatus === 'pending_review'
                      ? 'Triage Status: Pending review'
                      : 'AI Triage Recommendation (Advisory)'}
                  </h3>
                  <span className="text-xs text-slate-500">
                    {activeTicket.triageStatus === 'pending_review'
                      ? 'Awaiting manual routing'
                      : 'Mapped to fixed department'}
                  </span>
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <dt className="text-xs text-slate-500">Category</dt>
                    <dd className="font-medium text-slate-900 mt-0.5">
                      {activeTicket.recommendedCategory}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Department</dt>
                    <dd className="font-medium text-slate-900 mt-0.5">
                      {activeTicket.recommendedDepartment}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Urgency</dt>
                    <dd
                      className={`font-semibold mt-0.5 ${urgencyTextClass(activeTicket.urgency)}`}
                    >
                      {activeTicket.urgency}
                    </dd>
                  </div>
                </dl>
                <p className="text-sm text-slate-700 leading-relaxed pt-2 border-t border-slate-200/80">
                  {activeTicket.triageReason}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-200">
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

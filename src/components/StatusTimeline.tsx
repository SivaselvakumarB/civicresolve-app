import { Check, Circle, Clock } from 'lucide-react';
import { TICKET_STATUSES, type TicketStatus, type TimelineEntry } from '../shared/civicDomain';

interface StatusTimelineProps {
  currentStatus: TicketStatus;
  timeline: TimelineEntry[];
}

function formatTimestamp(ms: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms));
}

export function StatusTimeline({ currentStatus, timeline }: StatusTimelineProps) {
  const entryByStatus = new Map<TicketStatus, TimelineEntry>();
  for (const entry of timeline) {
    entryByStatus.set(entry.status, entry);
  }

  const currentIdx = TICKET_STATUSES.indexOf(currentStatus);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Status Timeline</h3>
        <span className="text-xs font-mono text-slate-500 tabular-nums">
          Step {currentIdx + 1} of {TICKET_STATUSES.length}
        </span>
      </div>

      <ol className="space-y-4" aria-label="Ticket status timeline">
        {TICKET_STATUSES.map((step, index) => {
          const entry = entryByStatus.get(step);
          const isReached = index <= currentIdx;
          const isCurrent = step === currentStatus;
          const isLast = index === TICKET_STATUSES.length - 1;

          return (
            <li key={step} className="relative flex gap-3.5">
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`absolute left-[11px] top-6 bottom-[-16px] w-px ${
                    index < currentIdx ? 'bg-slate-400' : 'bg-slate-200'
                  }`}
                />
              )}

              <span
                aria-hidden="true"
                className={`relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                  step === 'Resolved' && isReached
                    ? 'border-emerald-700 bg-emerald-50 text-emerald-700'
                    : isCurrent
                      ? 'border-blue-700 bg-blue-50 text-blue-700'
                      : isReached
                        ? 'border-slate-700 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-300'
                }`}
              >
                {index < currentIdx || (step === 'Resolved' && isReached) ? (
                  <Check className="w-3.5 h-3.5" />
                ) : isCurrent ? (
                  <Clock className="w-3.5 h-3.5" />
                ) : (
                  <Circle className="w-2.5 h-2.5" />
                )}
              </span>

              <div className="min-w-0 flex-1 pb-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p
                    className={`text-sm font-medium ${
                      isReached ? 'text-slate-900' : 'text-slate-400'
                    }`}
                  >
                    {step}
                    {isCurrent && (
                      <span className="ml-2 text-xs font-normal text-slate-500">· Current</span>
                    )}
                  </p>
                  {entry && (
                    <time
                      dateTime={new Date(entry.timestampMs).toISOString()}
                      className="text-xs font-mono text-slate-500 tabular-nums"
                    >
                      {formatTimestamp(entry.timestampMs)}
                    </time>
                  )}
                </div>

                {entry ? (
                  <div className="mt-1 space-y-1">
                    <p className="text-xs text-slate-500">Recorded by {entry.actor}</p>
                    <p
                      className={`text-sm leading-relaxed ${
                        step === 'Resolved'
                          ? 'text-slate-900 bg-emerald-50/60 border border-emerald-200 rounded-lg p-3 mt-1.5'
                          : 'text-slate-600'
                      }`}
                    >
                      {step === 'Resolved' && (
                        <span className="block text-xs font-medium text-emerald-800 mb-1">
                          Resolution Note
                        </span>
                      )}
                      {entry.note}
                    </p>
                  </div>
                ) : (
                  <p className="mt-0.5 text-xs text-slate-400">
                    {step === 'In Progress'
                      ? 'Pending municipal crew assignment'
                      : 'Awaiting completed work and required resolution note'}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { Loader2, LogOut } from 'lucide-react';
import {
  generateTicketId,
  sortTicketsNewestFirst,
  validateStatusTransition,
  type CivicTicket,
  type TicketStatus,
} from './shared/civicDomain';
import { auth, googleProvider } from './lib/firebase';
import {
  advanceTicketStatusInFirestore,
  checkAdminAllowlist,
  createTicketInFirestore,
  requestServerTriage,
  subscribeAllTicketsForAdmin,
  subscribeCitizenTickets,
  type SubmittedReportPayload,
} from './lib/ticketService';
import { getSandboxInitialTickets, getSandboxRoleFromUrl } from './lib/sandboxData';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SignInLanding } from './components/SignInLanding';
import { ReportForm } from './components/ReportForm';
import { MyReportsView } from './components/MyReportsView';
import { AdminQueueView } from './components/AdminQueueView';

type ActiveTab = 'report' | 'my-reports' | 'admin';

function CivicResolveShell() {
  const [sandboxRole] = useState(() => getSandboxRoleFromUrl());
  const [authReady, setAuthReady] = useState(sandboxRole !== null);
  const [user, setUser] = useState<User | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [isAdmin, setIsAdmin] = useState(sandboxRole === 'admin');
  const [checkingAdmin, setCheckingAdmin] = useState(false);

  const [activeTab, setActiveTab] = useState<ActiveTab>(
    sandboxRole === 'admin' ? 'admin' : 'report'
  );
  const [focusedTicketId, setFocusedTicketId] = useState<string | null>(null);

  // Live Firestore states
  const [myTickets, setMyTickets] = useState<CivicTicket[]>([]);
  const [myTicketsLoading, setMyTicketsLoading] = useState(false);
  const [myTicketsError, setMyTicketsError] = useState<string | null>(null);

  const [adminTickets, setAdminTickets] = useState<CivicTicket[]>([]);
  const [adminTicketsLoading, setAdminTicketsLoading] = useState(false);
  const [adminTicketsError, setAdminTicketsError] = useState<string | null>(null);

  // Isolated local sandbox state (only when ?demo=citizen|admin is explicitly requested)
  const [sandboxTickets, setSandboxTickets] = useState<CivicTicket[]>(() =>
    sandboxRole ? getSandboxInitialTickets() : []
  );

  const verifyAdminRole = useCallback(async (uid: string) => {
    setCheckingAdmin(true);
    try {
      const allowed = await checkAdminAllowlist(uid);
      setIsAdmin(allowed);
    } catch {
      setIsAdmin(false);
    } finally {
      setCheckingAdmin(false);
    }
  }, []);

  useEffect(() => {
    if (sandboxRole !== null) return;
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
      if (firebaseUser) {
        void verifyAdminRole(firebaseUser.uid);
      } else {
        setIsAdmin(false);
        setMyTickets([]);
        setAdminTickets([]);
      }
    });
    return () => unsubscribe();
  }, [sandboxRole, verifyAdminRole]);

  // Owner-scoped citizen ticket subscription
  useEffect(() => {
    if (sandboxRole !== null) return;
    if (!authReady || !user) return;
    setMyTicketsLoading(true);
    setMyTicketsError(null);
    const unsub = subscribeCitizenTickets(
      user.uid,
      (items) => {
        setMyTickets(items);
        setMyTicketsLoading(false);
      },
      (err) => {
        setMyTicketsError(err.message);
        setMyTicketsLoading(false);
      }
    );
    return () => unsub();
  }, [sandboxRole, authReady, user]);

  // Admin-only full queue subscription (only attaches when allowlisted in admins/{uid})
  useEffect(() => {
    if (sandboxRole !== null) return;
    if (!authReady || !user || !isAdmin) {
      setAdminTickets([]);
      return;
    }
    setAdminTicketsLoading(true);
    setAdminTicketsError(null);
    const unsub = subscribeAllTicketsForAdmin(
      (items) => {
        setAdminTickets(items);
        setAdminTicketsLoading(false);
      },
      (err) => {
        setAdminTicketsError(err.message);
        setAdminTicketsLoading(false);
      }
    );
    return () => unsub();
  }, [sandboxRole, authReady, user, isAdmin]);

  const handleSignIn = async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In could not be completed.';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError(msg);
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    if (sandboxRole !== null) return;
    await signOut(auth);
    setActiveTab('report');
    setFocusedTicketId(null);
  };

  const handleSubmitReport = async (payload: SubmittedReportPayload): Promise<CivicTicket> => {
    const { recommendation } = await requestServerTriage(payload);

    if (sandboxRole !== null) {
      const nowMs = Date.now();
      const ticketId = generateTicketId();
      const actor = sandboxRole === 'admin' ? 'Ops Dispatcher' : 'Maya Patel';
      const newTicket: CivicTicket = {
        id: ticketId,
        ownerId: sandboxRole === 'admin' ? 'sandbox-admin-uid' : 'sandbox-citizen-uid',
        ownerEmail:
          sandboxRole === 'admin'
            ? 'ops.dispatcher@civic-preview.local'
            : 'maya.patel@civic-preview.local',
        ownerName: actor,
        title: payload.title,
        description: payload.description,
        location: payload.location,
        selectedCategory: payload.selectedCategory,
        status: 'Reported',
        triageStatus: recommendation.triageStatus,
        recommendedCategory: recommendation.recommendedCategory,
        recommendedDepartment: recommendation.recommendedDepartment,
        urgency: recommendation.urgency,
        triageReason: recommendation.triageReason,
        triageModel: recommendation.triageModel,
        imageDataUrl: payload.imageDataUrl,
        timeline: [
          {
            status: 'Reported',
            timestampMs: nowMs,
            actor,
            note:
              recommendation.triageStatus === 'completed'
                ? `Report filed. AI triage recommended ${recommendation.recommendedDepartment} (${recommendation.urgency} urgency).`
                : 'Report filed. Triage queued as Pending review.',
          },
        ],
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
      };
      setSandboxTickets((prev) => sortTicketsNewestFirst([newTicket, ...prev]));
      return newTicket;
    }

    if (!user) {
      throw new Error('Please sign in with Google before submitting a report.');
    }

    return createTicketInFirestore(user, payload, recommendation);
  };

  const handleAdvanceStatus = async (
    ticket: CivicTicket,
    nextStatus: TicketStatus,
    resolutionNote?: string
  ) => {
    if (sandboxRole !== null) {
      const check = validateStatusTransition(ticket.status, nextStatus, resolutionNote);
      if (!check.valid) throw new Error(check.error);
      const nowMs = Date.now();
      setSandboxTickets((prev) =>
        prev.map((item) => {
          if (item.id !== ticket.id) return item;
          return {
            ...item,
            status: nextStatus,
            updatedAtMs: nowMs,
            assignedAdminUid: 'sandbox-admin-uid',
            assignedAdminEmail: 'ops.dispatcher@civic-preview.local',
            ...(nextStatus === 'Resolved'
              ? {
                  resolutionNote: check.cleanedResolutionNote,
                  resolvedAtMs: nowMs,
                }
              : {}),
            timeline: [
              ...item.timeline,
              {
                status: nextStatus,
                timestampMs: nowMs,
                actor: 'Ops Dispatcher',
                note:
                  nextStatus === 'Resolved'
                    ? check.cleanedResolutionNote!
                    : `Assigned for municipal crew dispatch to ${item.recommendedDepartment}.`,
              },
            ],
          };
        })
      );
      return;
    }

    if (!user || !isAdmin) {
      throw new Error('Admin allowlist verification is required to update ticket status.');
    }

    await advanceTicketStatusInFirestore(ticket, user, nextStatus, resolutionNote);
  };

  const isAuthenticated = sandboxRole !== null || Boolean(user);
  const currentUid =
    sandboxRole === 'admin'
      ? 'sandbox-admin-uid'
      : sandboxRole === 'citizen'
        ? 'sandbox-citizen-uid'
        : user?.uid ?? '';
  const currentEmail =
    sandboxRole === 'admin'
      ? 'ops.dispatcher@civic-preview.local'
      : sandboxRole === 'citizen'
        ? 'maya.patel@civic-preview.local'
        : user?.email ?? '';
  const currentName =
    sandboxRole === 'admin'
      ? 'Ops Dispatcher'
      : sandboxRole === 'citizen'
        ? 'Maya Patel'
        : user?.displayName || user?.email || 'Citizen';

  const visibleCitizenTickets =
    sandboxRole !== null
      ? sandboxTickets.filter((t) => t.ownerId === currentUid)
      : myTickets;

  const visibleAdminTickets = sandboxRole !== null ? sandboxTickets : adminTickets;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4 sm:gap-8">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('report');
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            CivicResolve
          </a>

          {isAuthenticated ? (
            <nav
              aria-label="Primary navigation"
              className="hidden md:flex items-center gap-7"
            >
              <button
                type="button"
                onClick={() => setActiveTab('report')}
                className={`py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'report'
                    ? 'border-blue-700 text-slate-900'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Submit Report
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('my-reports')}
                className={`py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'my-reports'
                    ? 'border-blue-700 text-slate-900'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                My Reports
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                className={`py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'admin'
                    ? 'border-blue-700 text-slate-900'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Admin Queue
              </button>
            </nav>
          ) : (
            <nav aria-label="Portal sections" className="hidden md:flex items-center gap-6 text-sm text-slate-600">
              <a
                href="#how-it-works"
                className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
              >
                How It Works
              </a>
              <a
                href="#routing-directory"
                className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
              >
                Routing Directory
              </a>
            </nav>
          )}

          <div className="flex items-center gap-3 shrink-0">
            {isAuthenticated ? (
              <>
                <span className="hidden md:inline text-xs text-slate-500 max-w-[160px] truncate">
                  {currentName}
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                  Sign out
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleSignIn}
                disabled={signingIn}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {signingIn ? 'Signing in…' : 'Sign in'}
              </button>
            )}
          </div>
        </div>

        {isAuthenticated && (
          <nav
            aria-label="Mobile workspace navigation"
            className="md:hidden grid grid-cols-3 border-t border-slate-200 bg-white"
          >
            <button
              type="button"
              onClick={() => setActiveTab('report')}
              className={`min-h-[44px] px-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'report'
                  ? 'border-blue-700 text-slate-900 bg-slate-50/70'
                  : 'border-transparent text-slate-600'
              }`}
            >
              Submit Report
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('my-reports')}
              className={`min-h-[44px] px-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'my-reports'
                  ? 'border-blue-700 text-slate-900 bg-slate-50/70'
                  : 'border-transparent text-slate-600'
              }`}
            >
              My Reports
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('admin')}
              className={`min-h-[44px] px-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'admin'
                  ? 'border-blue-700 text-slate-900 bg-slate-50/70'
                  : 'border-transparent text-slate-600'
              }`}
            >
              Admin Queue
            </button>
          </nav>
        )}
      </header>

      <div className="flex-1">
        {!authReady ? (
          <div className="max-w-6xl mx-auto px-6 py-20 flex items-center justify-center gap-3 text-sm text-slate-600">
            <Loader2 className="w-4 h-4 animate-spin text-slate-500" aria-hidden="true" />
            Connecting to CivicResolve…
          </div>
        ) : !isAuthenticated ? (
          <SignInLanding
            onSignIn={handleSignIn}
            signingIn={signingIn}
            authError={authError}
          />
        ) : (
          <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
            {activeTab === 'report' && (
              <ReportForm
                onSubmitReport={handleSubmitReport}
                onNavigateToMyReports={(ticketId) => {
                  setFocusedTicketId(ticketId);
                  setActiveTab('my-reports');
                }}
              />
            )}

            {activeTab === 'my-reports' && (
              <MyReportsView
                tickets={visibleCitizenTickets}
                loading={sandboxRole === null ? myTicketsLoading : false}
                error={myTicketsError}
                initialSelectedId={focusedTicketId}
                onStartNewReport={() => setActiveTab('report')}
              />
            )}

            {activeTab === 'admin' && (
              <AdminQueueView
                isAdmin={isAdmin}
                checkingAdmin={checkingAdmin}
                userUid={currentUid}
                userEmail={currentEmail}
                tickets={visibleAdminTickets}
                loading={sandboxRole === null ? adminTicketsLoading : false}
                error={adminTicketsError}
                onRefreshAdminStatus={() =>
                  user ? verifyAdminRole(user.uid) : Promise.resolve()
                }
                onAdvanceStatus={handleAdvanceStatus}
              />
            )}
          </main>
        )}
      </div>

      <footer className="border-t border-slate-200 bg-white mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>CivicResolve · Municipal Issue Reporting &amp; Triage</span>
          <span>Owner-scoped Firestore records · Server-side Gemini routing</span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <CivicResolveShell />
    </ErrorBoundary>
  );
}

import { useState } from 'react';
import { ArrowRight, Building2, ShieldCheck } from 'lucide-react';
import { CATEGORY_TO_DEPARTMENT, MUNICIPAL_CATEGORIES } from '../shared/civicDomain';

interface SignInLandingProps {
  onSignIn: () => Promise<void>;
  signingIn: boolean;
  authError: string | null;
}

const HERO_IMAGE_SRC = '/src/assets/images/civic_plaza_hero_1795257667250.jpg';

export function SignInLanding({ onSignIn, signingIn, authError }: SignInLandingProps) {
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  return (
    <main className="max-w-6xl mx-auto px-6 py-10 lg:py-14 space-y-12">
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-6 flex flex-col justify-between bg-white border border-slate-200 rounded-xl p-8 lg:p-10">
          <div className="space-y-5">
            <p className="text-xs font-medium text-slate-500">
              Municipal Citizen Services · Verified Issue Intake
            </p>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 leading-tight">
              Report city infrastructure issues with transparent triage and resolution
            </h1>
            <p className="text-base text-slate-600 leading-relaxed max-w-[60ch]">
              Sign in with your Google account to submit street, lighting, water, sanitation,
              park, or safety reports. Each ticket receives an immediate tracking ID, a live
              AI-recommended municipal department routing, and a timestamped status timeline.
            </p>
          </div>

          <div className="pt-8 space-y-4">
            {authError && (
              <div
                role="alert"
                className="p-3.5 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg"
              >
                {authError}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={onSignIn}
                disabled={signingIn}
                className="inline-flex items-center justify-center gap-2.5 min-h-[44px] px-6 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>{signingIn ? 'Opening Google Sign-In…' : 'Sign in with Google'}</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
              <span className="text-xs text-slate-500">
                Owner-scoped citizen access · Verified Google account required
              </span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-6 bg-slate-100 border border-slate-200 rounded-xl overflow-hidden min-h-[280px] lg:min-h-[380px] relative">
          {!heroImgFailed ? (
            <img
              src={HERO_IMAGE_SRC}
              alt="Modern municipal plaza and organized city streetscape in morning daylight"
              referrerPolicy="no-referrer"
              onError={() => setHeroImgFailed(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50">
              <Building2 className="w-10 h-10 text-slate-400 mb-3" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-700">CivicResolve Municipal Operations</p>
              <p className="text-xs text-slate-500 mt-1">
                Citizen issue reporting, AI department triage, and verifiable resolution tracking
              </p>
            </div>
          )}
        </div>
      </section>

      <section id="how-it-works" className="grid grid-cols-1 md:grid-cols-3 gap-6 border-t border-slate-200 pt-10 scroll-mt-20">
        <div className="space-y-2">
          <p className="text-xs font-mono text-slate-500 tabular-nums">01. Citizen Submission</p>
          <h2 className="text-base font-semibold text-slate-900">
            Structured intake with Auto-detect
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Submit a title, description, street location, optional site photo, and either choose a
            category or let live server-side Gemini triage recommend routing.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-mono text-slate-500 tabular-nums">02. Validated AI Routing</p>
          <h2 className="text-base font-semibold text-slate-900">
            Fixed department map with safe fallback
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Every model response is validated on the server before mapping to a fixed municipal
            department. If Gemini is unavailable, tickets save cleanly as Pending review.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-mono text-slate-500 tabular-nums">03. Rule-Enforced Lifecycle</p>
          <h2 className="text-base font-semibold text-slate-900">
            Owner privacy &amp; admin resolution notes
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Firestore Security Rules keep citizen tickets private to their owner and restrict
            Reported → In Progress → Resolved updates strictly to allowlisted admins.
          </p>
        </div>
      </section>

      <section id="routing-directory" className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5 scroll-mt-20">
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-slate-200 pb-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Fixed Municipal Routing Directory
          </h2>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            Deterministic category-to-department mapping
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
          {MUNICIPAL_CATEGORIES.map((category) => (
            <div key={category} className="py-1">
              <p className="text-sm font-medium text-slate-900">{category}</p>
              <p className="text-xs text-slate-500 mt-0.5">{CATEGORY_TO_DEPARTMENT[category]}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

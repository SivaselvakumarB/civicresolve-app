import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { FIREBASE_DATABASE_ID, FIREBASE_PROJECT_ID } from '../lib/firebase';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  isQuotaError: boolean;
  isPermissionError: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      message: '',
      isQuotaError: false,
      isPermissionError: false,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const raw = error?.message || 'An unexpected application error occurred.';
    let readable = raw;
    try {
      const parsed = JSON.parse(raw) as { error?: string; operationType?: string; path?: string };
      if (parsed && typeof parsed.error === 'string') {
        readable = `${parsed.error}${parsed.path ? ` (${parsed.operationType ?? 'op'} on ${parsed.path})` : ''}`;
      }
    } catch {
      // Keep raw error string
    }

    return {
      hasError: true,
      message: readable,
      isQuotaError: readable.toLowerCase().includes('quota exceeded'),
      isPermissionError:
        readable.toLowerCase().includes('missing or insufficient permissions') ||
        readable.toLowerCase().includes('permission_denied'),
    };
  }

  componentDidCatch(error: Error) {
    console.error('CivicResolve ErrorBoundary caught:', error);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      message: '',
      isQuotaError: false,
      isPermissionError: false,
    });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const upgradeUrl = `https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/firestore/databases/${FIREBASE_DATABASE_ID}/data?openUpgradeDialog=true`;

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-8">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-3">
              <h1 className="text-xl font-semibold text-slate-900">
                {this.state.isPermissionError
                  ? 'Access restricted by Firestore Security Rules'
                  : this.state.isQuotaError
                    ? 'Firestore daily quota reached'
                    : 'Something went wrong'}
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed break-words">
                {this.state.message}
              </p>
              {this.state.isQuotaError && (
                <p className="text-sm text-slate-600 leading-relaxed">
                  Free-tier Firestore quotas reset daily. You can review or upgrade your database
                  plan in the{' '}
                  <a
                    href={upgradeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-700 underline hover:text-blue-800"
                  >
                    Firebase Console
                  </a>
                  .
                </p>
              )}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={this.handleReset}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                  Reload workspace
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

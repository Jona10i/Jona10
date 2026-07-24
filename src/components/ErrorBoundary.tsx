import React, { ErrorInfo, ReactNode } from 'react';
import { logger } from '../lib/logger';
import { logActivity } from '../lib/audit';
import { ShieldAlert, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('Uncaught component error', error, { errorInfo });
    logActivity({
      type: 'system',
      action: 'uncaught_error',
      details: `${error.message}\n\n${errorInfo.componentStack}`,
      severity: 'critical'
    }).catch(err => {
      logger.error('Failed to write audit log for error', err);
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-100 p-8 text-center">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-red-100">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h2>
            <p className="text-sm text-slate-500 mb-6">
              A critical error occurred in this workspace component. Our engineering team has been notified via secure telemetry.
            </p>
            <div className="p-4 bg-slate-50 rounded-xl mb-6 text-left overflow-x-auto">
              <p className="text-xs font-mono text-slate-700 whitespace-pre-wrap break-words">
                {this.state.error?.message || "Unknown error occurred"}
              </p>
            </div>
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl font-semibold hover:bg-black transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Attempt Recovery
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

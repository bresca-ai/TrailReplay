import { Component, type ReactNode } from 'react';

type Props = { children: ReactNode; title: string; message: string; reloadLabel: string };

/** Keep a failed lazy panel from unmounting the map and the rest of the app. */
export class PanelErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="space-y-3 rounded-xl border border-[var(--evergreen)]/20 p-4 text-sm text-[var(--evergreen)]">
        <p className="font-semibold">{this.props.title}</p>
        <p className="text-xs text-[var(--evergreen-60)]">{this.props.message}</p>
        <button type="button" onClick={() => window.location.reload()} className="tr-btn tr-btn-primary text-xs">
          {this.props.reloadLabel}
        </button>
      </div>
    );
  }
}

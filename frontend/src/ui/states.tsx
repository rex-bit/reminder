import type { ReactNode } from 'react';
import { Button } from './controls';
import { Icon, type IconName } from './Icon';

export function LoadingList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="stack" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 64 }} />
      ))}
    </div>
  );
}

export function EmptyState({ icon = 'inbox', title, hint, action }: { icon?: IconName; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="state">
      <Icon name={icon} />
      <div className="title-m">{title}</div>
      {hint && <div className="body-m">{hint}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?(): void }) {
  return (
    <div className="state error" role="alert">
      <Icon name="error" />
      <div className="title-m">Something went wrong</div>
      <div className="body-m muted">{message}</div>
      {onRetry && (
        <Button variant="tonal" icon="refresh" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Renders loading / error / empty / content for a list request. */
export function AsyncView<T>({ state, isEmpty, empty, children }: { state: { data: T | null; loading: boolean; error: string | null; reload(): void }; isEmpty?(d: T): boolean; empty: ReactNode; children(d: T): ReactNode }) {
  if (state.loading && !state.data) return <LoadingList />;
  if (state.error && !state.data) return <ErrorState message={state.error} onRetry={state.reload} />;
  if (!state.data) return null;
  if (isEmpty?.(state.data)) return <>{empty}</>;
  return (
    <>
      {state.error && <div className="banner error">{state.error}</div>}
      {children(state.data)}
    </>
  );
}

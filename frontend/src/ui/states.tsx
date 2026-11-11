import type { ReactNode } from 'react';
import { Button } from './controls';
import { Icon, type IconName } from './Icon';
import { t } from '../i18n';

export function LoadingList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="stack" aria-busy="true" aria-label={t('Loading')}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skel-row" style={{ animationDelay: `${i * 0.08}s` }}>
          <div className="skeleton skel-dot" />
          <div className="skel-lines"><div className="skeleton" style={{ height: 14, width: '55%' }} /><div className="skeleton" style={{ height: 12, width: '80%' }} /></div>
        </div>
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
      <div className="title-m">{t('Something went wrong')}</div>
      <div className="body-m muted">{message}</div>
      {onRetry && (
        <Button variant="tonal" icon="refresh" onClick={onRetry}>
          {t('Try again')}
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

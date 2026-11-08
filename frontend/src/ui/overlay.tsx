import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './controls';
import { t } from '../i18n';

function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', h);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
}

export function Dialog({ title, onClose, children, actions }: { title: string; onClose(): void; children?: ReactNode; actions?: ReactNode }) {
  useEscape(onClose);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return createPortal(
    <div className="scrim dialog-pos" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <h2 className="headline-s">{title}</h2>
        {children}
        {actions && <div className="actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function BottomSheet({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  useEscape(onClose);
  return createPortal(
    <div className="scrim sheet-pos" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="handle" />
        <h2 className="title-l">{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmOpts {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

interface Snack {
  id: number;
  message: string;
  kind: 'info' | 'error';
  actionLabel?: string;
  onAction?: () => void;
}

interface Overlay {
  notify(message: string, opts?: { kind?: 'info' | 'error'; actionLabel?: string; onAction?: () => void }): void;
  confirm(opts: ConfirmOpts): Promise<boolean>;
}

const Ctx = createContext<Overlay | null>(null);

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [snacks, setSnacks] = useState<Snack[]>([]);
  const [dlg, setDlg] = useState<(ConfirmOpts & { resolve(v: boolean): void }) | null>(null);
  const seq = useRef(0);

  const notify = useCallback<Overlay['notify']>((message, opts = {}) => {
    const id = ++seq.current;
    setSnacks((s) => [...s.slice(-2), { id, message, kind: opts.kind ?? 'info', actionLabel: opts.actionLabel, onAction: opts.onAction }]);
    setTimeout(() => setSnacks((s) => s.filter((x) => x.id !== id)), opts.kind === 'error' ? 8000 : 4000);
  }, []);

  const confirm = useCallback<Overlay['confirm']>((opts) => new Promise<boolean>((resolve) => setDlg({ ...opts, resolve })), []);

  const value = useMemo(() => ({ notify, confirm }), [notify, confirm]);
  const close = (v: boolean) => {
    dlg?.resolve(v);
    setDlg(null);
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {dlg && (
        <Dialog
          title={dlg.title}
          onClose={() => close(false)}
          actions={
            <>
              <Button variant="text" onClick={() => close(false)}>
                {t('Cancel')}
              </Button>
              <Button variant={dlg.danger ? 'danger' : 'filled'} onClick={() => close(true)}>
                {dlg.confirmLabel ?? t('Confirm')}
              </Button>
            </>
          }
        >
          <div className="body-l muted">{dlg.body}</div>
        </Dialog>
      )}
      {createPortal(
        <div className="snacks" aria-live="polite">
          {snacks.map((s) => (
            <div key={s.id} className={`snack ${s.kind}`} role={s.kind === 'error' ? 'alert' : 'status'}>
              <span className="grow">{s.message}</span>
              {s.actionLabel && <button onClick={s.onAction}>{s.actionLabel}</button>}
              <button aria-label={t('Dismiss')} onClick={() => setSnacks((x) => x.filter((n) => n.id !== s.id))}>
                ✕
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}

export function useOverlay(): Overlay {
  const v = useContext(Ctx);
  if (!v) throw new Error('useOverlay outside OverlayProvider');
  return v;
}

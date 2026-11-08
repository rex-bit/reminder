import { useState } from 'react';
import { t } from '../i18n';
import { logsApi } from '../api/endpoints';
import { fmtDateTime } from '../lib/format';
import { useAsync, useDebounced } from '../lib/useAsync';
import { TextField } from '../ui/controls';
import { Pager } from '../ui/Pager';
import { AsyncView, EmptyState } from '../ui/states';

export function ActivityLogsPage() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const dAction = useDebounced(action);
  const state = useAsync((s) => logsApi.activity({ action: dAction.trim() || undefined, page, pageSize: 25 }, s), [dAction, page]);

  return (
    <div className="page">
      <h1 className="headline-m">{t('Activity logs')}</h1>
      <TextField label={t('Filter by action prefix (e.g. auth., reminder.)')} value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} />
      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={<EmptyState icon="receipt" title={t('No activity found')} hint={action ? t('Try a different prefix.') : t('Admin actions are recorded here.')} />}>
        {(d) => (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t('When')}</th><th>{t('Admin')}</th><th>{t('Action')}</th><th>{t('Target')}</th><th>{t('Details')}</th></tr></thead>
                <tbody>
                  {d.items.map((l) => (
                    <tr key={l.id}>
                      <td>{fmtDateTime(l.created_at)}</td>
                      <td>{l.admin_name ? <>{l.admin_name} <span className="body-s muted mono">{l.admin_code}</span></> : <span className="muted">{t('System')}</span>}</td>
                      <td className="mono">{l.action}</td>
                      <td className="body-s">{l.entity_type ? `${l.entity_type}${l.entity_id ? ` ${l.entity_id.slice(0, 8)}` : ''}` : '—'}</td>
                      <td className="mono" style={{ maxWidth: 320, wordBreak: 'break-all' }}>{l.metadata && Object.keys(l.metadata).length ? JSON.stringify(l.metadata) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </>
        )}
      </AsyncView>
    </div>
  );
}

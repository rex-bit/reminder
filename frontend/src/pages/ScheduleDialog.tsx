import { useState } from 'react';
import { errorMessage } from '../api/client';
import { remindersApi } from '../api/endpoints';
import type { Reminder } from '../api/types';
import { isoToZoned, todayIso, zonedToIso } from '../lib/format';
import { Button, DateField, TimeField } from '../ui/controls';
import { Dialog, useOverlay } from '../ui/overlay';

/** Schedule (draft -> pending) or reschedule (pending -> pending). Times are wall-clock in the reminder's timezone. */
export function ScheduleDialog({ reminder, onClose, onDone }: { reminder: Reminder; onClose(): void; onDone(): void }) {
  const { notify } = useOverlay();
  const initial = reminder.scheduled_at ? isoToZoned(reminder.scheduled_at, reminder.timezone) : { date: reminder.reminder_date, time: '06:00' };
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const iso = date && time ? zonedToIso(date, time, reminder.timezone) : null;
  const inPast = iso ? new Date(iso).getTime() <= Date.now() : false;

  async function save() {
    if (!iso || inPast) return;
    setBusy(true);
    setError(null);
    try {
      await remindersApi.schedule(reminder.id, iso);
      notify(reminder.status === 'pending' ? 'Reminder rescheduled' : 'Reminder scheduled');
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={reminder.status === 'pending' ? 'Reschedule reminder' : 'Schedule reminder'}
      onClose={onClose}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy} disabled={!iso || inPast}>
            Save
          </Button>
        </>
      }
    >
      <p className="body-m muted">Sends automatically from the server at this time ({reminder.timezone}); this page does not need to stay open.</p>
      {error && <div className="banner error" role="alert">{error}</div>}
      <div className="editor-grid">
        <DateField label="Date" value={date} min={todayIso(reminder.timezone)} onChange={(e) => setDate(e.target.value)} />
        <TimeField label="Time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      {inPast && <div className="banner">That time is in the past. Choose a future time, or use “Send now”.</div>}
    </Dialog>
  );
}

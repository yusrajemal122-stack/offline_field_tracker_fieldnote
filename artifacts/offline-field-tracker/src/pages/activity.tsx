import { useMemo, useState } from 'react';
import { getGetActivityQueryKey, useGetActivity } from '@workspace/api-client-react';
import { Activity, AlertTriangle, CheckCircle2, CircleDot, CloudOff, History, RefreshCw, Send, SlidersHorizontal } from 'lucide-react';
import { useTracker } from '@/hooks/use-tracker';
import { formatDate, shortId } from '@/lib/report-utils';
import { StatusPill } from '@/components/tracker-ui';
import type { Activity as ActivityRecord } from '@workspace/api-client-react';

const filterItems = ['Everything', 'Reports created', 'Sync events', 'Status changes'] as const;
type ActivityFilter = typeof filterItems[number];

function eventIcon(kind: ActivityRecord['kind']) {
  if (kind === 'created') return <CircleDot size={16} />;
  if (kind === 'sync_attempted') return <Send size={15} />;
  if (kind === 'sync_failed') return <AlertTriangle size={15} />;
  if (kind === 'synchronized') return <CheckCircle2 size={16} />;
  return <Activity size={15} />;
}
function eventStyle(kind: ActivityRecord['kind']) {
  if (kind === 'sync_failed') return 'event-failed';
  if (kind === 'synchronized') return 'event-success';
  if (kind === 'status_changed') return 'event-status';
  if (kind === 'sync_attempted') return 'event-attempt';
  return 'event-created';
}
function SyncEventOutcome({ kind }: { kind: ActivityRecord['kind'] }) {
  const result = kind === 'sync_attempted'
    ? { label: 'Attempted', style: 'event-attempt' }
    : kind === 'sync_failed'
      ? { label: 'Failed', style: 'event-failed' }
      : kind === 'synchronized'
        ? { label: 'Synchronized', style: 'event-success' }
        : null;
  if (!result) return null;
  return <span data-testid={`activity-sync-outcome-${kind}`} className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold ${result.style}`}>{result.label}</span>;
}
function matches(item: ActivityRecord, filter: ActivityFilter): boolean {
  if (filter === 'Everything') return true;
  if (filter === 'Reports created') return item.kind === 'created';
  if (filter === 'Sync events') return item.kind === 'sync_attempted' || item.kind === 'sync_failed' || item.kind === 'synchronized';
  return item.kind === 'status_changed';
}

export default function ActivityPage() {
  const { activities, reports, online, loaded, storageError, reloadLocal } = useTracker();
  const serverActivity = useGetActivity({ query: { queryKey: getGetActivityQueryKey(), enabled: online, retry: false, refetchOnReconnect: true } });
  const [filter, setFilter] = useState<ActivityFilter>('Everything');
  const filtered = useMemo(() => activities.filter(item => matches(item, filter)), [activities, filter]);
  const byId = useMemo(() => new Map(reports.map(report => [report.id, report])), [reports]);
  const failed = activities.filter(item => item.kind === 'sync_failed').length;
  return <div className="page-enter">
    <section className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div><div className="mb-3 flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[.2em] text-muted-foreground"><span className="h-px w-7 bg-accent" />Field operations · Audit trail</div><h1 className="font-display text-[34px] font-extrabold leading-[1.05] tracking-[-.045em] sm:text-[42px]">Activity log<span className="text-accent">.</span></h1><p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">A durable record of reports created, status changes, and every sync attempt. This history lives on this device.</p></div>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3"><div className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-secondary-foreground"><History size={16} /></div><div><p className="font-mono-ui text-lg font-medium leading-none">{loaded ? activities.length.toString().padStart(2, '0') : '··'}</p><p className="mt-1 text-[9px] font-bold uppercase tracking-[.12em] text-muted-foreground">Events stored</p></div></div>
    </section>
    {!online && <div className="mb-5 flex items-center gap-2 rounded-lg border border-[#e5c7a7] bg-[#f6e9dc] px-4 py-3 text-[11px] text-[#754e32]"><CloudOff size={15} />Showing the complete on-device history. The server is currently unreachable.</div>}
    {storageError && <div className="mb-5 flex justify-between rounded-lg border border-destructive/30 px-4 py-3 text-xs text-destructive"><span>{storageError}</span><button onClick={() => void reloadLocal()} data-testid="button-retry-history" className="font-bold"><RefreshCw size={13} /></button></div>}
    <section className="overflow-hidden rounded-2xl border border-border/80 bg-card">
      <div className="flex flex-col gap-4 border-b border-border/80 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div className="flex items-center gap-2"><SlidersHorizontal size={15} className="text-muted-foreground" /><h2 className="font-display text-lg font-extrabold">Record timeline</h2></div>
        <div className="flex flex-wrap gap-1.5">{filterItems.map(item => <button key={item} type="button" onClick={() => setFilter(item)} data-testid={`activity-filter-${item.toLowerCase().replaceAll(' ', '-')}`} className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${filter === item ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{item}</button>)}</div>
      </div>
      {serverActivity.isError && online && <div className="px-6 py-3 text-[11px] text-muted-foreground">The server history could not be loaded. Showing the durable device history.</div>}
      {!loaded ? <div className="space-y-5 px-6 py-8">{[1, 2, 3].map(i => <div key={i} className="flex animate-pulse gap-4"><div className="h-9 w-9 rounded-full bg-muted" /><div className="flex-1 pt-1"><div className="h-3 w-48 rounded bg-muted" /><div className="mt-3 h-3 w-2/3 rounded bg-muted" /></div></div>)}</div>
        : filtered.length ? <div className="divide-y divide-border/70 px-5 sm:px-7">{filtered.map((entry, index) => {
          const report = byId.get(entry.reportId);
          return <article key={entry.id} data-testid={`activity-event-${entry.id}`} className="relative flex gap-4 py-5">
            {index !== filtered.length - 1 && <span className="absolute bottom-[-1px] left-[17px] top-[54px] w-px bg-border" />}
            <div className={`relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full ${eventStyle(entry.kind)}`}>{eventIcon(entry.kind)}</div>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1"><p className="text-[13px] font-bold leading-snug">{entry.message}</p><time className="font-mono-ui text-[9px] text-muted-foreground">{formatDate(entry.createdAt)}</time></div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="font-mono-ui text-[9px] tracking-wide text-muted-foreground">FN-{shortId(entry.reportId)}</span>
                {report && <><span className="h-1 w-1 rounded-full bg-border" /><span className="text-[10px] font-semibold text-accent">{report.category}</span><span className="text-[10px] text-muted-foreground">{report.location}</span></>}
                {report && <StatusPill status={report.status} />}
                <SyncEventOutcome kind={entry.kind} />
              </div>
            </div>
          </article>;
        })}</div>
        : <div className="flex flex-col items-center px-6 py-16 text-center"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-secondary-foreground"><History size={23} /></div><h3 className="mt-4 font-display text-lg font-extrabold">{activities.length ? 'No events in this filter' : 'The log starts with your first report'}</h3><p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">{activities.length ? 'Choose another event type to review the local timeline.' : 'Every report and sync attempt is written to this device for later confirmation.'}</p></div>}
      <div className="flex items-center justify-between border-t border-border/80 bg-muted/35 px-5 py-3 text-[10px] text-muted-foreground sm:px-7"><span>Local history is retained across reloads.</span><span>{failed} failed sync event{failed === 1 ? '' : 's'}</span></div>
    </section>
  </div>;
}

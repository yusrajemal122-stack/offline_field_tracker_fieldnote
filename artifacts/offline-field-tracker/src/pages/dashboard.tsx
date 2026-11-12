import { useMemo, useState, type FormEvent } from 'react';
import { getGetDashboardQueryKey, getGetReportsQueryKey, useGetDashboard, useGetReports, type ReportPriority, type ReportStatus } from '@workspace/api-client-react';
import { ArrowDown, ArrowUpRight, ChevronDown, ClipboardPlus, CloudOff, Crosshair, FileWarning, HardDrive, RefreshCw, Signal, X } from 'lucide-react';
import { useTracker } from '@/hooks/use-tracker';
import { ReportCard } from '@/components/tracker-ui';

const priorities: ReportPriority[] = ['Low', 'Medium', 'High', 'Critical'];
const categories = ['Road surface', 'Drainage', 'Signage', 'Street lighting', 'Water / utility', 'Bridge / structure', 'Vegetation', 'Other'];
type Filter = 'All reports' | 'Needs attention' | 'Open' | 'Resolved';

export default function Dashboard() {
  const { reports, online, loaded, storageError, syncingIds, createReport, changeStatus, retrySync, reloadLocal } = useTracker();
  const serverReports = useGetReports({ query: { queryKey: getGetReportsQueryKey(), enabled: online, retry: false, refetchOnReconnect: true } });
  const dashboardSummary = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey(), enabled: online, retry: false, refetchOnReconnect: true } });
  const [showCapture, setShowCapture] = useState(false);
  const [filter, setFilter] = useState<Filter>('All reports');
  const [category, setCategory] = useState(categories[0]);
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [priority, setPriority] = useState<ReportPriority>('Medium');
  const [status, setStatus] = useState<ReportStatus>('Draft');
  const [geoState, setGeoState] = useState<'idle' | 'locating' | 'error'>('idle');
  const [saving, setSaving] = useState(false);
  const localPending = reports.filter(item => item.syncState === 'pending').length;
  const localFailed = reports.filter(item => item.syncState === 'failed').length;
  const synchronized = reports.filter(item => item.syncState === 'synchronized').length;
  const stats = [
    { label: 'Total reports', count: reports.length, note: 'All captured issues', color: 'stat-teal' },
    { label: 'Pending reports', count: localPending, note: 'Saved locally', color: 'stat-amber' },
    { label: 'Failed reports', count: localFailed, note: 'Safe to retry', color: 'stat-coral' },
    { label: 'Synchronized reports', count: synchronized, note: 'Received by server', color: 'stat-sage' },
  ];
  const filtered = useMemo(() => {
    if (filter === 'Needs attention') return reports.filter(report => report.syncState === 'failed' || report.syncState === 'pending');
    if (filter === 'Open') return reports.filter(report => report.status !== 'Resolved' && report.status !== 'Rejected');
    if (filter === 'Resolved') return reports.filter(report => report.status === 'Resolved' || report.status === 'Rejected');
    return reports;
  }, [reports, filter]);
  const getLocation = () => {
    if (!navigator.geolocation) {
      setGeoState('error');
      return;
    }
    setGeoState('locating');
    navigator.geolocation.getCurrentPosition(
      position => {
        setLocation(`${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`);
        setGeoState('idle');
      },
      () => setGeoState('error'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!category || !description.trim() || !location.trim()) return;
    setSaving(true);
    try {
      await createReport({ category, description: description.trim(), location: location.trim(), priority, status });
      setDescription('');
      setLocation('');
      setPriority('Medium');
      setStatus('Draft');
      setCategory(categories[0]);
      setShowCapture(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-enter">
      <section className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[.2em] text-muted-foreground"><span className="h-px w-7 bg-accent" />Field operations · Issue register</div>
          <h1 className="font-display text-[34px] font-extrabold leading-[1.05] tracking-[-.045em] sm:text-[42px]">Report desk<span className="text-accent">.</span></h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">Capture what needs fixing. Your notes are kept on this device first, then confirmed when a signal is available.</p>
        </div>
        <button type="button" data-testid="button-new-report" onClick={() => setShowCapture(value => !value)} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-foreground px-5 text-sm font-bold text-background shadow-sm transition hover:-translate-y-0.5 hover:opacity-90">
          {showCapture ? <X size={17} /> : <ClipboardPlus size={17} />} {showCapture ? 'Close capture' : 'Capture issue'}
        </button>
      </section>

      {!online && <div data-testid="banner-offline" className="mb-6 flex items-start gap-3 rounded-xl border border-[#e5c7a7] bg-[#f6e9dc] px-4 py-3.5 text-[#754e32]">
        <CloudOff size={17} className="mt-0.5 shrink-0" /><div><p className="text-xs font-bold">No connection. You can keep working.</p><p className="mt-1 text-[11px] leading-relaxed">New reports are saved to this device and will be queued for a safe retry when you reconnect.</p></div>
      </div>}
      {storageError && <div className="mb-6 flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"><span>{storageError}</span><button onClick={() => void reloadLocal()} className="flex items-center gap-2 text-xs font-bold" data-testid="button-retry-storage"><RefreshCw size={13} /> Retry local storage</button></div>}

      {showCapture && <section className="capture-panel mb-8 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_35px_-24px_rgba(34,55,53,.35)]">
        <div className="flex items-start justify-between border-b border-border/80 px-5 py-5 sm:px-7">
          <div><div className="flex items-center gap-2 font-mono-ui text-[9px] uppercase tracking-[.2em] text-accent"><span className="h-1.5 w-1.5 rounded-full bg-accent" /> New field record</div><h2 className="mt-1 font-display text-xl font-extrabold">Capture the details</h2></div>
          <div className="rounded-lg bg-secondary px-2.5 py-1.5 font-mono-ui text-[9px] uppercase tracking-wide text-secondary-foreground">Saved on device</div>
        </div>
        <form onSubmit={submit} className="grid gap-x-8 gap-y-5 px-5 py-6 sm:grid-cols-2 sm:px-7">
          <label className="form-field">Issue category
            <span className="relative mt-2 block"><select data-testid="select-category" value={category} onChange={event => setCategory(event.target.value)} className="form-control appearance-none">{categories.map(item => <option key={item} value={item}>{item}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3 text-muted-foreground" size={15} /></span>
          </label>
          <label className="form-field">Priority
            <span className="mt-2 grid grid-cols-4 gap-1.5">{priorities.map(item => <button key={item} type="button" data-testid={`button-priority-${item.toLowerCase()}`} onClick={() => setPriority(item)} className={`rounded-lg border px-2 py-2.5 text-[11px] font-bold transition ${priority === item ? `priority-select-${item.toLowerCase()}` : 'border-border bg-background text-muted-foreground hover:border-foreground/30'}`}>{item}</button>)}</span>
          </label>
          <label className="form-field">Status
            <span className="relative mt-2 block"><select data-testid="select-status" value={status} onChange={event => setStatus(event.target.value as ReportStatus)} className="form-control appearance-none"><option value="Draft">Draft</option><option value="Submitted">Submitted</option></select><ChevronDown className="pointer-events-none absolute right-3 top-3 text-muted-foreground" size={15} /></span>
          </label>
          <div className="form-field">Date &amp; time
            <div className="mt-2 flex min-h-[42px] items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 text-[11px] font-medium text-muted-foreground"><Signal size={13} /> Recorded automatically when saved</div>
          </div>
          <label className="form-field sm:col-span-2">What did you find?
            <textarea data-testid="input-description" value={description} onChange={event => setDescription(event.target.value)} required minLength={3} rows={3} maxLength={1200} placeholder="Describe the issue and any immediate safety concern…" className="form-control mt-2 resize-y" />
          </label>
          <label className="form-field sm:col-span-2">Location
            <span className="mt-2 flex gap-2"><input data-testid="input-location" value={location} onChange={event => setLocation(event.target.value)} required maxLength={240} placeholder="Road, landmark, asset number, or coordinates" className="form-control min-w-0 flex-1" /><button type="button" data-testid="button-use-location" onClick={getLocation} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-bold text-foreground hover:bg-muted"><Crosshair size={14} />{geoState === 'locating' ? 'Finding…' : 'Use GPS'}</button></span>
            {geoState === 'error' && <span className="mt-1 block text-[11px] text-destructive">Location unavailable. Enter a landmark or coordinates manually.</span>}
          </label>
          <div className="flex flex-col gap-3 border-t border-border/80 pt-4 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-[11px] text-muted-foreground"><HardDrive size={14} className="text-accent" /> First saved locally. Sync is a separate step.</p>
            <button type="submit" data-testid="button-save-report" disabled={saving} className="rounded-lg bg-primary px-5 py-3 text-xs font-extrabold text-primary-foreground hover:brightness-95 disabled:opacity-60">{saving ? 'Saving locally…' : 'Save field report'}</button>
          </div>
        </form>
      </section>}

      <section className="mb-8 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {stats.map((stat, index) => <div key={stat.label} data-testid={`stat-${index}`} className="stat-card rounded-xl border border-border/80 bg-card px-4 py-4 sm:px-5">
          <div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[.1em] text-muted-foreground">{stat.label}</span><span className={`stat-mark ${stat.color}`} /></div>
          <div className="mt-2 font-display text-[28px] font-extrabold tracking-tight">{loaded ? stat.count : <span className="inline-block h-7 w-10 animate-pulse rounded bg-muted" />}</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">{stat.note}</div>
        </div>)}
      </section>

      <section className="overflow-hidden rounded-2xl border border-border/80 bg-card">
        <div className="flex flex-col gap-4 border-b border-border/80 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div className="flex items-baseline gap-3"><h2 className="font-display text-xl font-extrabold">Recent reports</h2><span className="font-mono-ui text-[10px] text-muted-foreground">{reports.length.toString().padStart(2, '0')} RECORDS</span></div>
          <div className="flex flex-wrap gap-1.5">{(['All reports', 'Needs attention', 'Open', 'Resolved'] as Filter[]).map(item => <button key={item} type="button" data-testid={`filter-${item.toLowerCase().replaceAll(' ', '-')}`} onClick={() => setFilter(item)} className={`rounded-full px-3 py-1.5 text-[10px] font-bold transition ${filter === item ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{item}</button>)}</div>
        </div>
        {serverReports.isError && online && <div className="flex items-center gap-2 bg-[#f6e9dc] px-5 py-2.5 text-[11px] text-[#754e32]"><Signal size={13} /> Server list is unavailable right now. Your local report register remains available.</div>}
        {dashboardSummary.isError && serverReports.isLoading && <div className="px-5 py-2 text-[11px] text-muted-foreground">Using device records while the server is unavailable.</div>}
        {!loaded ? <div className="space-y-4 px-6 py-7">{[1, 2].map(item => <div key={item} className="animate-pulse border-b border-border pb-5"><div className="h-3 w-32 rounded bg-muted" /><div className="mt-3 h-4 w-3/4 rounded bg-muted" /><div className="mt-3 h-3 w-1/3 rounded bg-muted" /></div>)}</div>
          : filtered.length ? <div className="px-5 sm:px-7">{filtered.map(report => <ReportCard key={report.id} report={report} onStatus={(r, s: ReportStatus) => void changeStatus(r, s)} onRetry={r => void retrySync(r)} syncing={syncingIds.includes(report.id)} />)}</div>
          : <div className="flex flex-col items-center px-6 py-14 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-secondary-foreground"><FileWarning size={23} /></div>
            <h3 className="mt-4 font-display text-lg font-extrabold">{reports.length ? 'Nothing in this view' : 'No field reports yet'}</h3>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">{reports.length ? 'Try another filter to see a different part of the register.' : 'Start a record now. It will stay on this device until you have a connection.'}</p>
            {!reports.length && <button type="button" onClick={() => setShowCapture(true)} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground"><ClipboardPlus size={15} /> Capture first issue</button>}
          </div>}
        <div className="flex items-center justify-between border-t border-border/80 bg-muted/35 px-5 py-3 text-[10px] text-muted-foreground sm:px-7"><span>Device records are the source of truth in the field.</span><span className="hidden items-center gap-1 sm:flex"><ArrowDown size={12} /> Newest first</span></div>
      </section>
      <div className="mt-5 flex items-center justify-end text-[10px] text-muted-foreground"><span>{dashboardSummary.data ? `Server count · ${dashboardSummary.data.totalReports}` : 'Server counts appear when connected'}</span><ArrowUpRight size={12} className="ml-1" /></div>
    </div>
  );
}

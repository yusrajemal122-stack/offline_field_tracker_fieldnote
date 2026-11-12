import { Link, useLocation } from 'wouter';
import { Activity as ActivityIcon, Antenna, ClipboardList, CloudOff, HardDrive, MapPin, Radio, ShieldCheck, Signal, Wifi } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Report, ReportStatus } from '@workspace/api-client-react';
import { shortId } from '@/lib/report-utils';
import { useTracker } from '@/hooks/use-tracker';

export function TrackerShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { online, reports } = useTracker();
  const queued = reports.filter(report => report.syncState === 'pending' || report.syncState === 'failed').length;
  return (
    <div className="min-h-[100dvh] bg-background text-foreground md:flex">
      <aside className="hidden w-[248px] shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="px-7 pt-8">
          <Link href="/" className="flex items-center gap-3" data-testid="link-brand-home">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground"><Antenna size={21} strokeWidth={2.3} /></div>
            <div><div className="font-display text-lg font-extrabold tracking-tight">Fieldnote</div><div className="font-mono-ui text-[9px] uppercase tracking-[.19em] text-sidebar-foreground/55">Infrastructure / 01</div></div>
          </Link>
        </div>
        <div className="mx-5 mt-10 rounded-xl border border-sidebar-border bg-sidebar-accent/60 px-4 py-3">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.16em] text-sidebar-foreground/55"><span className={`h-2 w-2 rounded-full ${online ? 'bg-[#91c98e]' : 'bg-[#e6a071]'}`} /> Signal check</div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm font-semibold">{online ? 'Network available' : 'Working offline'}</span>
            {online ? <Wifi size={15} className="text-[#a7d19e]" /> : <CloudOff size={15} className="text-[#efab78]" />}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-sidebar-foreground/55">{queued ? `${queued} report${queued === 1 ? '' : 's'} waiting to confirm` : 'Local records are up to date'}</p>
        </div>
        <nav className="mt-9 space-y-1 px-4">
          <div className="mb-3 px-3 font-mono-ui text-[9px] uppercase tracking-[.22em] text-sidebar-foreground/40">Workspace</div>
          <Link href="/" data-testid="link-dashboard" className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold transition-colors ${location === '/' ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'}`}><ClipboardList size={17} /> Report desk</Link>
          <Link href="/activity" data-testid="link-activity" className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold transition-colors ${location === '/activity' ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'}`}><ActivityIcon size={17} /> Activity log</Link>
        </nav>
        <div className="mt-auto p-5">
          <div className="rounded-xl border border-sidebar-border/80 px-4 py-4">
            <div className="flex items-center gap-2 text-xs font-semibold"><HardDrive size={15} className="text-primary" /> Stored on this device</div>
            <p className="mt-2 text-[11px] leading-relaxed text-sidebar-foreground/55">Every report is saved locally before it is sent. Nothing disappears when signal does.</p>
          </div>
          <div className="mt-5 flex items-center justify-between font-mono-ui text-[9px] uppercase tracking-[.15em] text-sidebar-foreground/35"><span>Fieldnote</span><span>v1.0.0</span></div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 pb-20 md:pb-0">
        <header className="sticky top-0 z-20 flex h-[66px] items-center justify-between border-b border-border/80 bg-background/95 px-5 backdrop-blur-md sm:px-8 lg:px-12">
          <div className="flex items-center gap-3 md:hidden">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-sidebar text-primary"><Antenna size={18} /></div>
            <span className="font-display font-extrabold">Fieldnote</span>
          </div>
          <div className="hidden items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground md:flex"><span>Operations</span><span className="text-border">/</span><span className="text-foreground">{location === '/activity' ? 'Activity log' : 'Report desk'}</span></div>
          <div data-testid="status-connection" className={`ml-auto flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold ${online ? 'border-[#b9d0b3] bg-[#e8f0e4] text-[#456b47]' : 'border-[#e5c7a7] bg-[#f6e9dc] text-[#895b39]'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-[#568451]' : 'bg-[#b8794b]'}`} />
            {online ? 'ONLINE' : 'OFFLINE'} <span className="hidden font-normal sm:inline">{online ? '· ready to sync' : '· saved on device'}</span>
          </div>
        </header>
        <div className="mx-auto max-w-[1420px] px-5 py-7 sm:px-8 lg:px-12 lg:py-10">{children}</div>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card/95 px-3 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-lg md:hidden">
        <Link href="/" data-testid="mobile-nav-dashboard" className={`flex flex-1 flex-col items-center gap-1 py-1.5 text-[10px] font-semibold ${location === '/' ? 'text-foreground' : 'text-muted-foreground'}`}><ClipboardList size={19} /> Reports</Link>
        <Link href="/activity" data-testid="mobile-nav-activity" className={`flex flex-1 flex-col items-center gap-1 py-1.5 text-[10px] font-semibold ${location === '/activity' ? 'text-foreground' : 'text-muted-foreground'}`}><ActivityIcon size={19} /> Activity</Link>
      </nav>
    </div>
  );
}

export function SyncBadge({ state }: { state: Report['syncState'] }) {
  const config = {
    pending: { label: 'Pending', style: 'sync-pending', icon: <Radio size={12} /> },
    synchronized: { label: 'Synchronized', style: 'sync-ok', icon: <ShieldCheck size={12} /> },
    failed: { label: 'Failed', style: 'sync-failed', icon: <Signal size={12} /> },
  }[state];
  return <span data-testid={`status-sync-${state}`} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide ${config.style}`}>{config.icon}{config.label}</span>;
}

export function StatusPill({ status }: { status: ReportStatus }) {
  const style = status === 'Resolved' ? 'status-resolved' : status === 'Rejected' ? 'status-rejected' : status === 'In Progress' ? 'status-progress' : 'status-open';
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${style}`}>{status}</span>;
}

export function ReportCard({ report, onStatus, onRetry, syncing }: { report: Report; onStatus: (r: Report, s: ReportStatus) => void; onRetry: (r: Report) => void; syncing: boolean }) {
  const { online } = useTracker();
  const following = report.status === 'Resolved' || report.status === 'Rejected';
  const canManage = online && report.syncState === 'synchronized' && !syncing;
  const next = report.status === 'Draft' ? 'Submitted' : report.status === 'Submitted' ? 'Assigned' : report.status === 'Assigned' ? 'In Progress' : report.status === 'In Progress' ? 'Resolved' : null;
  return (
    <article data-testid={`card-report-${report.id}`} className="group border-b border-border/80 py-5 first:pt-2 sm:py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="mt-1 hidden h-10 w-1 shrink-0 rounded-full bg-primary sm:block" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono-ui text-[10px] font-medium tracking-[.12em] text-muted-foreground">FN-{shortId(report.id)}</span>
            <span className="h-1 w-1 rounded-full bg-border" />
            <span className="text-[11px] font-semibold uppercase tracking-[.11em] text-accent">{report.category}</span>
            <span className={`priority-dot priority-${report.priority.toLowerCase()}`} title={`${report.priority} priority`} />
            <span className="text-[10px] font-medium text-muted-foreground">{report.priority} priority</span>
          </div>
          <h3 data-testid={`text-report-description-${report.id}`} className="mt-2 max-w-3xl text-[15px] font-semibold leading-snug text-foreground">{report.description}</h3>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><MapPin size={12} />{report.location}</span>
            <span className="font-mono-ui">{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(report.createdAt))}</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2"><StatusPill status={report.status} /><SyncBadge state={report.syncState} /></div>
          <div className="mt-4 flex flex-wrap gap-2">
            {!following && next && <button type="button" data-testid={`button-advance-${report.id}`} disabled={!canManage} onClick={() => onStatus(report, next)} className="rounded-lg bg-foreground px-3 py-2 text-[11px] font-bold text-background transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-45">{report.status === 'Draft' ? 'Submit report' : `Mark ${next}`}</button>}
            {!following && report.status !== 'Draft' && <button type="button" data-testid={`button-reject-${report.id}`} disabled={!canManage} onClick={() => onStatus(report, 'Rejected')} className="rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-muted-foreground transition hover:border-destructive/50 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-45">Reject</button>}
            {!following && !canManage && !syncing && <span className="self-center text-[10px] text-muted-foreground">Status changes need a confirmed connection.</span>}
            {(report.syncState !== 'synchronized' || syncing) && <button type="button" data-testid={`button-retry-${report.id}`} disabled={!online || syncing} onClick={() => onRetry(report)} className="rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-muted-foreground transition hover:border-primary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45">{syncing ? 'Sending…' : online ? 'Retry sync' : 'Retry when online'}</button>}
          </div>
        </div>
      </div>
    </article>
  );
}

import type { Activity, Report, ReportStatus } from '@workspace/api-client-react';

export const statusOrder: ReportStatus[] = ['Draft', 'Submitted', 'Assigned', 'In Progress', 'Resolved'];

export function nextStatus(status: ReportStatus): ReportStatus | null {
  const index = statusOrder.indexOf(status);
  return index >= 0 && index < statusOrder.length - 1 ? statusOrder[index + 1] : null;
}

export function canReject(status: ReportStatus): boolean {
  return status === 'Submitted' || status === 'Assigned' || status === 'In Progress';
}

export function makeActivity(report: Report, kind: Activity['kind'], message: string): Activity {
  return { id: crypto.randomUUID(), reportId: report.id, kind, message, createdAt: new Date().toISOString() };
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

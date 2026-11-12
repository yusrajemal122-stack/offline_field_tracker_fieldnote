import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetActivityQueryKey,
  getGetDashboardQueryKey,
  getGetReportsQueryKey,
  useGetActivity,
  useGetReports,
  useSyncReport,
  useUpdateReportStatus,
  type Report,
  type ReportPriority,
  type ReportStatus,
  type Activity,
} from '@workspace/api-client-react';
import { readActivity, readReports, writeActivities, writeActivity, writeReport, writeReportAndActivity } from '@/lib/offline-store';
import { canReject, makeActivity, nextStatus } from '@/lib/report-utils';

type NewReport = { category: string; description: string; location: string; priority: ReportPriority; status: ReportStatus };
const dateValue = (value: string | Date) => new Date(String(value)).getTime();

function responseStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('status' in error)) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : null;
}

function isRetryableSyncError(error: unknown): boolean {
  const status = responseStatus(error);
  return status === null || status === 408 || status === 429 || status >= 500;
}

function syncFailureMessage(error: unknown): string {
  const status = responseStatus(error);
  return status === null
    ? 'Could not reach the service. Your report is still saved on this device.'
    : `The service returned HTTP ${status}. Your report is still saved on this device.`;
}
type TrackerContextValue = {
  reports: Report[];
  activities: Activity[];
  online: boolean;
  loaded: boolean;
  storageError: string | null;
  syncingIds: string[];
  createReport: (form: NewReport) => Promise<void>;
  changeStatus: (report: Report, status: ReportStatus) => Promise<void>;
  retrySync: (report: Report) => Promise<void>;
  reloadLocal: () => Promise<void>;
};

const TrackerContext = createContext<TrackerContextValue | null>(null);

export function useTracker(): TrackerContextValue {
  const value = useContext(TrackerContext);
  if (!value) throw new Error('useTracker must be used inside TrackerProvider.');
  return value;
}

export function TrackerProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [online, setOnline] = useState(navigator.onLine);
  const serverReports = useGetReports({ query: { queryKey: getGetReportsQueryKey(), enabled: online, refetchOnReconnect: true, retry: false } });
  const serverActivity = useGetActivity({ query: { queryKey: getGetActivityQueryKey(), enabled: online, refetchOnReconnect: true, retry: false } });
  const syncMutation = useSyncReport();
  const statusMutation = useUpdateReportStatus();
  const syncFn = useRef(syncMutation.mutateAsync);
  const statusFn = useRef(statusMutation.mutateAsync);
  syncFn.current = syncMutation.mutateAsync;
  statusFn.current = statusMutation.mutateAsync;
  const [reports, setReports] = useState<Report[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [syncingIds, setSyncingIds] = useState<string[]>([]);
  const reportsRef = useRef(reports);
  const inFlight = useRef(new Set<string>());
  const lastConnectionState = useRef<boolean | null>(null);
  const retryTimers = useRef(new Map<string, number>());
  const retryCounts = useRef(new Map<string, number>());
  const retryHandler = useRef<(report: Report) => Promise<void>>(async () => {});
  reportsRef.current = reports;

  const upsertReport = (report: Report) => {
    setReports(current => [report, ...current.filter(item => item.id !== report.id)]
      .sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt)));
  };

  const upsertActivity = (activity: Activity) => {
    setActivities(current => [activity, ...current.filter(item => item.id !== activity.id)]
      .sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt)));
  };

  const clearAutoRetry = (reportId: string, resetCount = false) => {
    const timer = retryTimers.current.get(reportId);
    if (timer !== undefined) window.clearTimeout(timer);
    retryTimers.current.delete(reportId);
    if (resetCount) retryCounts.current.delete(reportId);
  };

  const scheduleAutoRetry = (reportId: string, error: unknown) => {
    if (!navigator.onLine || !isRetryableSyncError(error)) return;
    const attempt = (retryCounts.current.get(reportId) ?? 0) + 1;
    retryCounts.current.set(reportId, attempt);
    clearAutoRetry(reportId);
    const delay = Math.min(30_000, 1_000 * (2 ** Math.min(attempt - 1, 5)));
    const timer = window.setTimeout(async () => {
      retryTimers.current.delete(reportId);
      if (!navigator.onLine) return;
      try {
        const latest = (await readReports()).find(item => item.id === reportId);
        if (latest && latest.syncState !== 'synchronized') {
          void retryHandler.current(latest);
        }
      } catch (storageFailure) {
        setStorageError(storageFailure instanceof Error ? storageFailure.message : 'Saved reports could not be read for retry.');
      }
    }, delay);
    retryTimers.current.set(reportId, timer);
  };

  useEffect(() => () => {
    retryTimers.current.forEach(timer => window.clearTimeout(timer));
    retryTimers.current.clear();
  }, []);

  const reloadLocal = async () => {
    try {
      const [nextReports, nextActivities] = await Promise.all([readReports(), readActivity()]);
      setReports(current => {
        const merged = new Map(nextReports.map(report => [report.id, report]));
        for (const report of current) {
          const stored = merged.get(report.id);
          if (!stored || dateValue(report.updatedAt) > dateValue(stored.updatedAt)) {
            merged.set(report.id, report);
          }
        }
        return [...merged.values()].sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
      });
      setActivities(current => {
        const merged = new Map(nextActivities.map(activity => [activity.id, activity]));
        for (const activity of current) if (!merged.has(activity.id)) merged.set(activity.id, activity);
        return [...merged.values()].sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
      });
      setStorageError(null);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Local records could not be read.');
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    void reloadLocal();
    const onlineHandler = () => setOnline(true);
    const offlineHandler = () => setOnline(false);
    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);
    return () => {
      window.removeEventListener('online', onlineHandler);
      window.removeEventListener('offline', offlineHandler);
    };
  }, []);

  useEffect(() => {
    if (!loaded || !online || (!serverReports.data && !serverActivity.data)) return;
    let cancelled = false;
    const mergeServerRecords = async () => {
      const [localReports, localActivity] = await Promise.all([readReports(), readActivity()]);
      const reportMap = new Map(localReports.map(report => [report.id, report]));
      for (const remote of serverReports.data ?? []) {
        const local = reportMap.get(remote.id);
        const serverIsNewer = local && local.syncState === 'synchronized'
          && dateValue(remote.updatedAt) > dateValue(local.updatedAt);
        const serverConfirmsLocal = local && local.syncState !== 'synchronized'
          && local.category === remote.category
          && local.description === remote.description
          && local.location === remote.location
          && local.priority === remote.priority
          && local.status === remote.status;
        if (!local || serverIsNewer || serverConfirmsLocal) {
          reportMap.set(remote.id, remote);
          await writeReport(remote);
        }
      }

      const activityMap = new Map(localActivity.map(entry => [entry.id, entry]));
      const newServerActivity = (serverActivity.data ?? []).filter(entry => !activityMap.has(entry.id));
      for (const entry of newServerActivity) activityMap.set(entry.id, entry);
      await writeActivities(newServerActivity);
      if (cancelled) return;
      setReports(current => {
        const merged = new Map(reportMap);
        for (const report of current) {
          const stored = merged.get(report.id);
          if (!stored || dateValue(report.updatedAt) > dateValue(stored.updatedAt)) {
            merged.set(report.id, report);
          }
        }
        return [...merged.values()].sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
      });
      setActivities(current => {
        const merged = new Map(activityMap);
        for (const entry of current) if (!merged.has(entry.id)) merged.set(entry.id, entry);
        return [...merged.values()].sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
      });
    };
    void mergeServerRecords().catch(error => {
      setStorageError(error instanceof Error ? error.message : 'Server records could not be saved locally.');
    });
    return () => { cancelled = true; };
  }, [loaded, online, serverReports.data, serverActivity.data]);

  const recordActivity = async (entry: Activity) => {
    await writeActivity(entry);
    upsertActivity(entry);
  };

  const retrySync = async (report: Report) => {
    if (!navigator.onLine || inFlight.current.has(report.id)) return;
    clearAutoRetry(report.id);
    inFlight.current.add(report.id);
    setSyncingIds(current => [...new Set([...current, report.id])]);
    const attempt = makeActivity(report, 'sync_attempted', 'Sync attempt started. This report remains saved on this device.');
    const success = makeActivity(report, 'synchronized', 'The server confirmed receipt of this report.');
    let retryLatest = false;
    try {
      let existingActivities: Activity[];
      try {
        await recordActivity(attempt);
        existingActivities = await readActivity();
      } catch (error) {
        setStorageError(error instanceof Error ? error.message : 'Sync history could not be saved locally.');
        return;
      }

      let result: Report;
      try {
        result = await syncFn.current({
          id: report.id,
          data: {
            category: report.category,
            description: report.description,
            location: report.location,
            priority: report.priority,
            status: report.status,
            createdAt: report.createdAt,
            updatedAt: report.updatedAt,
            activities: [
              ...existingActivities
                .filter(item => item.reportId === report.id)
                .map(({ id, kind, message, createdAt }) => ({ id, kind, message, createdAt })),
              { id: success.id, kind: success.kind, message: success.message, createdAt: success.createdAt },
            ],
          },
        });
        if (result.id !== report.id) throw new Error('The service returned a different report ID.');
      } catch (error) {
        let latest = report;
        try {
          latest = (await readReports()).find(item => item.id === report.id) ?? report;
        } catch (storageFailure) {
          setStorageError(storageFailure instanceof Error ? storageFailure.message : 'The saved report could not be read.');
        }
        const failed: Report = { ...latest, syncState: 'failed' };
        upsertReport(failed);
        try {
          await writeReport(failed);
        } catch (storageFailure) {
          setStorageError(storageFailure instanceof Error ? storageFailure.message : 'The failed sync state could not be saved locally.');
        }
        try {
          await recordActivity(makeActivity(failed, 'sync_failed', syncFailureMessage(error)));
        } catch (storageFailure) {
          setStorageError(storageFailure instanceof Error ? storageFailure.message : 'The failed sync event could not be saved locally.');
        }
        scheduleAutoRetry(report.id, error);
        return;
      }

      let current = report;
      try {
        current = (await readReports()).find(item => item.id === report.id) ?? report;
      } catch (storageFailure) {
        setStorageError(storageFailure instanceof Error ? storageFailure.message : 'The saved report could not be read.');
      }
      const changedDuringSync = current.updatedAt !== report.updatedAt;
      const synced: Report = changedDuringSync
        ? { ...current, syncState: 'pending' }
        : { ...current, ...result, syncState: 'synchronized' };
      retryLatest = changedDuringSync;
      // A successful response is the confirmation. A later cache or storage error
      // must never turn this accepted report into a synchronization failure.
      upsertReport(synced);
      try {
        await writeReport(synced);
        await recordActivity(success);
      } catch (storageFailure) {
        setStorageError(storageFailure instanceof Error
          ? `The server confirmed receipt, but the local sync history could not be saved: ${storageFailure.message}`
          : 'The server confirmed receipt, but the local sync history could not be saved.');
      }
      if (!changedDuringSync) clearAutoRetry(report.id, true);
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: getGetReportsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetActivityQueryKey() }),
      ]);
    } finally {
      inFlight.current.delete(report.id);
      setSyncingIds(current => current.filter(id => id !== report.id));
      if (retryLatest && navigator.onLine) {
        try {
          const latest = (await readReports()).find(item => item.id === report.id);
          if (latest) void retryHandler.current(latest);
        } catch (storageFailure) {
          setStorageError(storageFailure instanceof Error ? storageFailure.message : 'The saved report could not be reloaded.');
        }
      }
    }
  };
  retryHandler.current = retrySync;

  useEffect(() => {
    if (!loaded) return;
    if (!online) {
      lastConnectionState.current = false;
      return;
    }
    if (lastConnectionState.current === true) return;
    lastConnectionState.current = true;
    const queued = reportsRef.current.filter(report => report.syncState === 'pending' || report.syncState === 'failed');
    queued.forEach(report => void retryHandler.current(report));
  }, [online, loaded]);

  const createReport = async (form: NewReport) => {
    const now = new Date().toISOString();
    const report: Report = {
      id: crypto.randomUUID(),
      ...form,
      createdAt: now,
      updatedAt: now,
      syncState: 'pending',
    };
    const entry = makeActivity(report, 'created', 'Issue captured on this device. It is safe, even without a signal.');
    try {
      await writeReportAndActivity(report, entry);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'The report could not be saved on this device.');
      throw error;
    }
    upsertReport(report);
    upsertActivity(entry);
    if (navigator.onLine) void retrySync(report);
  };

  const changeStatus = async (report: Report, status: ReportStatus) => {
    if (!navigator.onLine || report.syncState !== 'synchronized' || inFlight.current.has(report.id)) return;
    const allowed = status === 'Rejected'
      ? canReject(report.status)
      : nextStatus(report.status) === status;
    if (!allowed) return;
    const updatedAt = new Date().toISOString();
    const changed: Report = { ...report, status, updatedAt, syncState: 'pending' };
    const event = makeActivity(changed, 'status_changed', `Status changed from ${report.status} to ${status}.`);
    try {
      await writeReportAndActivity(changed, event);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'The status change could not be saved on this device.');
      return;
    }
    upsertReport(changed);
    upsertActivity(event);
    inFlight.current.add(report.id);
    setSyncingIds(current => [...new Set([...current, report.id])]);
    try {
      let result: Report;
      try {
        result = await statusFn.current({
          id: report.id,
          data: { status, activity: { id: event.id, kind: event.kind, message: event.message, createdAt: event.createdAt } },
        });
      } catch (error) {
        const failed: Report = { ...changed, syncState: 'failed' };
        upsertReport(failed);
        try {
          await writeReport(failed);
          await recordActivity(makeActivity(failed, 'sync_failed', syncFailureMessage(error)));
        } catch (storageFailure) {
          setStorageError(storageFailure instanceof Error ? storageFailure.message : 'The failed status sync could not be saved locally.');
        }
        scheduleAutoRetry(report.id, error);
        return;
      }
      const saved: Report = { ...changed, ...result, syncState: 'synchronized' };
      upsertReport(saved);
      try {
        await writeReport(saved);
      } catch (storageFailure) {
        setStorageError(storageFailure instanceof Error
          ? `The server confirmed the status change, but the local copy could not be updated: ${storageFailure.message}`
          : 'The server confirmed the status change, but the local copy could not be updated.');
      }
      clearAutoRetry(report.id, true);
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: getGetReportsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetActivityQueryKey() }),
      ]);
    } finally {
      inFlight.current.delete(report.id);
      setSyncingIds(current => current.filter(id => id !== report.id));
    }
  };

  const value = useMemo<TrackerContextValue>(() => ({
    reports, activities, online, loaded, storageError, syncingIds, createReport, changeStatus, retrySync, reloadLocal,
  }), [reports, activities, online, loaded, storageError, syncingIds]);

  return <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>;
}

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
  reportsRef.current = reports;

  const reloadLocal = async () => {
    try {
      const [nextReports, nextActivities] = await Promise.all([readReports(), readActivity()]);
      setReports(nextReports);
      setActivities(nextActivities);
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
        if (!local || serverIsNewer) {
          reportMap.set(remote.id, remote);
          await writeReport(remote);
        }
      }

      const activityMap = new Map(localActivity.map(entry => [entry.id, entry]));
      const newServerActivity = (serverActivity.data ?? []).filter(entry => !activityMap.has(entry.id));
      for (const entry of newServerActivity) activityMap.set(entry.id, entry);
      await writeActivities(newServerActivity);
      if (cancelled) return;
      setReports([...reportMap.values()].sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt)));
      setActivities([...activityMap.values()].sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt)));
    };
    void mergeServerRecords().catch(error => {
      setStorageError(error instanceof Error ? error.message : 'Server records could not be saved locally.');
    });
    return () => { cancelled = true; };
  }, [loaded, online, serverReports.data, serverActivity.data]);

  const recordActivity = async (entry: Activity) => {
    await writeActivity(entry);
    setActivities(current => [entry, ...current.filter(item => item.id !== entry.id)]);
  };

  const retrySync = async (report: Report) => {
    if (!navigator.onLine || inFlight.current.has(report.id)) return;
    inFlight.current.add(report.id);
    setSyncingIds(current => [...new Set([...current, report.id])]);
    const attempt = makeActivity(report, 'sync_attempted', 'Sync attempt started. This report remains saved on this device.');
    let retryLatest = false;
    let requestStarted = false;
    try {
      await recordActivity(attempt);
      requestStarted = true;
      const result = await syncFn.current({
        id: report.id,
        data: {
          category: report.category,
          description: report.description,
          location: report.location,
          priority: report.priority,
          status: report.status,
          createdAt: report.createdAt,
          updatedAt: report.updatedAt,
          activities: (await readActivity())
            .filter(item => item.reportId === report.id)
            .map(({ id, kind, message, createdAt }) => ({ id, kind, message, createdAt })),
        },
      });
      const current = (await readReports()).find(item => item.id === report.id) ?? report;
      const changedDuringSync = current.updatedAt !== report.updatedAt;
      const synced: Report = changedDuringSync
        ? { ...current, syncState: 'pending' }
        : { ...report, ...result, syncState: 'synchronized' };
      retryLatest = changedDuringSync;
      await writeReport(synced);
      setReports(current => current.map(item => item.id === synced.id ? synced : item));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetReportsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetActivityQueryKey() }),
      ]);
    } catch (error) {
      if (!requestStarted) {
        setStorageError(error instanceof Error ? error.message : 'Sync history could not be saved locally.');
        return;
      }
      const latest = (await readReports()).find(item => item.id === report.id) ?? report;
      const failed: Report = { ...latest, syncState: 'failed' };
      try {
        await writeReport(failed);
        setReports(current => current.map(item => item.id === failed.id ? failed : item));
        await recordActivity(makeActivity(failed, 'sync_failed', 'Could not reach the service. Your report is still safely stored on this device.'));
      } catch (storageFailure) {
        setStorageError(storageFailure instanceof Error ? storageFailure.message : 'The sync result could not be saved locally.');
      }
    } finally {
      inFlight.current.delete(report.id);
      setSyncingIds(current => current.filter(id => id !== report.id));
      if (retryLatest && navigator.onLine) {
        const latest = (await readReports()).find(item => item.id === report.id);
        if (latest) void retrySync(latest);
      }
    }
  };

  useEffect(() => {
    if (!loaded) return;
    if (!online) {
      lastConnectionState.current = false;
      return;
    }
    if (lastConnectionState.current === true) return;
    lastConnectionState.current = true;
    const queued = reportsRef.current.filter(report => report.syncState === 'pending' || report.syncState === 'failed');
    queued.forEach(report => void retrySync(report));
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
    setReports(current => [report, ...current]);
    setActivities(current => [entry, ...current]);
    if (navigator.onLine) void retrySync(report);
  };

  const changeStatus = async (report: Report, status: ReportStatus) => {
    if (!navigator.onLine || report.syncState !== 'synchronized' || inFlight.current.has(report.id)) return;
    const allowed = status === 'Rejected'
      ? canReject(report.status)
      : nextStatus(report.status) === status;
    if (!allowed) return;
    const updatedAt = new Date().toISOString();
    const changed: Report = { ...report, status, updatedAt, syncState: report.syncState === 'synchronized' && navigator.onLine ? 'synchronized' : 'pending' };
    const event = makeActivity(changed, 'status_changed', `Status changed from ${report.status} to ${status}.`);
    try {
      await writeReportAndActivity(changed, event);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'The status change could not be saved on this device.');
      return;
    }
    setReports(current => current.map(item => item.id === changed.id ? changed : item));
    setActivities(current => [event, ...current]);
    inFlight.current.add(report.id);
    setSyncingIds(current => [...new Set([...current, report.id])]);
    try {
      const result = await statusFn.current({
        id: report.id,
        data: { status, activity: { id: event.id, kind: event.kind, message: event.message, createdAt: event.createdAt } },
      });
      const saved = { ...changed, ...result, syncState: 'synchronized' as const };
      await writeReport(saved);
      setReports(current => current.map(item => item.id === saved.id ? saved : item));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetReportsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetActivityQueryKey() }),
      ]);
    } catch {
      const queued = { ...changed, syncState: 'pending' as const };
      try {
        await writeReport(queued);
        setReports(current => current.map(item => item.id === queued.id ? queued : item));
      } catch (error) {
        setStorageError(error instanceof Error ? error.message : 'The status sync result could not be saved locally.');
      }
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

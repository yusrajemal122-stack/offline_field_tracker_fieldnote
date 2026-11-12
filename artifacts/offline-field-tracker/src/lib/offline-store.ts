import type { Activity, Report } from '@workspace/api-client-react';

const DB_NAME = 'field-issue-tracker';
const DB_VERSION = 1;
const REPORTS = 'reports';
const ACTIVITY = 'activity';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(REPORTS)) db.createObjectStore(REPORTS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(ACTIVITY)) {
        const store = db.createObjectStore(ACTIVITY, { keyPath: 'id' });
        store.createIndex('reportId', 'reportId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Local storage could not be opened.'));
  });
}

async function transact<T>(stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const request = work(tx);
    let result: T;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error ?? new Error('Local storage request failed.'));
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error('Local storage transaction was interrupted.'));
    };
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => reject(tx.error ?? new Error('Local storage transaction failed.'));
  });
}

export async function readReports(): Promise<Report[]> {
  const rows = await transact<Report[]> ([REPORTS], 'readonly', tx => tx.objectStore(REPORTS).getAll());
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readActivity(): Promise<Activity[]> {
  const rows = await transact<Activity[]>([ACTIVITY], 'readonly', tx => tx.objectStore(ACTIVITY).getAll());
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function writeReport(report: Report): Promise<void> {
  await transact<IDBValidKey>([REPORTS], 'readwrite', tx => tx.objectStore(REPORTS).put(report));
}

export async function writeActivity(activity: Activity): Promise<void> {
  await transact<IDBValidKey>([ACTIVITY], 'readwrite', tx => tx.objectStore(ACTIVITY).put(activity));
}

export async function writeActivities(activities: Activity[]): Promise<void> {
  if (!activities.length) return;
  await transact<IDBValidKey>([ACTIVITY], 'readwrite', tx => {
    const store = tx.objectStore(ACTIVITY);
    let lastRequest: IDBRequest<IDBValidKey> | undefined;
    for (const activity of activities) lastRequest = store.put(activity);
    return lastRequest!;
  });
}

export async function writeReportAndActivity(report: Report, activity: Activity): Promise<void> {
  await transact<IDBValidKey>([REPORTS, ACTIVITY], 'readwrite', tx => {
    tx.objectStore(REPORTS).put(report);
    return tx.objectStore(ACTIVITY).put(activity);
  });
}

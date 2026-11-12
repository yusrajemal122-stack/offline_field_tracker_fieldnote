import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  Activity,
  DashboardSummary,
  Report,
  ReportSyncActivity,
  ReportSyncInput,
  ReportStatusInput,
} from "@workspace/api-zod";
import { isValidStatusTransition } from "./report-domain.ts";

type SqliteRow = Record<string, string | number | bigint | null>;

export class InvalidReportStatusTransitionError extends Error {
  constructor(current: string, next: string) {
    super(`A report cannot move from ${current} to ${next}.`);
    this.name = "InvalidReportStatusTransitionError";
  }
}

function reportFromRow(row: SqliteRow): Report {
  return {
    id: String(row.id),
    category: String(row.category),
    description: String(row.description),
    location: String(row.location),
    priority: String(row.priority) as Report["priority"],
    status: String(row.status) as Report["status"],
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
    syncState: "synchronized",
  };
}

function activityFromRow(row: SqliteRow): Activity {
  return {
    id: String(row.id),
    reportId: String(row.report_id),
    kind: String(row.kind) as Activity["kind"],
    message: String(row.message),
    createdAt: new Date(String(row.created_at)),
  };
}

export function createReportStore(databasePath: string) {
  if (databasePath !== ":memory:") {
    mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      location TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activity (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES reports(id),
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS activity_created_at_idx ON activity(created_at);
    CREATE INDEX IF NOT EXISTS activity_report_id_idx ON activity(report_id);
  `);

  const findReport = database.prepare("SELECT * FROM reports WHERE id = ?");
  const insertActivity = database.prepare(`
    INSERT OR IGNORE INTO activity (id, report_id, kind, message, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  function addActivity(reportId: string, entry: ReportSyncActivity) {
    insertActivity.run(
      entry.id,
      reportId,
      entry.kind,
      entry.message,
      entry.createdAt.toISOString(),
    );
  }

  return {
    listReports(): Report[] {
      const rows = database
        .prepare("SELECT * FROM reports ORDER BY updated_at DESC")
        .all() as SqliteRow[];
      return rows.map(reportFromRow);
    },

    listActivity(): Activity[] {
      const rows = database
        .prepare("SELECT * FROM activity ORDER BY created_at DESC, rowid DESC")
        .all() as SqliteRow[];
      return rows.map(activityFromRow);
    },

    getDashboard(): DashboardSummary {
      const row = database
        .prepare("SELECT COUNT(*) AS total FROM reports")
        .get() as SqliteRow;
      const totalReports = Number(row.total);
      return {
        totalReports,
        pendingReports: 0,
        synchronizedReports: totalReports,
        failedReports: 0,
      };
    },

    syncReport(id: string, input: ReportSyncInput): Report {
      database.exec("BEGIN IMMEDIATE");
      try {
        let existing = findReport.get(id) as SqliteRow | undefined;
        if (!existing) {
          if (input.status !== "Draft" && input.status !== "Submitted") {
            throw new InvalidReportStatusTransitionError("Draft", input.status);
          }
          database
            .prepare(`
              INSERT INTO reports
                (id, category, description, location, priority, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(
              id,
              input.category,
              input.description,
              input.location,
              input.priority,
              input.status,
              input.createdAt.toISOString(),
              input.updatedAt.toISOString(),
            );
          existing = findReport.get(id) as SqliteRow;
        } else {
          const currentStatus = String(existing.status) as Report["status"];
          if (currentStatus !== input.status) {
            if (!isValidStatusTransition(currentStatus, input.status)) {
              throw new InvalidReportStatusTransitionError(
                currentStatus,
                input.status,
              );
            }
            database
              .prepare("UPDATE reports SET status = ?, updated_at = ? WHERE id = ?")
              .run(input.status, new Date().toISOString(), id);
            existing = findReport.get(id) as SqliteRow;
          }
        }

        for (const entry of input.activities ?? []) {
          addActivity(id, entry);
        }

        const hasClientConfirmation = (input.activities ?? []).some(
          (entry) => entry.kind === "synchronized",
        );
        if (!hasClientConfirmation) {
          addActivity(id, {
            id: randomUUID(),
            kind: "synchronized",
            message: "Report synchronized with the server.",
            createdAt: new Date(),
          });
        }

        database.exec("COMMIT");
        return reportFromRow(existing);
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },

    updateReportStatus(
      id: string,
      input: ReportStatusInput,
    ): Report | null {
      const row = findReport.get(id) as SqliteRow | undefined;
      if (!row) return null;

      const current = String(row.status) as Report["status"];
      if (current !== input.status) {
        if (!isValidStatusTransition(current, input.status)) {
          throw new InvalidReportStatusTransitionError(current, input.status);
        }

        database.exec("BEGIN IMMEDIATE");
        try {
          const updatedAt = new Date().toISOString();
          database
            .prepare("UPDATE reports SET status = ?, updated_at = ? WHERE id = ?")
            .run(input.status, updatedAt, id);
          if (input.activity) {
            addActivity(id, {
              ...input.activity,
              kind: "status_changed",
            });
          } else {
            addActivity(id, {
              id: randomUUID(),
              kind: "status_changed",
              message: `Status changed from ${current} to ${input.status}.`,
              createdAt: new Date(updatedAt),
            });
          }
          database.exec("COMMIT");
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
      }

      return reportFromRow(findReport.get(id) as SqliteRow);
    },

    close() {
      database.close();
    },
  };
}


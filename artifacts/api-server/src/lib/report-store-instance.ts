import path from "node:path";
import { createReportStore } from "./report-store";

const databasePath =
  process.env.FIELD_TRACKER_DB_PATH ??
  path.resolve(process.cwd(), "data", "offline-field-issue-tracker.sqlite");

export const reportStore = createReportStore(databasePath);

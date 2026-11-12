import assert from "node:assert/strict";
import test from "node:test";
import type { ReportSyncInput } from "@workspace/api-zod";
import { isValidStatusTransition } from "../src/lib/report-domain.ts";
import {
  createReportStore,
  InvalidReportStatusTransitionError,
} from "../src/lib/report-store.ts";

const reportId = "b6d6fcb5-2437-4f1a-9d1c-61fdc47c437d";
const createdAt = new Date("2026-11-12T08:00:00.000Z");

function reportInput(
  overrides: Partial<ReportSyncInput> = {},
): ReportSyncInput {
  return {
    category: "Road damage",
    description: "A deep pothole is blocking the lane.",
    location: "North service road, marker 14",
    priority: "High",
    status: "Submitted",
    createdAt,
    updatedAt: createdAt,
    activities: [
      {
        id: "6c3d1595-8dc2-4b03-985f-0174d2a58339",
        kind: "created",
        message: "Report saved on this device.",
        createdAt,
      },
    ],
    ...overrides,
  };
}

test("status transitions follow the allowed path and keep final states closed", () => {
  assert.equal(isValidStatusTransition("Draft", "Submitted"), true);
  assert.equal(isValidStatusTransition("Submitted", "Assigned"), true);
  assert.equal(isValidStatusTransition("In Progress", "Resolved"), true);
  assert.equal(isValidStatusTransition("Submitted", "Resolved"), false);
  assert.equal(isValidStatusTransition("Resolved", "Assigned"), false);
  assert.equal(isValidStatusTransition("Rejected", "Submitted"), false);
});

test("new reports cannot skip directly to later workflow statuses", () => {
  const store = createReportStore(":memory:");
  try {
    assert.throws(
      () => store.syncReport(reportId, reportInput({ status: "Resolved" })),
      InvalidReportStatusTransitionError,
    );
    assert.equal(store.listReports().length, 0);
  } finally {
    store.close();
  }
});

test("repeating the same report sync does not create a duplicate or overwrite it", () => {
  const store = createReportStore(":memory:");
  try {
    const first = store.syncReport(reportId, reportInput());
    const repeated = store.syncReport(
      reportId,
      reportInput({ description: "A different duplicate payload." }),
    );

    assert.equal(first.id, repeated.id);
    assert.equal(repeated.description, "A deep pothole is blocking the lane.");
    assert.equal(store.listReports().length, 1);
    assert.equal(store.listActivity().filter((item) => item.kind === "created").length, 1);
    assert.equal(
      store.listActivity().filter((item) => item.kind === "synchronized").length,
      2,
    );
  } finally {
    store.close();
  }
});

test("status changes persist activity and invalid transitions are rejected", () => {
  const store = createReportStore(":memory:");
  try {
    store.syncReport(reportId, reportInput());
    const updated = store.updateReportStatus(reportId, { status: "Assigned" });

    assert.equal(updated?.status, "Assigned");
    assert.equal(
      store.listActivity().some((item) => item.kind === "status_changed"),
      true,
    );
    assert.throws(
      () => store.updateReportStatus(reportId, { status: "Resolved" }),
      InvalidReportStatusTransitionError,
    );
    assert.equal(store.listReports()[0]?.status, "Assigned");
  } finally {
    store.close();
  }
});

test("an idempotent sync can finish one locally queued valid status change", () => {
  const store = createReportStore(":memory:");
  try {
    store.syncReport(reportId, reportInput());
    const updated = store.syncReport(
      reportId,
      reportInput({
        status: "Assigned",
        activities: [
          {
            id: "e1749a24-5028-4e33-8c28-0b30596c814d",
            kind: "status_changed",
            message: "Status changed from Submitted to Assigned.",
            createdAt: new Date("2026-11-12T08:05:00.000Z"),
          },
        ],
      }),
    );
    assert.equal(updated.status, "Assigned");
    assert.equal(
      store.listActivity().some(
        (item) => item.id === "e1749a24-5028-4e33-8c28-0b30596c814d",
      ),
      true,
    );
    assert.throws(
      () =>
        store.syncReport(
          reportId,
          reportInput({ status: "Resolved" }),
        ),
      InvalidReportStatusTransitionError,
    );
    assert.equal(store.listReports()[0]?.status, "Assigned");
  } finally {
    store.close();
  }
});

import { Router, type IRouter } from "express";
import {
  GetActivityResponse,
  GetDashboardResponse,
  GetReportsResponse,
  SyncReportBody,
  SyncReportParams,
  SyncReportResponse,
  UpdateReportStatusBody,
  UpdateReportStatusParams,
  UpdateReportStatusResponse,
} from "@workspace/api-zod";
import {
  InvalidReportStatusTransitionError,
} from "../lib/report-store";
import { reportStore } from "../lib/report-store-instance";

const router: IRouter = Router();

router.get("/reports", (_req, res) => {
  res.json(GetReportsResponse.parse(reportStore.listReports()));
});

router.put("/reports/:id/sync", (req, res) => {
  const params = SyncReportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = SyncReportBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  try {
    const report = reportStore.syncReport(params.data.id, body.data);
    res.status(200).json(SyncReportResponse.parse(report));
  } catch (error) {
    if (error instanceof InvalidReportStatusTransitionError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
});

router.patch("/reports/:id/status", (req, res) => {
  const params = UpdateReportStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateReportStatusBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  try {
    const report = reportStore.updateReportStatus(params.data.id, body.data);
    if (!report) {
      res.status(404).json({ error: "Report not found." });
      return;
    }
    res.json(UpdateReportStatusResponse.parse(report));
  } catch (error) {
    if (error instanceof InvalidReportStatusTransitionError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
});

router.get("/dashboard", (_req, res) => {
  res.json(GetDashboardResponse.parse(reportStore.getDashboard()));
});

router.get("/activity", (_req, res) => {
  res.json(GetActivityResponse.parse(reportStore.listActivity()));
});

export default router;

import type { ReportStatus } from "@workspace/api-zod";

const allowedTransitions: Record<ReportStatus, ReportStatus[]> = {
  Draft: ["Submitted"],
  Submitted: ["Assigned", "Rejected"],
  Assigned: ["In Progress", "Rejected"],
  "In Progress": ["Resolved", "Rejected"],
  Resolved: [],
  Rejected: [],
};

export function isValidStatusTransition(
  current: ReportStatus,
  next: ReportStatus,
): boolean {
  return allowedTransitions[current].includes(next);
}

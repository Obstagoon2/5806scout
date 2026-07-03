// Talkie: lightweight request/task messages between scouts and the admin,
// stored at teams/{teamId}/talkie and streamed in real time.
//
// Status flow: Open → Assigned (admin-only action) → Done (admin or the
// assigned scout). The result box is writable by everyone at any point.

export const TALKIE_STATUSES = ["open", "assigned", "done"] as const;
export type TalkieStatus = (typeof TALKIE_STATUSES)[number];

export interface TalkieRequest {
  id: string;
  title: string;
  details: string;
  status: TalkieStatus;
  createdByUid: string;
  createdByName: string;
  assigneeUid: string | null;
  assigneeName: string | null;
  /** Findings/updates — editable by all scouts and the admin. */
  result: string;
  createdAtMs: number;
}

export const STATUS_LABELS: Record<TalkieStatus, string> = {
  open: "Open",
  assigned: "Assigned",
  done: "Done",
};

/** Map stored status values (including the legacy "in-progress") to the
 *  current flow so old requests keep rendering. */
export function normalizeStatus(raw: unknown): TalkieStatus {
  if (raw === "in-progress") return "assigned";
  return TALKIE_STATUSES.includes(raw as TalkieStatus)
    ? (raw as TalkieStatus)
    : "open";
}

/** Who may mark a request done: the admin, or the assigned scout. */
export function canMarkDone(
  request: Pick<TalkieRequest, "status" | "assigneeUid">,
  uid: string,
  isAdmin: boolean,
): boolean {
  if (request.status === "done") return false;
  return isAdmin || request.assigneeUid === uid;
}

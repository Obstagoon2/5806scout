// Talkie: lightweight request/task messages between scouts and the admin,
// stored at teams/{teamId}/talkie and streamed in real time.
//
// Status flow: Open → Assigned (admin-only action) → Done. Moving to Done
// takes two sign-offs: an admin AND the user side (the assignee, or the
// creator while unassigned) must each mark the request done. The result box
// is writable by everyone at any point.

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
  /** Done sign-offs — the request only moves to "done" once both are true. */
  doneByAdmin: boolean;
  doneByUser: boolean;
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

/** The uid that owns the user-side sign-off: the assignee, or the creator
 *  while the request is unassigned. */
export function userSideUid(
  request: Pick<TalkieRequest, "assigneeUid" | "createdByUid">,
): string {
  return request.assigneeUid ?? request.createdByUid;
}

/**
 * Fields to write when `uid` marks the request done, or null when this user
 * has no (remaining) sign-off to give. An admin who is also the user side
 * confirms both at once so a self-assigned request can't deadlock. Status
 * flips to "done" only when both sign-offs are in.
 */
export function confirmDoneFields(
  request: Pick<
    TalkieRequest,
    "status" | "assigneeUid" | "createdByUid" | "doneByAdmin" | "doneByUser"
  >,
  uid: string,
  isAdmin: boolean,
): { doneByAdmin: boolean; doneByUser: boolean; status: TalkieStatus } | null {
  if (request.status === "done") return null;
  const doneByAdmin = request.doneByAdmin || isAdmin;
  const doneByUser = request.doneByUser || userSideUid(request) === uid;
  if (
    doneByAdmin === request.doneByAdmin &&
    doneByUser === request.doneByUser
  ) {
    return null;
  }
  return {
    doneByAdmin,
    doneByUser,
    status: doneByAdmin && doneByUser ? "done" : request.status,
  };
}

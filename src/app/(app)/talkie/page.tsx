"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { db } from "@/lib/firebase/client";
import {
  canMarkDone,
  normalizeStatus,
  STATUS_LABELS,
  TALKIE_STATUSES,
  type TalkieRequest,
  type TalkieStatus,
} from "@/lib/talkie";
import type { UserProfile } from "@/lib/types";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

type StatusFilter = TalkieStatus | "all";

const inputClass =
  "w-full rounded-md border border-graphite-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100";

const STATUS_STYLES: Record<TalkieStatus, string> = {
  open: "bg-amber-100 text-amber-900",
  assigned: "bg-sky-50 text-sky-700",
  done: "bg-green-100 text-green-700",
};

export default function TalkiePage() {
  const { profile, user } = useAuth();
  const [requests, setRequests] = useState<TalkieRequest[]>([]);
  const [roster, setRoster] = useState<UserProfile[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Local result draft per request id, saved explicitly.
  const [resultDrafts, setResultDrafts] = useState<Record<string, string>>({});
  const [savingResultId, setSavingResultId] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    const teamId = profile.teamId;
    const unsubRequests = onSnapshot(
      query(
        collection(db, "teams", teamId, "talkie"),
        orderBy("createdAt", "desc"),
      ),
      (snapshot) =>
        setRequests(
          snapshot.docs.map((d) => {
            const data = d.data();
            const createdAt = data.createdAt as Timestamp | null;
            return {
              id: d.id,
              title: (data.title as string) ?? "",
              details: (data.details as string) ?? "",
              status: normalizeStatus(data.status),
              createdByUid: (data.createdByUid as string) ?? "",
              createdByName: (data.createdByName as string) ?? "",
              assigneeUid: (data.assigneeUid as string | null) ?? null,
              assigneeName: (data.assigneeName as string | null) ?? null,
              result: (data.result as string) ?? "",
              createdAtMs: createdAt ? createdAt.toMillis() : Date.now(),
            };
          }),
        ),
    );
    const unsubRoster = onSnapshot(
      query(collection(db, "users"), where("teamId", "==", teamId)),
      (snapshot) =>
        setRoster(
          snapshot.docs.map((d) => {
            const data = d.data();
            return {
              uid: d.id,
              email: (data.email as string) ?? "",
              fullName: (data.fullName as string) ?? "",
              teamId: (data.teamId as string) ?? "",
              role: (data.role as UserProfile["role"]) ?? "scout",
              active: (data.active as boolean) ?? true,
            };
          }),
        ),
    );
    return () => {
      unsubRequests();
      unsubRoster();
    };
  }, [profile]);

  const filtered = useMemo(
    () => (filter === "all" ? requests : requests.filter((r) => r.status === filter)),
    [requests, filter],
  );

  const openCount = requests.filter((r) => r.status !== "done").length;
  const isAdmin = profile?.role === "admin";

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !user || !title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await addDoc(collection(db, "teams", profile.teamId, "talkie"), {
        title: title.trim(),
        details: details.trim(),
        status: "open",
        createdByUid: user.uid,
        createdByName: profile.fullName,
        assigneeUid: null,
        assigneeName: null,
        result: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setTitle("");
      setDetails("");
    } catch {
      setError("Could not post the request — check your connection.");
    } finally {
      setSubmitting(false);
    }
  }

  async function patch(id: string, fields: Record<string, unknown>) {
    if (!profile) return;
    setError(null);
    try {
      await updateDoc(doc(db, "teams", profile.teamId, "talkie", id), {
        ...fields,
        updatedAt: serverTimestamp(),
      });
    } catch {
      setError("Update failed — check your connection.");
    }
  }

  // Admin-only: scouts can post requests but never assign them.
  function handleAssign(request: TalkieRequest, uid: string) {
    if (!isAdmin) return;
    const member = roster.find((m) => m.uid === uid);
    void patch(request.id, {
      assigneeUid: member?.uid ?? null,
      assigneeName: member?.fullName ?? null,
      // Assignment moves an open request forward; clearing it reopens.
      ...(request.status !== "done"
        ? { status: member ? "assigned" : "open" }
        : {}),
    });
  }

  async function handleSaveResult(request: TalkieRequest) {
    const draft = resultDrafts[request.id] ?? request.result;
    setSavingResultId(request.id);
    await patch(request.id, { result: draft.trim() });
    setSavingResultId(null);
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-xl font-semibold text-graphite-900">Talkie</h1>
        <p className="mt-1 text-sm text-graphite-500">
          Requests and tasks between the stands and the pit — {openCount} active.
        </p>
      </div>

      <form
        onSubmit={handlePost}
        className="flex flex-col gap-3 rounded-lg border border-graphite-200 bg-white p-4"
      >
        <input
          type="text"
          placeholder="What do you need? e.g. “Re-scout team 254’s climb”"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass}
        />
        <textarea
          placeholder="Details (optional)"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={2}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="self-end rounded-md bg-maroon-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-maroon-700 disabled:opacity-60"
        >
          {submitting ? "Posting…" : "Post request"}
        </button>
      </form>

      {error && (
        <p className="rounded-md bg-maroon-50 px-3 py-2 text-sm text-maroon-700">
          {error}
        </p>
      )}

      <div className="flex w-fit rounded-md border border-graphite-200 bg-white p-0.5">
        {(["all", ...TALKIE_STATUSES] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`rounded px-3 py-1.5 text-sm font-medium transition ${
              filter === s
                ? "bg-maroon-600 text-white"
                : "text-graphite-600 hover:text-graphite-900"
            }`}
          >
            {s === "all" ? "All" : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <ul className="flex flex-col gap-3">
        {filtered.map((request) => {
          const expanded = expandedId === request.id;
          const draft = resultDrafts[request.id] ?? request.result;
          const showMarkDone =
            !!user && canMarkDone(request, user.uid, isAdmin);
          return (
            <li
              key={request.id}
              className="flex flex-col gap-2 rounded-lg border border-graphite-200 bg-white p-4"
            >
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : request.id)}
                className="flex items-start justify-between gap-3 text-left"
                aria-expanded={expanded}
              >
                <div>
                  <p
                    className={`text-sm font-semibold text-graphite-900 ${
                      request.status === "done" ? "line-through opacity-60" : ""
                    }`}
                  >
                    {request.title}
                  </p>
                  {request.details && (
                    <p className="mt-0.5 text-sm text-graphite-600">
                      {request.details}
                    </p>
                  )}
                  {!expanded && request.result && (
                    <p className="mt-0.5 truncate text-xs text-graphite-500">
                      Result: {request.result}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded px-2 py-1 text-xs font-semibold ${STATUS_STYLES[request.status]}`}
                >
                  {STATUS_LABELS[request.status]}
                </span>
              </button>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-graphite-500">
                <span>
                  {request.createdByName} ·{" "}
                  {new Date(request.createdAtMs).toLocaleString(undefined, {
                    weekday: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                {isAdmin ? (
                  <label className="flex items-center gap-1.5">
                    Assignee
                    <select
                      value={request.assigneeUid ?? ""}
                      onChange={(e) => handleAssign(request, e.target.value)}
                      className="rounded-md border border-graphite-200 bg-white px-2 py-1 text-xs outline-none transition focus:border-maroon-400"
                    >
                      <option value="">Unassigned</option>
                      {roster.map((member) => (
                        <option key={member.uid} value={member.uid}>
                          {member.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <span>
                    {request.assigneeName
                      ? `Assigned to ${request.assigneeName}`
                      : "Unassigned"}
                  </span>
                )}
              </div>

              {showMarkDone && (
                <button
                  type="button"
                  onClick={() => void patch(request.id, { status: "done" })}
                  className="self-start rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-green-700"
                >
                  Mark as Done
                </button>
              )}

              {expanded && (
                <div className="flex flex-col gap-2 border-t border-graphite-100 pt-3">
                  <label className="flex flex-col gap-1.5 text-xs font-medium text-graphite-700">
                    Result / update (visible and editable by everyone)
                    <textarea
                      rows={3}
                      value={draft}
                      onChange={(e) =>
                        setResultDrafts((prev) => ({
                          ...prev,
                          [request.id]: e.target.value,
                        }))
                      }
                      placeholder="What was found / what was done…"
                      className={inputClass}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={
                      savingResultId === request.id || draft === request.result
                    }
                    onClick={() => void handleSaveResult(request)}
                    className="self-end rounded-md bg-maroon-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-maroon-700 disabled:opacity-60"
                  >
                    {savingResultId === request.id ? "Saving…" : "Save result"}
                  </button>
                </div>
              )}
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="rounded-lg border border-dashed border-graphite-300 bg-white px-6 py-10 text-center text-sm text-graphite-500">
            {requests.length === 0
              ? "No requests yet — post the first one above."
              : "Nothing with this status."}
          </li>
        )}
      </ul>
    </main>
  );
}

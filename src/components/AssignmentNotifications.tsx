"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { db } from "@/lib/firebase/client";
import {
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import Link from "next/link";
import { useEffect, useState } from "react";

interface PendingAssignment {
  id: string;
  title: string;
  createdByName: string;
}

// Dashboard-wide banner: when an admin assigns a talkie request to a scout
// (assigneeSeen flipped to false on the request doc), the scout sees it here
// on every page until they dismiss it or open the request.
export function AssignmentNotifications() {
  const { profile, user } = useAuth();
  const [pending, setPending] = useState<PendingAssignment[]>([]);

  useEffect(() => {
    if (!profile || !user) return;
    return onSnapshot(
      query(
        collection(db, "teams", profile.teamId, "talkie"),
        where("assigneeUid", "==", user.uid),
        where("assigneeSeen", "==", false),
      ),
      (snapshot) =>
        setPending(
          snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              title: (data.title as string) ?? "",
              createdByName: (data.createdByName as string) ?? "",
            };
          }),
        ),
    );
  }, [profile, user]);

  async function dismiss(id: string) {
    if (!profile) return;
    try {
      await updateDoc(doc(db, "teams", profile.teamId, "talkie", id), {
        assigneeSeen: true,
      });
    } catch {
      // Banner stays if the write fails — the scout can retry.
    }
  }

  if (pending.length === 0) return null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 pt-3 md:px-6">
      {pending.map((assignment) => (
        <div
          key={assignment.id}
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5"
        >
          <p className="text-sm text-sky-900">
            <span className="font-semibold">New talkie assignment:</span>{" "}
            {assignment.title}
            {assignment.createdByName && (
              <span className="text-sky-700"> — from {assignment.createdByName}</span>
            )}
          </p>
          <span className="flex items-center gap-2">
            <Link
              href="/talkie"
              onClick={() => void dismiss(assignment.id)}
              className="rounded-md bg-sky-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-sky-700"
            >
              View
            </Link>
            <button
              type="button"
              onClick={() => void dismiss(assignment.id)}
              className="rounded-md border border-sky-200 px-3 py-1 text-xs font-medium text-sky-700 transition hover:border-sky-300"
            >
              Dismiss
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

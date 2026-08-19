"use client";

import { MyMatchAssignments, MyPitAssignments } from "@/components/MyAssignments";
import { useAuth } from "@/lib/auth/AuthProvider";
import { matchScoutHref, pitScoutHref } from "@/lib/dashboard";
import { db } from "@/lib/firebase/client";
import { normalizeStatus, type TalkieStatus } from "@/lib/talkie";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// A scout's whole shift on one screen: what's been handed to them personally
// (talkies), and the two assignment rotations. Every row is a way into the
// form that clears it — the dashboard is a launchpad, not a report.

interface MyTalkie {
  id: string;
  title: string;
  details: string;
  status: TalkieStatus;
  createdByName: string;
  createdAtMs: number;
}

const STATUS_BADGE: Record<TalkieStatus, string> = {
  open: "badge-warning",
  assigned: "badge-error",
  done: "badge-success",
};

function MyTalkies() {
  const { user, dataTeamId } = useAuth();
  const [talkies, setTalkies] = useState<MyTalkie[]>([]);

  useEffect(() => {
    if (!dataTeamId || !user) return;
    // Equality-only query so no composite index is needed; the done ones are
    // filtered out below rather than with a second where().
    return onSnapshot(
      query(
        collection(db, "teams", dataTeamId, "talkie"),
        where("assigneeUid", "==", user.uid),
      ),
      (snapshot) =>
        setTalkies(
          snapshot.docs.map((d) => {
            const data = d.data();
            const createdAt = data.createdAt as { toMillis(): number } | null;
            return {
              id: d.id,
              title: (data.title as string) ?? "",
              details: (data.details as string) ?? "",
              status: normalizeStatus(data.status),
              createdByName: (data.createdByName as string) ?? "",
              createdAtMs: createdAt ? createdAt.toMillis() : Date.now(),
            };
          }),
        ),
    );
  }, [dataTeamId, user]);

  const open = talkies
    .filter((talkie) => talkie.status !== "done")
    .sort((a, b) => b.createdAtMs - a.createdAtMs);

  return (
    <section className="surface-card flex flex-col gap-3 p-4">
      <h2 className="flex items-baseline justify-between gap-2">
        <span className="section-title">Your talkies</span>
        <span className="stat text-xs text-graphite-500">{open.length}</span>
      </h2>

      {open.length === 0 ? (
        <p className="text-sm text-graphite-500">
          Nothing assigned to you right now.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-graphite-100">
          {open.map((talkie) => (
            <li key={talkie.id} className="py-2.5 first:pt-0 last:pb-0">
              <Link
                href="/talkie"
                className="flex flex-col gap-1 transition hover:text-maroon-700 dark:hover:text-maroon-300"
              >
                <span className="flex items-center gap-2">
                  <span className={`badge ${STATUS_BADGE[talkie.status]}`}>
                    {talkie.status}
                  </span>
                  <span className="text-sm font-medium text-graphite-900">
                    {talkie.title}
                  </span>
                </span>
                {talkie.details && (
                  <span className="line-clamp-2 text-xs text-graphite-500">
                    {talkie.details}
                  </span>
                )}
                <span className="text-xs text-graphite-400">
                  from {talkie.createdByName || "a teammate"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ScoutDashboard() {
  const { profile } = useAuth();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2.5 text-xl font-semibold text-graphite-900">
          <span aria-hidden className="h-5 w-1.5 bg-maroon-600" />
          {profile ? `Hey, ${profile.fullName.split(" ")[0]}` : "Your shift"}
        </h1>
        <p className="mt-1 text-sm text-graphite-500">
          Everything assigned to you. Tap anything to open its form.
        </p>
      </div>

      <MyTalkies />

      {/* Same components the scouting tabs use — tapping a row here navigates
          to the form with the robot preloaded instead of loading it in place. */}
      <MyPitAssignments
        activeTeam={null}
        onOpenTeam={(teamNumber) => router.push(pitScoutHref(teamNumber))}
      />
      <MyMatchAssignments onPick={(slot) => router.push(matchScoutHref(slot))} />
    </div>
  );
}

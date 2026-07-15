"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import {
  assignMatchScouts,
  assignPitScouts,
  type MatchAssignmentsDoc,
  type PitAssignmentsDoc,
} from "@/lib/assignments";
import type { EventData } from "@/lib/eventData";
import { db } from "@/lib/firebase/client";
import {
  createSisterInvite,
  redeemSisterInvite,
  unlinkSisterTeam,
} from "@/lib/sisterTeamOps";
import type { UserProfile } from "@/lib/types";
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";

export default function TeamPage() {
  const { profile, user, team, dataTeamId } = useAuth();
  const [roster, setRoster] = useState<UserProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<EventData | null>(null);
  const [hasPitAssignments, setHasPitAssignments] = useState(false);
  const [hasMatchAssignments, setHasMatchAssignments] = useState(false);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkMessage, setLinkMessage] = useState<string | null>(null);

  // Roster pools both teams when a sister team is linked, so assignments
  // split the work across every active scout in the pair.
  useEffect(() => {
    if (!profile) return;
    const teamIds = [profile.teamId, team?.sisterTeamId].filter(
      (id): id is string => !!id,
    );
    const byTeam = new Map<string, UserProfile[]>();
    const unsubs = teamIds.map((teamId) =>
      onSnapshot(
        query(collection(db, "users"), where("teamId", "==", teamId)),
        (snapshot) => {
          byTeam.set(
            teamId,
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
          );
          setRoster(
            teamIds
              .flatMap((id) => byTeam.get(id) ?? [])
              .sort((a, b) => a.fullName.localeCompare(b.fullName)),
          );
        },
      ),
    );
    return () => unsubs.forEach((unsub) => unsub());
  }, [profile, team?.sisterTeamId]);

  // Event + assignment docs live in the shared store.
  useEffect(() => {
    if (!dataTeamId) return;
    const unsubEvent = onSnapshot(
      doc(db, "teams", dataTeamId, "config", "event"),
      (s) => {
        setEvent(s.exists() ? (s.data() as EventData) : null);
      },
    );
    const unsubPit = onSnapshot(
      doc(db, "teams", dataTeamId, "config", "pitAssignments"),
      (s) => setHasPitAssignments(s.exists()),
    );
    const unsubMatch = onSnapshot(
      doc(db, "teams", dataTeamId, "config", "matchAssignments"),
      (s) => setHasMatchAssignments(s.exists()),
    );
    return () => {
      unsubEvent();
      unsubPit();
      unsubMatch();
    };
  }, [dataTeamId]);

  const isAdmin = profile?.role === "admin";
  const activeScouts = roster.filter((m) => m.role === "scout" && m.active);

  function scoutNames(): Record<string, string> {
    return Object.fromEntries(activeScouts.map((m) => [m.uid, m.fullName]));
  }

  async function handleAssignPit() {
    if (!profile || !event || !dataTeamId) return;
    if (
      hasPitAssignments &&
      !window.confirm(
        "Pit scouting assignments already exist. Replace them with a fresh random assignment?",
      )
    ) {
      return;
    }
    setError(null);
    setAssignSuccess(null);
    try {
      const byScout = assignPitScouts(
        event.teams.map((t) => t.teamNumber),
        activeScouts.map((m) => m.uid),
      );
      const payload: PitAssignmentsDoc = {
        byScout,
        scoutNames: scoutNames(),
        generatedAt: Date.now(),
      };
      await setDoc(
        doc(db, "teams", dataTeamId, "config", "pitAssignments"),
        payload,
      );
      setAssignSuccess(
        `Pit scouting: ${event.teams.length} teams split across ${activeScouts.length} scouts — see the Assignments tab.`,
      );
    } catch {
      setError("Could not save pit assignments — check your connection.");
    }
  }

  async function handleAssignMatch() {
    if (!profile || !event || !dataTeamId) return;
    if (
      hasMatchAssignments &&
      !window.confirm(
        "Match scouting assignments already exist. Replace them with a fresh random assignment?",
      )
    ) {
      return;
    }
    setError(null);
    setAssignSuccess(null);
    try {
      const slots = assignMatchScouts(
        event.matches,
        activeScouts.map((m) => m.uid),
      );
      const payload: MatchAssignmentsDoc = {
        slots,
        scoutNames: scoutNames(),
        generatedAt: Date.now(),
      };
      await setDoc(
        doc(db, "teams", dataTeamId, "config", "matchAssignments"),
        payload,
      );
      setAssignSuccess(
        `Match scouting: ${event.matches.length} matches covered by ${activeScouts.length} scouts — see the Assignments tab.`,
      );
    } catch {
      setError("Could not save match assignments — check your connection.");
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setInviteSuccess(null);
    setInviteSending(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/invite-scout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ fullName: inviteName, email: inviteEmail }),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; invited?: string }
        | null;
      if (!res.ok) {
        setError(body?.error ?? "Could not send the invite.");
        return;
      }
      setInviteSuccess(
        `Invite sent to ${body?.invited ?? inviteEmail} — they'll get an email to set their password.`,
      );
      setInviteName("");
      setInviteEmail("");
      setShowInvite(false);
    } catch {
      setError("Could not send the invite — check your connection.");
    } finally {
      setInviteSending(false);
    }
  }

  async function handleGenerateCode() {
    if (!profile || !user || !team) return;
    setError(null);
    setLinkMessage(null);
    setLinkBusy(true);
    try {
      setLinkCode(
        await createSisterInvite({ teamId: profile.teamId, team, uid: user.uid }),
      );
    } catch {
      setError("Could not create a link code — check your connection.");
    } finally {
      setLinkBusy(false);
    }
  }

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !team) return;
    setError(null);
    setLinkMessage(null);
    setLinkBusy(true);
    try {
      await redeemSisterInvite({
        code: codeInput,
        myTeamId: profile.teamId,
        myTeam: team,
      });
      setCodeInput("");
      setLinkCode(null);
      setLinkMessage(
        "Linked! Both teams now share scouting data, assignments, and the event.",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not link — try again.",
      );
    } finally {
      setLinkBusy(false);
    }
  }

  async function handleUnlink() {
    if (!profile || !team?.sisterTeamId) return;
    if (
      !window.confirm(
        `Unlink from Team ${team.sisterTeamNumber}? Both teams keep a full copy of the shared scouting data; picklists were never shared.`,
      )
    ) {
      return;
    }
    setError(null);
    setLinkMessage(null);
    setLinkBusy(true);
    try {
      await unlinkSisterTeam({ myTeamId: profile.teamId, myTeam: team });
      setLinkMessage("Unlinked — each team keeps its own copy of the data.");
    } catch {
      setError("Could not unlink — check your connection.");
    } finally {
      setLinkBusy(false);
    }
  }

  async function toggleActive(member: UserProfile) {
    if (!profile) return;
    setError(null);
    try {
      await updateDoc(doc(db, "users", member.uid), { active: !member.active });
    } catch {
      setError("Could not update that scout — check your connection.");
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="flex items-center gap-2.5 text-xl font-semibold text-graphite-900">
          <span aria-hidden className="h-5 w-1.5 bg-maroon-600" />
          Team {team?.teamNumber ?? profile?.teamId}
          {team?.teamName && team.teamName !== team.teamNumber
            ? ` — ${team.teamName}`
            : ""}
        </h1>
        <p className="mt-1 text-sm text-graphite-500">
          {roster.length} member{roster.length === 1 ? "" : "s"}.{" "}
          {isAdmin
            ? "Deactivated scouts keep their account but should hand off duties."
            : "Admin access is granted by promoting a user in the Firebase console."}
        </p>
      </div>

      {isAdmin && (
        <div className="surface-card flex flex-col gap-2 p-4">
          <p className="text-sm font-medium text-graphite-900">
            Scouting assignments
          </p>
          <p className="text-xs text-graphite-500">
            {event
              ? `Randomly split the ${event.teams.length} event teams (pit) or all ${event.matches.length} matches (match) across the ${activeScouts.length} active scout${activeScouts.length === 1 ? "" : "s"}. Results appear in the Assignments tab.`
              : "Sync an event on the Event tab first."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!event || activeScouts.length === 0 || event.teams.length === 0}
              onClick={() => void handleAssignPit()}
              className="btn-primary px-4 py-2"
            >
              Assign Pit Scout
            </button>
            <button
              type="button"
              disabled={!event || activeScouts.length === 0 || event.matches.length === 0}
              onClick={() => void handleAssignMatch()}
              className="btn-primary px-4 py-2"
            >
              Assign Match Scout
            </button>
          </div>
          {event && activeScouts.length === 0 && (
            <p className="text-xs text-amber-700">
              No active members with the scout role — add or reactivate scouts
              below.
            </p>
          )}
        </div>
      )}

      {assignSuccess && (
        <p className="badge-success rounded-md px-3 py-2 text-sm normal-case tracking-normal">
          {assignSuccess}
        </p>
      )}

      {isAdmin && (
        <div className="surface-card flex flex-col gap-2 p-4">
          <p className="text-sm font-medium text-graphite-900">Sister team</p>
          {team?.sisterTeamId ? (
            <>
              <p className="text-xs text-graphite-500">
                Linked with Team {team.sisterTeamNumber}
                {team.sisterTeamName &&
                team.sisterTeamName !== team.sisterTeamNumber
                  ? ` — ${team.sisterTeamName}`
                  : ""}
                . Both teams share scouting data, assignments, talkie, and the
                synced event; each team keeps its own picklist and Do Not Pick
                list.
              </p>
              <button
                type="button"
                disabled={linkBusy}
                onClick={() => void handleUnlink()}
                className="btn-secondary self-start border-maroon-200 px-4 py-2 text-maroon-700 hover:border-maroon-400"
              >
                {linkBusy ? "Unlinking…" : "Unlink sister team"}
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-graphite-500">
                Pair up with your sister team to share all scouting data and
                split the collection work — picklists stay separate. One
                team&apos;s admin generates a code; the other enters it here.
              </p>
              {linkCode ? (
                <p className="surface-panel rounded-md px-3 py-2 text-sm text-graphite-700">
                  Share this code with their admin (valid for 24 hours):{" "}
                  <span className="stat text-lg font-bold tracking-widest text-graphite-900">
                    {linkCode}
                  </span>
                </p>
              ) : (
                <button
                  type="button"
                  disabled={linkBusy}
                  onClick={() => void handleGenerateCode()}
                  className="btn-primary self-start px-4 py-2"
                >
                  Generate link code
                </button>
              )}
              <form onSubmit={handleRedeem} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Code from your sister team"
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  className="field-input stat w-56 uppercase tracking-widest"
                />
                <button
                  type="submit"
                  disabled={linkBusy || !codeInput.trim()}
                  className="btn-primary px-4 py-2"
                >
                  {linkBusy ? "Linking…" : "Link"}
                </button>
              </form>
            </>
          )}
          {linkMessage && (
            <p className="badge-success rounded-md px-3 py-2 text-sm normal-case tracking-normal">
              {linkMessage}
            </p>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="flex flex-col gap-3">
          {!showInvite && (
            <button
              type="button"
              onClick={() => {
                setShowInvite(true);
                setInviteSuccess(null);
              }}
              className="btn-primary self-start px-4 py-2"
            >
              Add scout
            </button>
          )}
          {showInvite && (
            <form
              onSubmit={handleInvite}
              className="surface-card flex flex-col gap-3 p-4"
            >
              <p className="text-sm font-medium text-graphite-900">
                Add a scout
              </p>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-graphite-700">
                  Full name
                </span>
                <input
                  required
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="field-input"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-graphite-700">
                  Email
                </span>
                <input
                  required
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="field-input"
                />
              </label>
              <p className="text-xs text-graphite-500">
                They&apos;ll get an email inviting them to set a password and
                log in.
              </p>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={inviteSending}
                  className="btn-primary px-4 py-2"
                >
                  {inviteSending ? "Sending invite…" : "Send invite"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="btn-secondary px-4 py-2"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {inviteSuccess && (
        <p className="badge-success rounded-md px-3 py-2 text-sm normal-case tracking-normal">
          {inviteSuccess}
        </p>
      )}

      {error && (
        <p className="badge-error rounded-md px-3 py-2 text-sm normal-case tracking-normal">
          {error}
        </p>
      )}

      <ul className="surface-card divide-y divide-graphite-100">
        {roster.map((member) => (
          <li
            key={member.uid}
            className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-graphite-50"
          >
            <div className={member.active ? "" : "opacity-50"}>
              <p className="text-sm font-medium text-graphite-900">
                {member.fullName}
                {member.uid === user?.uid && (
                  <span className="ml-1.5 text-xs text-graphite-400">(you)</span>
                )}
              </p>
              <p className="text-xs text-graphite-500">{member.email}</p>
            </div>
            <div className="flex items-center gap-2">
              {member.teamId !== profile?.teamId && (
                <span className="rounded bg-sky-50 px-1.5 py-0.5 text-xs font-semibold text-sky-700">
                  {team?.sisterTeamNumber ?? member.teamId}
                </span>
              )}
              <span
                className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                  member.role === "admin"
                    ? "bg-maroon-50 text-maroon-700"
                    : "bg-graphite-100 text-graphite-600"
                }`}
              >
                {member.role}
              </span>
              {!member.active && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900">
                  inactive
                </span>
              )}
              {isAdmin && member.uid !== user?.uid && member.teamId === profile?.teamId && (
                <button
                  type="button"
                  onClick={() => void toggleActive(member)}
                  className="btn-ghost border border-graphite-200 px-2.5 py-1"
                >
                  {member.active ? "Deactivate" : "Reactivate"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}

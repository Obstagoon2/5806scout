import { describe, expect, it } from "vitest";
import type { EventMatch } from "@/lib/eventData";
import {
  allianceOf,
  AUTO_PAUSE_SECONDS,
  AUTO_SECONDS,
  formatMoment,
  mapMatchVideos,
  MATCH_SECONDS,
  matchTeams,
  momentAt,
  resolveOffset,
  reviewableMatches,
  sortNotes,
  type MatchReviewDoc,
  type MatchReviewNote,
} from "@/lib/matchReview";
import { TELEOP_SECONDS } from "@/lib/matchTimer";

const TELEOP_START = AUTO_SECONDS + AUTO_PAUSE_SECONDS;

function match(overrides: Partial<EventMatch> = {}): EventMatch {
  return {
    key: "2026alhu_qm24",
    compLevel: "qm",
    matchNumber: 24,
    red: [120, 9401, 2481],
    blue: [5806, 254, 1678],
    redScore: 79,
    blueScore: 34,
    winner: "red",
    scheduledTime: null,
    ...overrides,
  };
}

function note(overrides: Partial<MatchReviewNote> = {}): MatchReviewNote {
  return {
    id: "n1",
    matchKey: "2026alhu_qm24",
    videoSeconds: 0,
    teamNumber: null,
    text: "",
    authorUid: "u1",
    authorName: "Jordan",
    createdAtMs: 0,
    ...overrides,
  };
}

function reviewDoc(overrides: Partial<MatchReviewDoc> = {}): MatchReviewDoc {
  return {
    matchKey: "2026alhu_qm24",
    videoOffsetSeconds: 29,
    confirmed: true,
    markedByName: "Jordan",
    markedAtMs: 1000,
    ...overrides,
  };
}

describe("momentAt", () => {
  it("reads the field-reset shot as pre-match", () => {
    const moment = momentAt(10, 29);
    expect(moment.phase).toBe("pre");
    expect(moment.arenaSeconds).toBeNull();
    expect(moment.elapsedSeconds).toBe(-19);
  });

  it("shows a full auto clock on the green flag", () => {
    // The arena reads 0:20 the instant auto starts, never 0:19.
    expect(momentAt(29, 29)).toMatchObject({
      phase: "auto",
      arenaSeconds: AUTO_SECONDS,
    });
  });

  it("counts auto down", () => {
    expect(momentAt(29 + 6, 29).arenaSeconds).toBe(14);
  });

  it("names the scoring pause between auto and teleop", () => {
    expect(momentAt(29 + AUTO_SECONDS + 1, 29).phase).toBe("pause");
  });

  it("does not let the pause bleed into teleop's clock", () => {
    // Without the 3-second pause every teleop note would read early.
    expect(momentAt(29 + TELEOP_START, 29)).toMatchObject({
      phase: "teleop",
      arenaSeconds: TELEOP_SECONDS,
      shift: "Transition",
    });
  });

  it("names the teleop shift", () => {
    const shiftAt = (secondsIntoTeleop: number) =>
      momentAt(29 + TELEOP_START + secondsIntoTeleop, 29).shift;
    expect(shiftAt(5)).toBe("Transition");
    expect(shiftAt(10)).toBe("Shift 1");
    expect(shiftAt(40)).toBe("Shift 2");
    expect(shiftAt(115)).toBe("End game");
  });

  it("reads past the buzzer as post-match", () => {
    expect(momentAt(29 + MATCH_SECONDS, 29).phase).toBe("post");
    expect(momentAt(29 + MATCH_SECONDS + 30, 29).arenaSeconds).toBeNull();
  });

  it("puts an unmarked clip in auto on frame one", () => {
    // Offset 0 is wrong, but it's wrong visibly — AUTO 0:20 over a shot of an
    // empty field says "nobody has marked this" far better than a plausible
    // teleop timestamp would.
    expect(momentAt(0, 0).phase).toBe("auto");
  });
});

describe("formatMoment", () => {
  it("stamps a note the way the field display read", () => {
    expect(formatMoment(momentAt(29 + 6, 29))).toBe("AUTO 0:14");
    expect(formatMoment(momentAt(29 + TELEOP_START + 49, 29))).toBe("TELE 1:31");
  });

  it("falls back to the phase where there is no arena clock", () => {
    expect(formatMoment(momentAt(0, 29))).toBe("PRE");
    expect(formatMoment(momentAt(29 + AUTO_SECONDS + 1, 29))).toBe("PAUSE");
    expect(formatMoment(momentAt(29 + MATCH_SECONDS + 5, 29))).toBe("POST");
  });
});

describe("sortNotes", () => {
  it("orders by when it happened on the field", () => {
    const sorted = sortNotes([
      note({ id: "late", videoSeconds: 90 }),
      note({ id: "early", videoSeconds: 31 }),
    ]);
    expect(sorted.map((n) => n.id)).toEqual(["early", "late"]);
  });

  it("keeps two notes on the same second in the order they were written", () => {
    const sorted = sortNotes([
      note({ id: "second", videoSeconds: 40, createdAtMs: 200 }),
      note({ id: "first", videoSeconds: 40, createdAtMs: 100 }),
    ]);
    expect(sorted.map((n) => n.id)).toEqual(["first", "second"]);
  });

  it("does not mutate its input", () => {
    const notes = [note({ id: "b", videoSeconds: 90 }), note({ id: "a", videoSeconds: 1 })];
    sortNotes(notes);
    expect(notes.map((n) => n.id)).toEqual(["b", "a"]);
  });
});

describe("matchTeams", () => {
  it("lists all six robots, red first", () => {
    expect(matchTeams(match())).toEqual([120, 9401, 2481, 5806, 254, 1678]);
  });
});

describe("reviewableMatches", () => {
  const played = [
    match({ key: "qm1", matchNumber: 1, red: [120, 1, 2], blue: [3, 4, 5] }),
    match({ key: "qm2", matchNumber: 2, red: [9, 8, 7], blue: [6, 5, 4] }),
    match({ key: "qm3", matchNumber: 3, red: [120, 9, 8], blue: [1, 2, 3] }),
  ];

  it("puts the match that just happened first", () => {
    expect(reviewableMatches(played, null).map((m) => m.key)).toEqual([
      "qm3",
      "qm2",
      "qm1",
    ]);
  });

  it("narrows to one robot, either alliance", () => {
    expect(reviewableMatches(played, 120).map((m) => m.key)).toEqual(["qm3", "qm1"]);
    expect(reviewableMatches(played, 4).map((m) => m.key)).toEqual(["qm2", "qm1"]);
  });

  it("leaves out matches that haven't been played", () => {
    // No score means no result to review and no video to watch.
    const withUpcoming = [
      ...played,
      match({ key: "qm4", matchNumber: 4, redScore: null, blueScore: null, winner: null }),
    ];
    expect(reviewableMatches(withUpcoming, null).map((m) => m.key)).not.toContain("qm4");
  });

  it("does not reverse the caller's array in place", () => {
    const source = [...played];
    reviewableMatches(source, null);
    expect(source.map((m) => m.key)).toEqual(["qm1", "qm2", "qm3"]);
  });
});

describe("allianceOf", () => {
  it("finds which side a robot was on", () => {
    expect(allianceOf(match(), 9401)).toBe("red");
    expect(allianceOf(match(), 254)).toBe("blue");
  });

  it("is null for a robot that wasn't in the match", () => {
    expect(allianceOf(match(), 5000)).toBeNull();
  });
});

describe("resolveOffset", () => {
  it("uses this clip's own confirmed mark", () => {
    expect(resolveOffset("2026alhu_qm24", [reviewDoc()])).toEqual({
      seconds: 29,
      confirmed: true,
      inheritedFrom: null,
    });
  });

  it("borrows the newest confirmed mark from a sibling clip", () => {
    const resolved = resolveOffset("2026alhu_qm30", [
      reviewDoc({ matchKey: "2026alhu_qm10", videoOffsetSeconds: 22, markedAtMs: 500 }),
      reviewDoc({ matchKey: "2026alhu_qm24", videoOffsetSeconds: 29, markedAtMs: 900 }),
    ]);
    expect(resolved).toEqual({
      seconds: 29,
      confirmed: false,
      inheritedFrom: "2026alhu_qm24",
    });
  });

  it("never borrows from an unconfirmed mark", () => {
    // Otherwise one bad guess would propagate across the whole event with
    // nothing on screen tracing it back.
    expect(
      resolveOffset("2026alhu_qm30", [
        reviewDoc({ matchKey: "2026alhu_qm24", confirmed: false }),
      ]),
    ).toBeNull();
  });

  it("prefers an own unconfirmed-but-present doc's sibling over nothing", () => {
    expect(resolveOffset("2026alhu_qm24", [])).toBeNull();
  });
});

describe("mapMatchVideos", () => {
  it("keys the YouTube id by match", () => {
    expect(
      mapMatchVideos([
        { key: "2026alhu_qm1", videos: [{ key: "DfJSZMKQf_s", type: "youtube" }] },
      ]),
    ).toEqual({ "2026alhu_qm1": "DfJSZMKQf_s" });
  });

  it("skips a match with no video", () => {
    expect(mapMatchVideos([{ key: "2026alhu_qm2", videos: [] }])).toEqual({});
    expect(mapMatchVideos([{ key: "2026alhu_qm2" }])).toEqual({});
    expect(mapMatchVideos([{ key: "2026alhu_qm2", videos: null }])).toEqual({});
  });

  it("drops TBA-hosted video the embed can't play", () => {
    // Handing a `tba` key to a YouTube player shows an error where a video
    // should be — better to report the match as having none.
    expect(
      mapMatchVideos([{ key: "2026alhu_qm3", videos: [{ key: "abc", type: "tba" }] }]),
    ).toEqual({});
  });

  it("takes the YouTube one when a match has both", () => {
    expect(
      mapMatchVideos([
        {
          key: "2026alhu_qm4",
          videos: [
            { key: "old", type: "tba" },
            { key: "yt", type: "youtube" },
          ],
        },
      ]),
    ).toEqual({ "2026alhu_qm4": "yt" });
  });
});

import { describe, expect, it } from "vitest";
import {
  mapPitMap,
  mapQueueMatch,
  pitAddressFor,
  selectQueueStatus,
  type NexusEventStatusPayload,
  type NexusMatch,
  type NexusPitMapPayload,
} from "@/lib/nexus";

describe("mapPitMap", () => {
  const payload: NexusPitMapPayload = {
    size: { x: 400, y: 300 },
    pits: {
      A1: {
        position: { x: 50, y: 40 },
        size: { x: 100, y: 100 },
        angle: 90,
        team: "5806",
      },
      A2: { position: { x: 160, y: 40 }, size: { x: 100, y: 100 } },
    },
    areas: {
      admin: {
        position: { x: 300, y: 200 },
        size: { x: 80, y: 60 },
        label: "Pit admin",
      },
    },
    labels: null,
    arrows: {
      entry: { position: { x: 10, y: 10 }, size: { x: 20, y: 40 } },
    },
    walls: null,
  };

  it("flattens elements into centered boxes with geometry preserved", () => {
    const map = mapPitMap(payload);

    expect(map.width).toBe(400);
    expect(map.height).toBe(300);
    expect(map.pits).toHaveLength(2);
    expect(map.pits[0]).toEqual({
      id: "A1",
      x: 50,
      y: 40,
      width: 100,
      height: 100,
      angle: 90,
      label: "5806",
    });
    expect(map.areas[0].label).toBe("Pit admin");
    expect(map.labels).toEqual([]);
    expect(map.walls).toEqual([]);
  });

  it("defaults arrow direction and color when Nexus omits them", () => {
    expect(mapPitMap(payload).arrows[0]).toMatchObject({
      id: "entry",
      direction: "single",
      color: "blue",
    });
  });

  it("fills a pit's team from the address directory when the map lacks one", () => {
    const map = mapPitMap(payload, { "1234": "A2" });

    expect(map.pits.find((pit) => pit.id === "A2")?.label).toBe("1234");
    // The map's own team assignment still wins where it exists.
    expect(map.pits.find((pit) => pit.id === "A1")?.label).toBe("5806");
  });

  it("survives a payload with nothing but a size", () => {
    const map = mapPitMap({ size: { x: 10, y: 10 } });

    expect(map).toEqual({
      width: 10,
      height: 10,
      pits: [],
      areas: [],
      labels: [],
      walls: [],
      arrows: [],
    });
  });
});

describe("pitAddressFor", () => {
  it("returns the address for a team, or null when unassigned", () => {
    expect(pitAddressFor({ "5806": "C14" }, "5806")).toBe("C14");
    expect(pitAddressFor({ "5806": "C14" }, "254")).toBeNull();
  });
});

function match(overrides: Partial<NexusMatch> = {}): NexusMatch {
  return {
    label: "Qualification 1",
    status: "Queuing soon",
    redTeams: ["111", "222", "333"],
    blueTeams: ["444", "555", "666"],
    ...overrides,
  };
}

describe("mapQueueMatch", () => {
  it("prefers actual timestamps over estimates", () => {
    const mapped = mapQueueMatch(
      match({
        status: "On deck",
        times: {
          estimatedQueueTime: 100,
          actualQueueTime: 120,
          estimatedOnDeckTime: 200,
          actualOnDeckTime: 210,
        },
      }),
    );

    expect(mapped.queueTime).toBe(120);
    expect(mapped.onDeckTime).toBe(210);
  });

  it("falls back to estimates, then to the scheduled start", () => {
    const mapped = mapQueueMatch(
      match({ times: { estimatedQueueTime: 100, scheduledStartTime: 900 } }),
    );

    expect(mapped.queueTime).toBe(100);
    expect(mapped.startTime).toBe(900);
    expect(mapped.onDeckTime).toBeNull();
  });

  it("drops null team slots and flags replays", () => {
    const mapped = mapQueueMatch(
      match({ redTeams: ["111", null, "333"], replayOf: "Qualification 1" }),
    );

    expect(mapped.redTeams).toEqual(["111", "333"]);
    expect(mapped.isReplay).toBe(true);
  });
});

describe("selectQueueStatus", () => {
  const payload: NexusEventStatusPayload = {
    eventKey: "2026casf",
    dataAsOfTime: 1_700_000_000_000,
    nowQueuing: "Qualification 12",
    matches: [
      match({ label: "Qualification 9", status: "On field" }),
      // A played match keeps "On field" until the next one takes the field, so
      // the LAST one is live — this earlier one must not win.
      match({ label: "Qualification 10", status: "On field" }),
      match({ label: "Qualification 11", status: "On deck" }),
      match({ label: "Qualification 12", status: "Now queuing" }),
      match({
        label: "Qualification 13",
        status: "Queuing soon",
        redTeams: ["5806", "222", "333"],
      }),
      match({ label: "Qualification 14", status: "Queuing soon" }),
      match({ label: "Qualification 15", status: "Queuing soon" }),
    ],
  };

  it("treats the last On field match as the live one", () => {
    expect(selectQueueStatus(payload, "5806").onField?.label).toBe(
      "Qualification 10",
    );
  });

  it("passes through nowQueuing and the snapshot time", () => {
    const status = selectQueueStatus(payload, "5806");

    expect(status.nowQueuing).toBe("Qualification 12");
    expect(status.dataAsOfTime).toBe(1_700_000_000_000);
    expect(status.eventKey).toBe("2026casf");
  });

  it("finds our next match after the one on the field", () => {
    expect(selectQueueStatus(payload, "5806").ourNext?.label).toBe(
      "Qualification 13",
    );
  });

  it("never returns a match we're already playing on the field as our next", () => {
    const onFieldWithUs: NexusEventStatusPayload = {
      matches: [
        match({
          label: "Qualification 4",
          status: "On field",
          redTeams: ["5806", "222", "333"],
        }),
        match({ label: "Qualification 5", status: "On deck" }),
      ],
    };

    expect(selectQueueStatus(onFieldWithUs, "5806").ourNext).toBeNull();
  });

  it("caps the upcoming list and excludes the on-field match", () => {
    const status = selectQueueStatus(payload, "5806", 3);

    expect(status.upcoming.map((m) => m.label)).toEqual([
      "Qualification 11",
      "Qualification 12",
      "Qualification 13",
    ]);
  });

  it("returns everything upcoming when no match has taken the field", () => {
    const status = selectQueueStatus(
      { matches: [match({ label: "Practice 1" })] },
      "",
    );

    expect(status.onField).toBeNull();
    expect(status.ourNext).toBeNull();
    expect(status.upcoming.map((m) => m.label)).toEqual(["Practice 1"]);
  });

  it("handles an event with no schedule posted yet", () => {
    const status = selectQueueStatus({}, "5806");

    expect(status).toEqual({
      eventKey: "",
      dataAsOfTime: 0,
      nowQueuing: null,
      onField: null,
      ourNext: null,
      upcoming: [],
    });
  });
});

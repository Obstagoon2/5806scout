import { describe, expect, it } from "vitest";
import { confirmDoneFields, normalizeStatus, userSideUid } from "./talkie";

const base = {
  status: "assigned" as const,
  assigneeUid: "scout-1",
  createdByUid: "creator-1",
  doneByAdmin: false,
  doneByUser: false,
};

describe("userSideUid", () => {
  it("is the assignee, falling back to the creator when unassigned", () => {
    expect(userSideUid(base)).toBe("scout-1");
    expect(userSideUid({ ...base, assigneeUid: null })).toBe("creator-1");
  });
});

describe("confirmDoneFields", () => {
  it("records the admin sign-off without moving to done", () => {
    expect(confirmDoneFields(base, "admin-1", true)).toEqual({
      doneByAdmin: true,
      doneByUser: false,
      status: "assigned",
    });
  });

  it("records the assignee sign-off without moving to done", () => {
    expect(confirmDoneFields(base, "scout-1", false)).toEqual({
      doneByAdmin: false,
      doneByUser: true,
      status: "assigned",
    });
  });

  it("moves to done only once both sides have signed off", () => {
    expect(
      confirmDoneFields({ ...base, doneByAdmin: true }, "scout-1", false),
    ).toEqual({ doneByAdmin: true, doneByUser: true, status: "done" });
    expect(
      confirmDoneFields({ ...base, doneByUser: true }, "admin-1", true),
    ).toEqual({ doneByAdmin: true, doneByUser: true, status: "done" });
  });

  it("lets a self-assigned admin complete in one click (no deadlock)", () => {
    expect(
      confirmDoneFields({ ...base, assigneeUid: "admin-1" }, "admin-1", true),
    ).toEqual({ doneByAdmin: true, doneByUser: true, status: "done" });
  });

  it("returns null when the user has nothing left to confirm", () => {
    // Unrelated scout — neither admin nor the user side.
    expect(confirmDoneFields(base, "scout-2", false)).toBeNull();
    // Already gave their sign-off.
    expect(
      confirmDoneFields({ ...base, doneByUser: true }, "scout-1", false),
    ).toBeNull();
    // Already done.
    expect(
      confirmDoneFields({ ...base, status: "done" }, "admin-1", true),
    ).toBeNull();
  });
});

describe("normalizeStatus", () => {
  it("maps the legacy in-progress status and unknown values", () => {
    expect(normalizeStatus("in-progress")).toBe("assigned");
    expect(normalizeStatus("done")).toBe("done");
    expect(normalizeStatus("bogus")).toBe("open");
  });
});

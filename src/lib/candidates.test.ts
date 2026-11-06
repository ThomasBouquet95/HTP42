import { describe, expect, it } from "vitest";
import { CANDIDATE_STATUSES, candidateMemberCreateFields, parseCandidateNotes } from "./airtable";

describe("candidate pipeline", () => {
  it("has the four ATS statuses in board order", () => {
    expect(CANDIDATE_STATUSES).toEqual([
      "To Contact",
      "In Discussion",
      "Onboarded",
      "Rejected",
    ]);
  });
});

describe("onboard mapping (no data re-entry)", () => {
  const base = {
    fullName: "  Dana Example  ",
    email: "  dana@example.com ",
    phone: "+33 1 23 45 67 89",
    country: "France",
    expertise: "Clinical data management, SDTM/ADaM",
  };

  it("carries every captured field onto the new member", () => {
    const f = candidateMemberCreateFields(base);
    expect(f.fullName).toBe("Dana Example"); // trimmed
    expect(f.email).toBe("dana@example.com"); // trimmed
    expect(f.phone).toBe("+33 1 23 45 67 89");
    expect(f.country).toBe("France");
    // Expertise becomes the member's profile introduction.
    expect(f.introduction).toBe("Clinical data management, SDTM/ADaM");
    // New members start Active at the Guest tier.
    expect(f.status).toBe("Active");
    expect(f.networkLevel).toBe("Guest");
  });

  it("leaves optional fields undefined when the candidate didn't fill them", () => {
    const f = candidateMemberCreateFields({
      fullName: "Sam Lead",
      email: "sam@example.com",
      phone: "",
      country: "",
      expertise: "",
    });
    expect(f.phone).toBeUndefined();
    expect(f.country).toBeUndefined();
    expect(f.introduction).toBeUndefined();
  });
});

describe("candidate notes parsing", () => {
  it("parses a JSON array of dated notes", () => {
    const raw = JSON.stringify([
      { id: "a", text: "Second call went well", at: "2026-11-05T10:00:00.000Z" },
      { id: "b", text: "Intro email sent", at: "2026-11-01T09:00:00.000Z" },
    ]);
    const notes = parseCandidateNotes(raw);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({ id: "a", text: "Second call went well" });
    expect(notes[1].at).toBe("2026-11-01T09:00:00.000Z");
  });

  it("treats legacy plain text as a single undated note", () => {
    const notes = parseCandidateNotes("Met at a conference, strong profile");
    expect(notes).toEqual([{ id: "legacy", text: "Met at a conference, strong profile", at: null }]);
  });

  it("returns an empty list for blank input", () => {
    expect(parseCandidateNotes("")).toEqual([]);
    expect(parseCandidateNotes("   ")).toEqual([]);
  });

  it("drops malformed entries but keeps valid ones", () => {
    const raw = JSON.stringify([{ text: "ok" }, { nope: 1 }, { text: "   " }]);
    const notes = parseCandidateNotes(raw);
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toBe("ok");
  });
});

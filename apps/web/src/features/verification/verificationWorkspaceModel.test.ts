import { describe, expect, it } from "vitest";
import {
  buildVerificationObjects,
  getVerificationObjectStatus,
  selectVerificationObject,
  summarizeVerificationObjects,
  type VerificationObject,
} from "./verificationWorkspaceModel";

const ready: VerificationObject = {
  signal: {
    id: "s1",
    match: "Norway vs England",
    evidence: { fixtureId: "10", scoresContext: { sequence: 8 } },
  },
  source: "Live monitor",
};

const noSequence: VerificationObject = {
  signal: { id: "s2", match: "France vs Spain" },
  source: "TxLINE replay audit",
  proofHash: "abc123",
};

describe("verification workspace model", () => {
  it("derives readiness only from explicit evidence", () => {
    expect(getVerificationObjectStatus(ready, {})).toMatchObject({
      kind: "ready",
      label: "Ready to verify",
    });
    expect(getVerificationObjectStatus(noSequence, {})).toMatchObject({
      kind: "no_sequence",
      label: "No sequence",
    });
    expect(
      getVerificationObjectStatus(ready, {
        "10-8": { loading: false, data: { available: true, isValid: true } },
      })
    ).toMatchObject({ kind: "verified", label: "Verified" });
  });

  it("distinguishes checking, failed, and unavailable validation", () => {
    expect(
      getVerificationObjectStatus(ready, {
        "10-8": { loading: true, data: null },
      }).kind
    ).toBe("checking");
    expect(
      getVerificationObjectStatus(ready, {
        "10-8": { loading: false, data: { available: true, isValid: false } },
      }).kind
    ).toBe("failed");
    expect(
      getVerificationObjectStatus(ready, {
        "10-8": { loading: false, data: { available: false, reason: "Proof not published" } },
      })
    ).toMatchObject({ kind: "unavailable", reason: "Proof not published" });
  });

  it("summarizes eligible, fingerprinted, and verified objects", () => {
    expect(
      summarizeVerificationObjects([ready, noSequence], {
        "10-8": { loading: false, data: { available: true, isValid: true } },
      })
    ).toEqual({ total: 2, eligible: 1, fingerprints: 1, verified: 1 });
  });

  it("uses the selected object or defaults to the first object", () => {
    expect(selectVerificationObject([ready, noSequence], null)).toBe(ready);
    expect(selectVerificationObject([ready, noSequence], noSequence.signal)).toBe(noSequence);
  });

  it("keeps an explicitly selected signal inspectable when it is outside the queue", () => {
    const selected = { id: "older", match: "Older selected signal" };

    expect(selectVerificationObject([ready], selected)).toEqual({
      signal: selected,
      source: "Selected signal",
    });
  });

  it("surfaces an eligible signal before newer signals without a sequence", () => {
    const newest = { id: "newest", match: "Newest without sequence" };
    const eligible = {
      id: "eligible",
      match: "Eligible",
      evidence: { fixtureId: "10", scoresContext: { sequence: 8 } },
    };

    expect(
      buildVerificationObjects([newest, eligible], null).map(({ signal }) => signal.id)
    ).toEqual(["eligible", "newest"]);
  });

  it("prefers a fingerprinted replay copy when signal IDs overlap", () => {
    const live = [
      { id: "shared", match: "Live copy" },
      { id: "plain", match: "Plain" },
    ];
    const originalOrder = live.map(({ id }) => id);
    const result = buildVerificationObjects(live, {
      signals: [{ id: "shared", match: "Replay copy" }],
      proof: { hash: "proof-hash" },
    });

    expect(result.map(({ signal }) => signal.id)).toEqual(["shared", "plain"]);
    expect(result[0]).toMatchObject({
      source: "TxLINE replay audit",
      proofHash: "proof-hash",
    });
    expect(live.map(({ id }) => id)).toEqual(originalOrder);
  });

  it("caps the dense queue at five objects", () => {
    const many = Array.from({ length: 7 }, (_, index) => ({ id: `s${index}` }));

    expect(buildVerificationObjects(many, null)).toHaveLength(5);
  });
});

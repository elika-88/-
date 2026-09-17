import { describe, expect, it } from "vitest";
import { createSession, emptyHistory, parseHistory, serializeHistory, STORAGE_KEY, type SessionHistory } from "@/lib/client/sessions";
import { INPUT_LIMITS } from "@/lib/input";
import { studyKitFixture } from "./fixtures/studyKit";

function historyFixture(): SessionHistory {
  const kit = studyKitFixture();
  const session = {
    ...createSession(),
    title: kit.lectureTitle,
    lecture: kit.source.text,
    outputLanguage: "en" as const,
    tab: "flashcards" as const,
    kit,
  };
  return { version: 1, activeId: session.id, sessions: [session] };
}

describe("lecture history", () => {
  it("retains manual titles and reads records created before that flag existed", () => {
    const history = historyFixture();
    history.sessions[0].title = "My chosen title";
    history.sessions[0].customTitle = true;
    expect(parseHistory(serializeHistory(history)).sessions[0].customTitle).toBe(true);
    const legacy = JSON.parse(serializeHistory(history));
    delete legacy.sessions[0].customTitle;
    expect(parseHistory(JSON.stringify(legacy)).sessions[0].customTitle).toBe(false);
  });
  it("roundtrips all materials and the current lecture", () => {
    const history = historyFixture();
    expect(parseHistory(serializeHistory(history))).toEqual(history);
    expect(STORAGE_KEY).toBe("lumina.sessions.v1");
  });

  it("creates independent empty histories and blank drafts", () => {
    expect(parseHistory(null)).toEqual(emptyHistory());
    expect(parseHistory(serializeHistory(emptyHistory()))).toEqual(emptyHistory());
    const session = createSession();
    expect(session).toMatchObject({ title: "", lecture: "", outputLanguage: "auto", tab: "summary", kit: null });
    expect(session.id).not.toBe(createSession().id);
    expect(session.updatedAt).toBeLessThanOrEqual(Date.now());
    const history: SessionHistory = { version: 1, activeId: null, sessions: [session] };
    expect(parseHistory(serializeHistory(history))).toEqual(history);
  });

  it.each(["", "{", "null", "[]", '{"version":2,"activeId":null,"sessions":[]}', '{"version":1,"activeId":null}'])(
    "rejects corrupt history %s",
    (raw) => expect(() => parseHistory(raw)).toThrow(),
  );

  it("rejects malformed sessions and duplicate IDs without silently dropping records", () => {
    const history = historyFixture();
    for (const patch of [
      { id: "" },
      { title: "x".repeat(INPUT_LIMITS.maxTitleCharacters + 1) },
      { lecture: "x".repeat(INPUT_LIMITS.maxCharacters + 1) },
      { outputLanguage: "unsupported" },
      { tab: "unknown" },
      { updatedAt: null },
      { updatedAt: -1 },
    ]) {
      expect(() => parseHistory(JSON.stringify({ ...history, sessions: [{ ...history.sessions[0], ...patch }] }))).toThrow();
    }
    expect(() => parseHistory(JSON.stringify({ ...history, sessions: [history.sessions[0], history.sessions[0]] }))).toThrow();
    expect(() => serializeHistory({ ...history, sessions: [{ ...history.sessions[0], updatedAt: Infinity }] })).toThrow();
  });

  it("discards invalid optional materials while retaining the lecture draft", () => {
    const history = historyFixture();
    for (const kit of [undefined, null, {}, { ...studyKitFixture(), quiz: [] }]) {
      const parsed = parseHistory(JSON.stringify({ ...history, sessions: [{ ...history.sessions[0], kit }] }));
      expect(parsed.sessions[0]).toEqual({ ...history.sessions[0], kit: null });
    }
  });

  it("retains the last successful materials after a draft edit", () => {
    const history = historyFixture();
    history.sessions[0].lecture = "The lecture draft has been edited since generation.";
    expect(parseHistory(serializeHistory(history))).toEqual(history);
  });

  it("clears a missing active ID and preserves every stored session", () => {
    const history: SessionHistory = {
      version: 1,
      activeId: "missing",
      sessions: Array.from({ length: 125 }, () => createSession()),
    };
    const parsed = parseHistory(serializeHistory(history));
    expect(parsed.activeId).toBeNull();
    expect(parsed.sessions).toEqual(history.sessions);
  });

  it("never serializes injected connection settings or unknown fields", () => {
    const history = historyFixture();
    const injected = {
      ...history,
      apiKey: "top-level-secret",
      provider: { apiKey: "provider-secret" },
      sessions: [{ ...history.sessions[0], apiKey: "session-secret", provider: { apiKey: "nested-secret" }, unknown: "private-value" }],
    };
    const serialized = serializeHistory(injected);
    expect(parseHistory(serialized)).toEqual(history);
    for (const value of ["apiKey", "provider", "unknown", "secret", "private-value"]) {
      expect(serialized).not.toContain(value);
    }
    expect(parseHistory(JSON.stringify(injected))).toEqual(history);
  });

  it("does not persist unexpected fields injected into materials", () => {
    const history = historyFixture();
    const kit = { ...studyKitFixture(), apiKey: "material-secret" };
    const serialized = serializeHistory({ ...history, sessions: [{ ...history.sessions[0], kit }] });
    expect(serialized).not.toContain("material-secret");
    expect(parseHistory(serialized).sessions[0].kit).toBeNull();
    const nested = studyKitFixture();
    Object.assign(nested.source.segments[0], { provider: { apiKey: "deep-secret" } });
    const nestedSerialized = serializeHistory({ ...history, sessions: [{ ...history.sessions[0], kit: nested }] });
    expect(nestedSerialized).not.toContain("deep-secret");
    expect(parseHistory(nestedSerialized).sessions[0].kit).toBeNull();
  });
});

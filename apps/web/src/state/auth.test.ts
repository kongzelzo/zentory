import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession } from "@zentory/shared";

const storage = new Map<string, string>();
const storageKey = "zentory.session.v1";
const now = new Date("2026-06-17T08:00:00.000Z");

const session: AuthSession = {
  accessToken: "access",
  refreshToken: "refresh",
  user: { id: "user_1", name: "Owner", email: "owner@example.com", isSystemAdmin: false }
};

async function loadAuthModule() {
  vi.resetModules();
  return import("./auth");
}

beforeEach(() => {
  storage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    removeItem: vi.fn((key: string) => storage.delete(key)),
    setItem: vi.fn((key: string, value: string) => storage.set(key, value))
  });
});

describe("useAuth session inactivity timeout", () => {
  it("drops legacy sessions without activity metadata", async () => {
    storage.set(storageKey, JSON.stringify(session));

    const { useAuth } = await loadAuthModule();

    expect(useAuth.getState().session).toBeUndefined();
    expect(storage.has(storageKey)).toBe(false);
  });

  it("loads active stored sessions", async () => {
    storage.set(storageKey, JSON.stringify({ session, lastActivityAt: Date.now() }));

    const { useAuth } = await loadAuthModule();

    expect(useAuth.getState().session).toEqual(session);
  });

  it("clears stored sessions after two hours of inactivity", async () => {
    storage.set(storageKey, JSON.stringify({ session, lastActivityAt: Date.now() - 2 * 60 * 60 * 1000 - 1 }));

    const { useAuth } = await loadAuthModule();

    expect(useAuth.getState().session).toBeUndefined();
    expect(storage.has(storageKey)).toBe(false);
  });

  it("refreshes activity when a signed-in session is touched", async () => {
    const { useAuth } = await loadAuthModule();
    useAuth.getState().setSession(session);
    vi.setSystemTime(new Date(now.getTime() + 30 * 60 * 1000));

    useAuth.getState().touchSession();

    expect(JSON.parse(storage.get(storageKey) ?? "{}")).toMatchObject({
      session,
      lastActivityAt: Date.now()
    });
  });
});

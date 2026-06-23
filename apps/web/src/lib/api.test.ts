import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession } from "@zentory/shared";

const sessionKey = "zentory.session.v1";

function stubStorage(session?: AuthSession) {
  const store = new Map<string, string>();
  if (session) store.set(sessionKey, JSON.stringify({ session, lastActivityAt: Date.now() }));
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => store.set(key, value)),
    removeItem: vi.fn((key: string) => store.delete(key)),
    clear: vi.fn(() => store.clear())
  });
}

async function loadApiWithSession(session?: AuthSession) {
  vi.resetModules();
  stubStorage(session);
  return import("./api");
}

describe("api local demo routing", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("routes demo sessions directly to localDemo without calling fetch", async () => {
    const { createDemoSession, startLocalDemo } = await import("./local-demo");
    const session = createDemoSession();
    stubStorage(session);
    startLocalDemo();
    vi.resetModules();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { api } = await import("./api");

    const business = await api<{ name: string }>("/businesses/current");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(business.name).toBe("ร้านตัวอย่าง Zentory");
  });

  it("keeps non-demo sessions on the real fetch path", async () => {
    const { api } = await loadApiWithSession({
      accessToken: "real-access",
      refreshToken: "real-refresh",
      user: { id: "user_1", name: "Owner", email: "owner@example.com", isSystemAdmin: false }
    });
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true })
    });
    vi.stubGlobal("fetch", fetchSpy);

    await api<{ ok: boolean }>("/businesses/current");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/businesses/current");
  });
});

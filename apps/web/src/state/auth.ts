import { create } from "zustand";
import type { AuthSession } from "@zentory/shared";

const key = "zentory.session.v1";
export const sessionInactivityTimeoutMs = 2 * 60 * 60 * 1000;

type StoredSession = {
  session: AuthSession;
  lastActivityAt: number;
};

type AuthState = {
  session?: AuthSession;
  setSession: (session: AuthSession) => void;
  touchSession: () => void;
  ensureActiveSession: () => AuthSession | undefined;
  updateBusinessOnboarding: (next: { completed: boolean; progress: Record<string, boolean> }) => void;
  clear: () => void;
};

function isStoredSession(value: unknown): value is StoredSession {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<StoredSession>;
  return Boolean(input.session?.accessToken && input.session.refreshToken && typeof input.lastActivityAt === "number");
}

function isExpired(lastActivityAt: number, now = Date.now()) {
  return now - lastActivityAt > sessionInactivityTimeoutMs;
}

function saveSession(session: AuthSession, lastActivityAt = Date.now()) {
  localStorage.setItem(key, JSON.stringify({ session, lastActivityAt } satisfies StoredSession));
}

function loadSession() {
  const raw = localStorage.getItem(key);
  if (!raw) return undefined;
  try {
    const stored = JSON.parse(raw) as unknown;
    if (!isStoredSession(stored) || isExpired(stored.lastActivityAt)) {
      localStorage.removeItem(key);
      return undefined;
    }
    return stored.session;
  } catch {
    localStorage.removeItem(key);
    return undefined;
  }
}

export const useAuth = create<AuthState>((set) => ({
  session: loadSession(),
  setSession: (session) => {
    saveSession(session);
    set({ session });
  },
  touchSession: () => {
    set((state) => {
      if (!state.session) return state;
      saveSession(state.session);
      return state;
    });
  },
  ensureActiveSession: () => {
    const raw = localStorage.getItem(key);
    if (!raw) {
      set({ session: undefined });
      return undefined;
    }

    try {
      const stored = JSON.parse(raw) as unknown;
      if (!isStoredSession(stored) || isExpired(stored.lastActivityAt)) {
        localStorage.removeItem(key);
        set({ session: undefined });
        return undefined;
      }
      return stored.session;
    } catch {
      localStorage.removeItem(key);
      set({ session: undefined });
      return undefined;
    }
  },
  updateBusinessOnboarding: (next) => {
    set((state) => {
      if (!state.session?.business) return state;
      const session: AuthSession = {
        ...state.session,
        business: {
          ...state.session.business,
          onboardingCompleted: next.completed,
          onboardingProgress: next.progress
        }
      };
      saveSession(session);
      return { session };
    });
  },
  clear: () => {
    localStorage.removeItem(key);
    set({ session: undefined });
  }
}));

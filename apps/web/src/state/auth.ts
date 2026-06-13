import { create } from "zustand";
import type { AuthSession } from "@zentory/shared";

const key = "zentory.session.v1";

type AuthState = {
  session?: AuthSession;
  setSession: (session: AuthSession) => void;
  updateBusinessOnboarding: (next: { completed: boolean; progress: Record<string, boolean> }) => void;
  clear: () => void;
};

function loadSession() {
  const raw = localStorage.getItem(key);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    localStorage.removeItem(key);
    return undefined;
  }
}

export const useAuth = create<AuthState>((set) => ({
  session: loadSession(),
  setSession: (session) => {
    localStorage.setItem(key, JSON.stringify(session));
    set({ session });
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
      localStorage.setItem(key, JSON.stringify(session));
      return { session };
    });
  },
  clear: () => {
    localStorage.removeItem(key);
    set({ session: undefined });
  }
}));

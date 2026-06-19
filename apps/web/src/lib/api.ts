import { useAuth } from "../state/auth";
import { localDemo } from "./local-demo";
import type { AuthSession } from "@zentory/shared";

const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api/v1";
const authFallbackBlockedPaths = new Set([
  "/auth/login",
  "/auth/google",
  "/auth/register",
  "/auth/refresh",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/businesses"
]);
const realDataFallbackBlockedPrefixes = [
  "/reports",
  "/sales",
  "/inventory",
  "/notifications",
  "/payments"
];

function shouldBlockLocalDemoFallback(path: string) {
  const pathname = new URL(path, "http://local-api").pathname;
  const token = useAuth.getState().session?.accessToken;
  const isLocalDemoSession = token === "local-demo-access";
  return authFallbackBlockedPaths.has(pathname) || (!isLocalDemoSession && realDataFallbackBlockedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)));
}

async function request(path: string, init: RequestInit, token?: string) {
  const isFormData = init.body instanceof FormData;
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers
    }
  });
}

async function refreshSession() {
  const session = useAuth.getState().ensureActiveSession();
  if (!session?.refreshToken) return undefined;

  const response = await request("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken: session.refreshToken })
  });
  if (!response.ok) return undefined;

  const nextSession = (await response.json()) as AuthSession;
  useAuth.getState().setSession(nextSession);
  return nextSession;
}

export async function api<T>(path: string, init: RequestInit = {}) {
  const token = useAuth.getState().ensureActiveSession()?.accessToken;
  let response: Response;
  try {
    response = await request(path, init, token);
    if (response.status === 401 && path !== "/auth/refresh") {
      const nextSession = await refreshSession();
      if (nextSession) response = await request(path, init, nextSession.accessToken);
      else useAuth.getState().clear();
    }
  } catch (error) {
    if (error instanceof TypeError) {
      if (shouldBlockLocalDemoFallback(path)) {
        throw new Error("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาตรวจสอบว่า API กำลังทำงานอยู่");
      }
      return localDemo<T>(path, init);
    }
    throw error;
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(Array.isArray(error.message) ? error.message.join(", ") : error.message ?? "Request failed");
  }
  useAuth.getState().touchSession();
  return response.json() as Promise<T>;
}

export async function downloadApi(path: string) {
  const token = useAuth.getState().ensureActiveSession()?.accessToken;
  let response: Response;
  try {
    response = await request(path, { method: "GET" }, token);
  } catch (error) {
    if (error instanceof TypeError) {
      const content = await localDemo<string>(path, { method: "GET" });
      return new Blob([content], { type: "text/csv;charset=utf-8" });
    }
    throw error;
  }
  if (response.status === 401 && path !== "/auth/refresh") {
    const nextSession = await refreshSession();
    if (nextSession) response = await request(path, { method: "GET" }, nextSession.accessToken);
    else useAuth.getState().clear();
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(Array.isArray(error.message) ? error.message.join(", ") : error.message ?? "Download failed");
  }
  useAuth.getState().touchSession();
  return response.blob();
}

export function post<T>(path: string, body: unknown) {
  return api<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function patch<T>(path: string, body: unknown) {
  return api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export function del<T>(path: string) {
  return api<T>(path, { method: "DELETE" });
}

export function uploadProductImage<T>(productId: string, file: File) {
  const form = new FormData();
  form.append("image", file);
  return api<T>(`/products/${productId}/image`, { method: "POST", body: form });
}

export function deleteProductImage<T>(productId: string) {
  return api<T>(`/products/${productId}/image`, { method: "DELETE" });
}

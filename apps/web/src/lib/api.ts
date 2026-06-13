import { useAuth } from "../state/auth";
import { localDemo } from "./local-demo";

const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api/v1";

export async function api<T>(path: string, init: RequestInit = {}) {
  const token = useAuth.getState().session?.accessToken;
  const isFormData = init.body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers
      }
    });
  } catch (error) {
    if (error instanceof TypeError) {
      return localDemo<T>(path, init);
    }
    throw error;
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(Array.isArray(error.message) ? error.message.join(", ") : error.message ?? "Request failed");
  }
  return response.json() as Promise<T>;
}

export function post<T>(path: string, body: unknown) {
  return api<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function patch<T>(path: string, body: unknown) {
  return api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export function uploadProductImage<T>(productId: string, file: File) {
  const form = new FormData();
  form.append("image", file);
  return api<T>(`/products/${productId}/image`, { method: "POST", body: form });
}

export function deleteProductImage<T>(productId: string) {
  return api<T>(`/products/${productId}/image`, { method: "DELETE" });
}

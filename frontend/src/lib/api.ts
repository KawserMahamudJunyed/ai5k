// API client for the AI5K backend (FastAPI).
// Base URL comes from NEXT_PUBLIC_API_BASE_URL (defaults to the local backend).
// See backend/docs/FRONTEND-GUIDE.md for the API contract.

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

const ACCESS_TOKEN_KEY = "ai5k_token";
const REFRESH_TOKEN_KEY = "ai5k_refresh_token";

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(status: number, code: string, message: string, details: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAuthTokens(accessToken: string, refreshToken?: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearAuthTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken =
    typeof window !== "undefined" ? localStorage.getItem(REFRESH_TOKEN_KEY) : null;
  if (!refreshToken) return null;

  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.access_token) return null;
  localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
  return data.access_token;
}

async function parseError(res: Response): Promise<ApiError> {
  // Backend error envelope: { error: { code, message, details } }
  let code = "unknown_error";
  let message = `Request failed (${res.status})`;
  let details: unknown = null;
  try {
    const body = await res.json();
    if (body?.error?.code) code = body.error.code;
    if (body?.error?.message) message = body.error.message;
    if (body?.error?.details) details = body.error.details;
    // Pydantic 422 validation errors carry field info in details.
    if (res.status === 422 && Array.isArray(details) && details.length > 0) {
      const first = details[0];
      const field = Array.isArray(first.loc) ? first.loc.join(".") : "input";
      message = `${field}: ${first.msg ?? "invalid value"}`;
    }
  } catch {
    // non-JSON body — keep defaults
  }
  return new ApiError(res.status, code, message, details);
}

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers || {});
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let res = await fetch(`${API_BASE}${url}`, { ...options, headers });

  if (res.status === 401) {
    // One-time refresh-and-retry; on failure clear tokens and return to login.
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.set("Authorization", `Bearer ${newToken}`);
      res = await fetch(`${API_BASE}${url}`, { ...options, headers });
    } else {
      clearAuthTokens();
      if (typeof window !== "undefined") window.location.href = "/login";
      throw new ApiError(401, "session_expired", "Your session expired. Please log in again.");
    }
  }

  if (!res.ok) throw await parseError(res);
  return res;
}

// Raw fetch without auth (signup, login, verify-email) — still parses the
// backend error envelope so pages can branch on error codes.
export async function fetchApi(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  if (!res.ok) throw await parseError(res);
  return res;
}

// Post-login destination (flow fix): a returning user with a profile goes to
// /profile/me; a new user without one goes to onboarding. Keeps ?next= working
// for guard redirects.

import { getAccessToken } from "./api";
import { getMyProfile } from "./api-helpers";

export async function resolvePostLoginPath(): Promise<string> {
  try {
    await getMyProfile();
    return "/profile/me";
  } catch {
    // 404 profile_not_found (or any failure) → onboarding is the safe default
    return "/onboarding/profile";
  }
}

export function sanitizeNextPath(next: string | null): string | null {
  if (!next) return null;
  return next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export function hasToken(): boolean {
  return Boolean(getAccessToken());
}

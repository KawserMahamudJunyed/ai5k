// Smart post-login routing. ?next= wins → else profile exists → /dashboard
// (onboarding still reachable from the dashboard checklist), else onboarding.

import { ApiError } from "./api";
import { getMyProfile } from "./api-helpers";

export async function resolvePostLoginRoute(): Promise<string> {
  const next = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : null;
  if (next && next.startsWith("/")) return next;

  try {
    await getMyProfile();
    return "/dashboard";
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return "/onboarding/profile";
    // On unexpected errors, land somewhere safe.
    return "/dashboard";
  }
}

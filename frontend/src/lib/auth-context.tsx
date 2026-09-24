"use client";

// Session bootstrap + RBAC hook + route guard. ApplicationFlow.md §3, §8.
// Resolves the logged-in user via GET /auth/me; guards redirect anonymous
// users to /login preserving the return path.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { ApiError, clearAuthTokens, getAccessToken } from "./api";
import { getMe, type MeResponse, type UserRead } from "./api-helpers";

interface AuthState {
  user: UserRead | null;
  roles: MeResponse["roles"];
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    user: UserRead | null;
    roles: MeResponse["roles"];
    loading: boolean;
  }>({ user: null, roles: [], loading: true });
  const router = useRouter();

  const refresh = useCallback(async () => {
    if (typeof window === "undefined" || !getAccessToken()) {
      setState({ user: null, roles: [], loading: false });
      return;
    }
    try {
      const me = await getMe();
      setState({ user: me.user, roles: me.roles, loading: false });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) clearAuthTokens();
      setState({ user: null, roles: [], loading: false });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(() => {
    clearAuthTokens();
    setState({ user: null, roles: [], loading: false });
    router.push("/login");
  }, [router]);

  const value = useMemo(() => ({ ...state, refresh, logout }), [state, refresh, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function usePermissions() {
  const { roles } = useAuth();
  return useMemo(
    () => ({
      roles,
      hasRole: (name: string, organizationId?: string | null) =>
        roles.some(
          (r) =>
            r.name === name &&
            (organizationId === undefined ? true : r.organization_id === organizationId),
        ),
      isPlatformAdmin: roles.some((r) => r.name === "platform_admin"),
    }),
    [roles],
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, refresh } = useAuth();
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  const tokenPresent = typeof window !== "undefined" && Boolean(getAccessToken());

  useEffect(() => {
    if (!loading && !user && tokenPresent) {
      // Stale context (login happened in this SPA session): re-resolve.
      setChecking(true);
      void refresh().finally(() => setChecking(false));
    }
  }, [loading, user, tokenPresent, refresh]);

  useEffect(() => {
    if (!loading && !user && !tokenPresent && !checking) {
      const here = window.location.pathname + window.location.search;
      router.push(`/login?next=${encodeURIComponent(here)}`);
    }
  }, [loading, user, tokenPresent, checking, router]);

  if (loading || checking || (tokenPresent && !user)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="w-10 h-10 rounded-full border-2 border-hairline border-t-ink animate-spin" />
      </main>
    );
  }
  if (!user) return null; // redirect in flight
  return <>{children}</>;
}

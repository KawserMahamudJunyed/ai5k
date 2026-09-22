"use client";

// AppShell = RequireAuth guard + AppHeader nav. Use it on every authed page
// instead of nesting guard + header separately.

import type { ReactNode } from "react";
import { RequireAuth } from "@/lib/auth-context";
import AppHeader from "./AppHeader";

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AppHeader />
      {children}
    </RequireAuth>
  );
}

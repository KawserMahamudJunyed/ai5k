"use client";

// AppShell = RequireAuth guard + AppHeader. Wrap every authed page.

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

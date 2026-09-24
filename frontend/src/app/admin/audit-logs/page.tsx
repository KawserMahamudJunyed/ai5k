"use client";

// Audit logs — UF-9c. API is live (audit:read); full table UX pending.

import AppShell from "@/components/layout/AppShell";
import { MonoLabel, PageHeader } from "@/components/ui/Bits";

export default function AuditLogsPage() {
  return (
    <AppShell>
      <main className="max-w-shell mx-auto px-6 py-12">
        <PageHeader eyebrow="Platform" title="Audit logs"
          lede="Every privileged action with actor, entity, IP address, and request id." />
        <div className="border-t border-hairline pt-8">
          <MonoLabel>GET /audit-logs · requires audit:read permission</MonoLabel>
          <p className="text-sm text-muted mt-4 max-w-xl">
            The audit table ships with the admin polish pass. Every mutation you perform in this app is
            already being recorded server-side.
          </p>
        </div>
      </main>
    </AppShell>
  );
}

"use client";

// Roles admin — UF-9b. The grant/revoke API is live (rbac:manage) but the
// admin user-picker UX needs product design; honest placeholder for now.

import AppShell from "@/components/layout/AppShell";
import { Chip, PageHeader } from "@/components/ui/Bits";

export default function AdminRolesPage() {
  return (
    <AppShell>
      <main className="max-w-text mx-auto px-6 py-12">
        <PageHeader eyebrow="Platform" title="Roles"
          lede="Grant and revoke platform roles. This surface needs a user-picker before it ships; the API is live." />
        <div className="border border-white/10 rounded-md p-8 bg-void">
          <div className="flex flex-wrap gap-2">
            {["platform_admin", "org_admin", "professional", "reviewer"].map((r) => <Chip key={r}>{r}</Chip>)}
          </div>
          <p className="text-sm text-muted mt-6">
            Endpoints: <code className="font-mono text-xs">GET /roles</code> ·{" "}
            <code className="font-mono text-xs">POST /admin/users/{"{id}"}/roles</code> ·{" "}
            <code className="font-mono text-xs">DELETE /admin/users/{"{id}"}/roles</code>
          </p>
        </div>
      </main>
    </AppShell>
  );
}

"use client";

// Admin index — entry point for the platform-admin surface.

import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/Bits";
import { ButtonLink } from "@/components/ui/Button";

const ADMIN_LINKS = [
  { href: "/admin/verification", title: "Verification queue", body: "Review pending verification requests for skill claims and identity documents." },
  { href: "/admin/roles", title: "Roles", body: "Grant or revoke platform roles. Requires rbac:manage." },
  { href: "/admin/audit-logs", title: "Audit logs", body: "Every privileged action, with actor, entity, IP, and request id. Requires audit:read." },
];

export default function AdminPage() {
  return (
    <AppShell>
      <main className="max-w-shell mx-auto px-6 py-12">
        <PageHeader eyebrow="Platform" title="Admin" lede="Trust & quality operations." />
        <div className="grid md:grid-cols-3 gap-6">
          {ADMIN_LINKS.map((l) => (
            <ButtonLink key={l.href} href={l.href} variant="outline" className="!rounded-md h-auto flex-col items-start gap-2 p-6 text-left">
              <span className="text-feature-heading font-display text-white">{l.title}</span>
              <span className="text-sm text-muted font-normal">{l.body}</span>
            </ButtonLink>
          ))}
        </div>
      </main>
    </AppShell>
  );
}

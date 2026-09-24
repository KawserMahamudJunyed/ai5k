"use client";

// Tab nav shared by org sub-pages (Overview / Members / Skills).
// Static segment (/organizations/invitations) wins over [id] in Next routing.

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { segment: "", label: "Overview" },
  { segment: "members", label: "Members" },
  { segment: "skills", label: "Skills" },
];

export default function OrgTabNav({ orgId }: { orgId: string }) {
  const pathname = usePathname();
  const base = `/organizations/${orgId}`;

  return (
    <div className="flex gap-1 border-b border-hairline mb-8" role="tablist" aria-label="Organization sections">
      {TABS.map((tab) => {
        const href = tab.segment ? `${base}/${tab.segment}` : base;
        const active = tab.segment ? pathname.startsWith(`${base}/${tab.segment}`) : pathname === base;
        return (
          <Link key={tab.segment || "overview"} href={href} aria-current={active ? "page" : undefined}
            className={`px-4 py-2.5 text-sm -mb-px border-b-2 transition-colors ${
              active ? "text-ink border-ink font-medium" : "text-muted border-transparent hover:text-ink"
            }`}>
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

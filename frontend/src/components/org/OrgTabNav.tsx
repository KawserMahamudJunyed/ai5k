"use client";

// Tab nav shared by the org sub-pages. Static segment wins over [id] in
// Next.js routing, so /organizations/invitations stays reachable.

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
    <div className="flex gap-1 border-b border-white/10 mb-8" role="tablist" aria-label="Organization sections">
      {TABS.map((tab) => {
        const href = tab.segment ? `${base}/${tab.segment}` : base;
        const active = tab.segment
          ? pathname.startsWith(`${base}/${tab.segment}`)
          : pathname === base;
        return (
          <Link
            key={tab.segment || "overview"}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`px-4 py-2.5 text-sm rounded-t-lg -mb-px border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-cyan ${
              active
                ? "text-white border-brand-cyan font-medium"
                : "text-fog border-transparent hover:text-white"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

"use client";

// Navigation shell for authenticated pages. Sits on the existing dark design
// system: quiet bar, one accent state (active link), identity + logout right.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const NAV_LINKS = [
  { href: "/profile/me", label: "Profile" },
  { href: "/profile/me/skills", label: "Skills" },
  { href: "/profile/me/services", label: "Services" },
  { href: "/profile/me/evidence", label: "Evidence" },
  { href: "/organizations", label: "Organizations" },
  { href: "/analyze", label: "Analysis" },
];

export default function AppHeader() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const initials = (user?.full_name ?? "?")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-40 bg-void/80 backdrop-blur-xl border-b border-white/10">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-8">
        <Link href="/profile/me" className="flex items-center gap-3 shrink-0">
          <span className="font-wordmark text-lg text-white tracking-tight">AI5K</span>
        </Link>

        <nav className="flex items-center gap-1 flex-1" aria-label="Main">
          {NAV_LINKS.map((link) => {
            const active =
              link.href === "/profile/me"
                ? pathname === "/profile/me"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`px-3 py-2 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-cyan ${
                  active
                    ? "text-white bg-white/10"
                    : "text-fog hover:text-white hover:bg-white/5"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-4 shrink-0">
          <div
            className="w-9 h-9 rounded-lg bg-gradient-brand p-[1px]"
            title={user?.email ?? ""}
          >
            <div className="w-full h-full rounded-lg bg-surface-elevated flex items-center justify-center">
              <span className="text-xs font-bold text-white">{initials}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="text-sm text-fog hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-cyan rounded"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}

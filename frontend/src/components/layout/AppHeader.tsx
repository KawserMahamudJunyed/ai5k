"use client";

// Authed navigation — Dashboard-first. The five capability sections live in
// the avatar menu (profile settings); Settings is always reachable.
// Built on <details> so it opens on click AND hover without JS state.

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const MAIN_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/analyze", label: "Analysis" },
  { href: "/organizations", label: "Organizations" },
];

const SETTINGS_LINKS = [
  { href: "/profile/me", label: "Profile information" },
  { href: "/profile/me/skills", label: "Skills" },
  { href: "/profile/me/services", label: "Services" },
  { href: "/profile/me/evidence", label: "Evidence" },
  { href: "/settings", label: "Settings" },
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

  const isSettingsArea =
    pathname.startsWith("/profile/me") || pathname.startsWith("/settings");

  return (
    <header className="sticky top-0 z-40 bg-void/95 backdrop-blur border-b border-white/10">
      <div className="max-w-shell mx-auto px-6 h-16 flex items-center gap-8">
        <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
          <Image src="/assets/logo.png" alt="AI5K Logo" width={140} height={40} className="h-8 md:h-10 w-auto object-contain" priority />
        </Link>

        <nav className="hidden md:flex items-center gap-1 flex-1" aria-label="Main">
          {MAIN_LINKS.map((link) => {
            const active =
              link.href === "/dashboard" ? pathname === link.href : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`px-3 py-2 rounded-sm text-sm transition-colors ${
                  active ? "text-white bg-navy" : "text-muted hover:text-white hover:bg-navy/60"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Avatar menu = profile settings */}
        <details className="relative shrink-0 group" data-testid="avatar-menu">
          <summary
            className="list-none cursor-pointer flex items-center gap-3"
            aria-label="Profile settings menu"
          >
            <span className="hidden sm:block text-sm text-muted group-hover:text-white transition-colors">
              {user?.full_name}
            </span>
            <span className="w-9 h-9 rounded-full bg-gradient-brand text-white flex items-center justify-center text-xs font-medium">
              {initials}
            </span>
          </summary>
          <div
            className="absolute right-0 top-full mt-2 w-60 bg-void border border-white/10 rounded-md shadow-sm py-2 z-50"
            onMouseLeave={(e) => (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open")}
          >
            <p className="px-4 pt-1 pb-2 text-micro font-mono uppercase tracking-[0.28px] text-muted">
              Profile settings
            </p>
            {SETTINGS_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={(e) => (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open")}
                className={`block px-4 py-2 text-sm transition-colors ${
                  pathname === l.href ? "text-white bg-navy" : "text-muted hover:text-white hover:bg-navy/60"
                }`}
              >
                {l.label}
              </Link>
            ))}
            <div className="border-t border-white/10 mt-2 pt-2">
              <button
                type="button"
                onClick={logout}
                className="w-full text-left px-4 py-2 text-sm text-error-red hover:bg-navy/60"
              >
                Log out
              </button>
            </div>
          </div>
        </details>
      </div>

      {/* Mobile nav — dashboard first, then the settings sections inline */}
      <nav
        className={`md:hidden flex gap-1 overflow-x-auto px-4 pb-2 ${isSettingsArea ? "" : "border-t border-white/10"}`}
        aria-label="Mobile"
      >
        {[...MAIN_LINKS, ...SETTINGS_LINKS].map((link) => {
          const active =
            link.href === "/dashboard" ? pathname === link.href : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-sm ${
                active ? "bg-near-black text-white" : "text-muted"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}






"use client";

// Public profile (REVIEW.md item 1.3) — real data via GET /profiles/{id}.
// Public profiles are visible to any authed user; private ones only to the
// owner, org members, and platform admins (server-enforced; 403 here).

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { ApiError } from "@/lib/api";
import { getProfile, type ProfileRead } from "@/lib/api-helpers";

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; profile: ProfileRead }
  | { kind: "private" }
  | { kind: "notfound" }
  | { kind: "error"; message: string };

function ProfileView({ profile }: { profile: ProfileRead }) {
  const initials = profile.display_name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div>
      <div className="flex flex-col md:flex-row gap-8 items-start mb-16 pb-16 divider-gradient-bottom">
        <div className="w-24 h-24 rounded-2xl bg-gradient-brand p-[1px] shrink-0">
          <div className="w-full h-full rounded-2xl bg-surface-elevated flex items-center justify-center">
            <span className="font-display text-3xl font-bold text-white">{initials}</span>
          </div>
        </div>
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-white mb-3">
            {profile.display_name}
          </h1>
          {profile.headline && (
            <p className="text-lg text-fog max-w-xl mb-4">{profile.headline}</p>
          )}
          <div className="flex items-center gap-2 text-sm text-fog">
            <MapPin className="w-4 h-4" />
            <span>
              {profile.owner_type === "organization" ? "Organization" : "Individual"} ·{" "}
              {profile.visibility}
            </span>
          </div>
        </div>
      </div>

      {profile.job_roles.length > 0 && (
        <section className="mb-16">
          <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-fog mb-6">
            Roles
          </h2>
          <div className="flex flex-wrap gap-2">
            {profile.job_roles.map((role) => (
              <span
                key={role}
                className="px-3 py-1.5 rounded-full bg-surface-elevated border border-surface-border text-sm text-white"
              >
                {role}
              </span>
            ))}
          </div>
        </section>
      )}

      {profile.portfolio_links.length > 0 && (
        <section className="mb-16">
          <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-fog mb-6">
            Portfolio
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {profile.portfolio_links.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-5 rounded-xl bg-surface-elevated border border-surface-border hover:border-fog/30 transition-colors"
              >
                <p className="text-white font-semibold mb-1">{link.label}</p>
                <p className="text-sm text-fog truncate">{link.url}</p>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function PublicProfilePage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    const id = window.location.pathname.split("/").pop() ?? "";
    getProfile(id)
      .then((profile) => setState({ kind: "loaded", profile }))
      .catch((err) => {
        if (err instanceof ApiError) {
          if (err.code === "profile_not_found") setState({ kind: "notfound" });
          else if (err.code === "permission_denied") setState({ kind: "private" });
          else setState({ kind: "error", message: err.message });
        } else {
          setState({ kind: "error", message: (err as Error).message });
        }
      });
  }, []);

  return (
    <AppShell>
      <div className="pt-16 pb-20">
        <div className="max-w-7xl mx-auto px-6">
          <Link
            href="/profile/me"
            className="inline-flex items-center gap-2 text-sm text-fog hover:text-brand-cyan transition-colors mb-12 focus:outline-none focus:ring-2 focus:ring-brand-cyan rounded"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to my profile
          </Link>

          {state.kind === "loading" && (
            <div className="flex justify-center py-32">
              <div className="w-12 h-12 rounded-full border-4 border-brand-cyan/20 border-t-brand-cyan animate-spin" />
            </div>
          )}
          {state.kind === "notfound" && (
            <div className="max-w-md text-center py-24">
              <h1 className="font-display text-2xl font-bold text-white mb-3">
                Profile not found
              </h1>
              <p className="text-fog">This profile doesn&apos;t exist.</p>
            </div>
          )}
          {state.kind === "private" && (
            <div className="max-w-md text-center py-24">
              <h1 className="font-display text-2xl font-bold text-white mb-3">
                Private profile
              </h1>
              <p className="text-fog">The owner has not made this profile public.</p>
            </div>
          )}
          {state.kind === "error" && (
            <div className="max-w-md text-center py-24">
              <h1 className="font-display text-2xl font-bold text-white mb-3">
                Something went wrong
              </h1>
              <p className="text-red-400">{state.message}</p>
            </div>
          )}
          {state.kind === "loaded" && <ProfileView profile={state.profile} />}
        </div>
      </div>
    </AppShell>
  );
}

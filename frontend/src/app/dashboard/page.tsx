"use client";

// Dashboard — the post-signup/post-login home. Aggregates live data:
// profile, skills, evidence, services, orgs, invitations.
// Next-steps checklist drives the user toward a complete, verified profile.

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { ButtonLink } from "@/components/ui/Button";
import { Chip, MonoLabel, Notice, PageHeader, Spinner } from "@/components/ui/Bits";
import { ApiError } from "@/lib/api";
import {
  describeApiError,
  getMyProfile,
  listEvidence,
  listMyInvitations,
  listMyOrganizations,
  listServices,
  listSkillClaims,
  type EvidenceRead,
  type Invitation,
  type Organization,
  type ProfileRead,
  type Service,
  type SkillClaim,
} from "@/lib/api-helpers";

interface DashboardData {
  profile: ProfileRead | null;
  claims: SkillClaim[];
  evidence: EvidenceRead[];
  services: Service[];
  orgs: Organization[];
  invitations: Invitation[];
}

function Stat({ label, value, sub, href }: { label: string; value: string | number; sub?: string; href: string }) {
  return (
    <Link href={href} className="group border-t-2 border-white/10 pt-4 block">
      <MonoLabel className="block mb-2">{label}</MonoLabel>
      <p className="text-5xl font-display text-white leading-none group-hover:text-brand-cyan transition-colors">{value}</p>
      {sub && <p className="text-sm text-muted mt-2">{sub}</p>}
    </Link>
  );
}

function DashboardInner() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        let profile: ProfileRead | null = null;
        let claims: SkillClaim[] = [];
        let evidence: EvidenceRead[] = [];
        let services: Service[] = [];
        try {
          profile = await getMyProfile();
          [claims, evidence, services] = await Promise.all([
            listSkillClaims(profile.id),
            listEvidence(profile.id),
            listServices(profile.id),
          ]);
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 404)) throw err;
          // no profile yet — everything else still loads
        }
        const [orgs, invitations] = await Promise.all([listMyOrganizations(), listMyInvitations()]);
        setData({ profile, claims, evidence, services, orgs, invitations });
      } catch (err) {
        setError(describeApiError(err));
      }
    })();
  }, []);

  if (error) {
    return (
      <main className="max-w-shell mx-auto px-6 py-12">
        <Notice kind="error">{error}</Notice>
      </main>
    );
  }
  if (!data) {
    return <div className="flex justify-center py-24"><Spinner /></div>;
  }

  const { profile, claims, evidence, services, orgs, invitations } = data;
  const evidenced = claims.filter((c) => c.claim_type === "evidenced").length;
  const pendingEvidence = evidence.filter((e) => e.verification_status === "pending").length;

  // Next steps — ordered; each one points at the fix.
  const steps: { done: boolean; title: string; body: string; href: string; cta: string }[] = [
    !profile && {
      done: false,
      title: "Create your profile",
      body: "Your public capability page — name, headline, links.",
      href: "/onboarding/profile",
      cta: "Create profile",
    },
    !!profile && claims.length === 0 && {
      done: false,
      title: "Claim your skills",
      body: "Add what you can do and set proficiency levels.",
      href: "/profile/me/skills",
      cta: "Claim skills",
    },
    !!profile && claims.length > 0 && evidenced === 0 && {
      done: false,
      title: "Get a skill verified",
      body: "File a verification request on a claimed skill to raise it to evidenced.",
      href: "/profile/me/skills",
      cta: "Get verified",
    },
    !!profile && evidence.length === 0 && {
      done: false,
      title: "Add evidence",
      body: "Links, testimonials, or certificates that back your claims.",
      href: "/profile/me/evidence",
      cta: "Add evidence",
    },
    orgs.length === 0 && invitations.length === 0 && {
      done: false,
      title: "Join or create an organization",
      body: "Agencies aggregate member capability for enterprise buyers.",
      href: "/organizations",
      cta: "Organizations",
    },
  ].filter(Boolean) as { done: boolean; title: string; body: string; href: string; cta: string }[];

  return (
    <main className="max-w-shell mx-auto px-6 py-12">
      <PageHeader
        eyebrow="Dashboard"
        title={`Welcome${profile ? `, ${profile.display_name}` : ""}`}
        lede="Your capability at a glance — build it up, prove it, and pursue global opportunities."
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
        <Stat label="Skills claimed" value={claims.length} sub={evidenced > 0 ? `${evidenced} evidenced` : "none evidenced yet"} href="/profile/me/skills" />
        <Stat label="Evidence" value={evidence.length} sub={pendingEvidence > 0 ? `${pendingEvidence} pending review` : undefined} href="/profile/me/evidence" />
        <Stat label="Services" value={services.length} href="/profile/me/services" />
        <Stat label="Organizations" value={orgs.length} href="/organizations" />
      </div>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <Link href="/organizations/invitations"
          className="block p-4 rounded-sm border border-coral/40 bg-coral/5 hover:bg-coral/10 transition-colors mb-12">
          <span className="text-white font-medium">
            {invitations.length} pending organization invitation{invitations.length > 1 ? "s" : ""}
          </span>
          <span className="text-muted text-sm ml-2">— review and respond →</span>
        </Link>
      )}

      {/* Next steps */}
      <section className="mb-16">
        <MonoLabel className="block mb-4">Next steps</MonoLabel>
        {steps.length === 0 ? (
          <div className="border-t-2 border-white/10 pt-4">
            <p className="text-white font-medium">Profile complete — everything is in place.</p>
            <p className="text-muted text-sm mt-1">
              Keep strengthening your evidence, or run an analysis when the pipeline lands.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-hairline border-t border-white/10">
            {steps.map((s) => (
              <li key={s.title} className="py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-white font-medium">{s.title}</p>
                  <p className="text-sm text-muted mt-0.5">{s.body}</p>
                </div>
                <ButtonLink href={s.href} variant="outline" className="shrink-0">{s.cta}</ButtonLink>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Shortcuts */}
      <section>
        <MonoLabel className="block mb-4">Go to</MonoLabel>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { href: "/profile/me", label: "Profile" },
            { href: "/profile/me/skills", label: "Skills" },
            { href: "/profile/me/services", label: "Services" },
            { href: "/profile/me/evidence", label: "Evidence" },
            { href: "/organizations", label: "Organizations" },
            { href: "/analyze", label: "Analysis" },
          ].map((l) => (
            <Link key={l.href} href={l.href}
              className="border border-white/10 rounded-sm px-5 py-4 text-white hover:bg-navy transition-colors flex items-center justify-between">
              <span>{l.label}</span>
              <span className="text-muted">→</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Profile visibility hint */}
      {profile && (
        <p className="text-sm text-muted mt-12 flex items-center gap-2">
          Profile visibility:
          <Chip tone={profile.visibility === "public" ? "green" : "neutral"}>{profile.visibility}</Chip>
          <Link href="/settings" className="text-blue underline underline-offset-4">change in settings</Link>
        </p>
      )}
    </main>
  );
}

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardInner />
    </AppShell>
  );
}

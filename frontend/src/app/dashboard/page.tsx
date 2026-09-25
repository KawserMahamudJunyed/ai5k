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
  getLatestProfileCheck,
  type ProfileCheck,
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
        const [orgs, invitations, latestCheck] = await Promise.all([listMyOrganizations(), listMyInvitations(), getLatestProfileCheck()]);
        setData({ profile, claims, evidence, services, orgs, invitations, latestCheck });
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

  const { profile, claims, evidence, services, orgs, invitations, latestCheck } = data;
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
      <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <PageHeader
          eyebrow="Command Center"
          title={`Welcome${profile ? `, ${profile.display_name}` : ""}`}
          lede="Your verified capability baseline. Prove your skills and unlock global opportunities."
        />
        
        {latestCheck && latestCheck.status === 'completed' && latestCheck.result && (
          <div className="bg-surface-elevated/50 border border-brand-cyan/30 rounded-2xl p-5 backdrop-blur-md min-w-[240px] flex items-center justify-between group cursor-pointer hover:border-brand-cyan/80 hover:bg-brand-cyan/5 transition-all shadow-[0_0_15px_rgba(80,223,251,0.15)] relative overflow-hidden" onClick={() => window.location.href = '/analyze'}>
            <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-100 transition-opacity">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-cyan"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
            </div>
            <div>
              <p className="text-xs text-brand-cyan font-mono mb-1 uppercase tracking-wider">Readiness Score</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-display font-bold text-white group-hover:text-brand-cyan transition-colors">{latestCheck.result.readiness}</span>
                <span className="text-sm text-white/50">/ 100</span>
              </div>
            </div>
          </div>
        )}
        
        {(!latestCheck || latestCheck.status !== 'completed') && (
          <Link href="/analyze" className="btn-shimmer rounded-xl px-6 py-4 flex items-center gap-3 hover:scale-105 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-void"><path d="M2 12h4l3-9 5 18 3-9h5"/></svg>
            <span className="font-semibold text-void">Run AI Analysis</span>
          </Link>
        )}
      </div>

      {/* Innovative Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
        <Stat label="Skills claimed" value={claims.length} sub={evidenced > 0 ? `${evidenced} verified` : "None verified"} href="/profile/me/skills" />
        <Stat label="Evidence Base" value={evidence.length} sub={pendingEvidence > 0 ? `${pendingEvidence} pending` : "Up to date"} href="/profile/me/evidence" />
        <Stat label="Active Services" value={services.length} href="/profile/me/services" />
        <Stat label="Network" value={orgs.length} sub="Agencies" href="/organizations" />
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

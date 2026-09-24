"use client";

// Public profile — UF-6d. GET /profiles/{id}. 403 → private, 404 → not found.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { Chip, Notice, Spinner } from "@/components/ui/Bits";
import { describeApiError, getProfile, type ProfileRead } from "@/lib/api-helpers";

function PublicProfileInner({ profileId }: { profileId: string }) {
  const [profile, setProfile] = useState<ProfileRead | null>(null);
  const [loadError, setLoadError] = useState("");
  const [claims, setClaims] = useState<{ id: string; skill_name: string; claim_type: string; proficiency_level: string | null }[]>([]);

  useEffect(() => {
    getProfile(profileId)
      .then(async (p) => {
        setProfile(p);
        // Claims render best-effort; the public API may omit them for private profiles.
        try {
          const { listSkillClaims } = await import("@/lib/api-helpers");
          setClaims(await listSkillClaims(profileId));
        } catch {
          setClaims([]);
        }
      })
      .catch((err) => {
        const status = (err as { status?: number }).status;
        if (status === 403) setLoadError("private");
        else if (status === 404) setLoadError("not-found");
        else setLoadError(describeApiError(err));
      });
  }, [profileId]);

  if (loadError === "private") {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md text-center border border-hairline rounded-md p-10 bg-canvas">
          <h1 className="text-card-heading font-display text-ink mb-3">Private profile</h1>
          <p className="text-muted">This person keeps their profile private.</p>
        </div>
      </main>
    );
  }
  if (loadError === "not-found") {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md text-center border border-hairline rounded-md p-10 bg-canvas">
          <h1 className="text-card-heading font-display text-ink mb-3">Profile not found</h1>
          <Link href="/" className="text-blue underline underline-offset-4">← Home</Link>
        </div>
      </main>
    );
  }
  if (loadError) {
    return <main className="max-w-3xl mx-auto px-6 py-16"><Notice kind="error">{loadError}</Notice></main>;
  }
  if (!profile) return <div className="flex justify-center py-24"><Spinner /></div>;

  return (
    <main className="max-w-text mx-auto px-6 py-12">
      <header className="border-b border-hairline pb-8 mb-8">
        <p className="font-mono text-micro text-muted mb-3 uppercase">Verified capability profile</p>
        <h1 className="text-section-heading font-display text-ink">{profile.display_name}</h1>
        {profile.headline && <p className="text-body-lg text-ink mt-3">{profile.headline}</p>}
        {profile.job_roles.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {profile.job_roles.map((r) => <Chip key={r}>{r}</Chip>)}
          </div>
        )}
      </header>

      {profile.portfolio_links.length > 0 && (
        <section className="mb-10">
          <h2 className="text-feature-heading font-display text-ink mb-4">Portfolio</h2>
          <div className="divide-y divide-hairline border-y border-hairline">
            {profile.portfolio_links.map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-between py-3 hover:bg-stone/40 transition-colors">
                <span className="text-ink">{l.label}</span>
                <span className="text-sm text-blue underline underline-offset-4">{l.url.replace(/^https?:\/\//, "")}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {claims.length > 0 && (
        <section className="mb-10">
          <h2 className="text-feature-heading font-display text-ink mb-4">Skills</h2>
          <div className="flex flex-wrap gap-2">
            {claims.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-2 border border-hairline rounded-full px-3 py-1.5 text-sm">
                {c.skill_name}
                <Chip tone={c.claim_type === "evidenced" ? "green" : "neutral"}>
                  {c.claim_type === "evidenced" ? "evidenced" : (c.proficiency_level ?? "self-declared")}
                </Chip>
              </span>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

export default function PublicProfilePage() {
  const params = useParams<{ id: string }>();
  return (
    <AppShell>
      <PublicProfileInner profileId={params.id} />
    </AppShell>
  );
}

"use client";

// Skills editor — UF-6a/6c. claim_type is server-asserted (self_declared →
// evidenced only via admin approval); no UI control for it.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import CvSuggestions from "@/components/skills/CvSuggestions";
import Button from "@/components/ui/Button";
import { Chip, Notice, PageHeader, Spinner } from "@/components/ui/Bits";
import {
  addSkillClaim,
  createVerificationRequest,
  deleteSkillClaim,
  describeApiError,
  getCvSkillSuggestions,
  getMyProfile,
  listSkillClaims,
  listSkills,
  updateSkillClaim,
  type ProfileRead,
  type Skill,
  type SkillClaim,
} from "@/lib/api-helpers";

const PROFICIENCY = ["beginner", "intermediate", "advanced", "expert"] as const;

function SkillsEditor() {
  const [profile, setProfile] = useState<ProfileRead | null>(null);
  const [claims, setClaims] = useState<SkillClaim[]>([]);
  const [catalog, setCatalog] = useState<Skill[]>([]);
  const [query, setQuery] = useState("");
  const [proficiency, setProficiency] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  // Skills the user's own CV surfaced (via the readiness-check suggestions API).
  // Seeded with already_claimed so existing CV-sourced rows get the tag too.
  const [cvSuggested, setCvSuggested] = useState<Set<string>>(new Set());

  useEffect(() => {
    getMyProfile()
      .then(async (p) => {
        setProfile(p);
        setClaims(await listSkillClaims(p.id));
      })
      .catch((err) =>
        setError((err as { code?: string }).code === "profile_not_found" ? "no-profile" : describeApiError(err)),
      )
      .finally(() => setLoading(false));
    listSkills().then((r) => setCatalog(r.data)).catch(() => setCatalog([]));
    // CV suggestions double as the source-tag registry: everything the API
    // reports (suggested or already_claimed) was detected in the user's CV.
    getCvSkillSuggestions()
      .then((s) => {
        if (!s) return;
        const reg = new Set<string>();
        for (const n of s.suggested) reg.add(n.toLowerCase());
        for (const n of s.already_claimed) reg.add(n.toLowerCase());
        setCvSuggested(reg);
      })
      .catch(() => {});
  }, []);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return catalog
      .filter((s) => s.name.toLowerCase().includes(q))
      .filter((s) => !claims.some((c) => c.skill_name.toLowerCase() === s.name.toLowerCase()))
      .slice(0, 6);
  }, [query, catalog, claims]);

  const exactMatch = useMemo(
    () =>
      catalog.some((s) => s.name.toLowerCase() === query.trim().toLowerCase()) ||
      claims.some((c) => c.skill_name.toLowerCase() === query.trim().toLowerCase()),
    [catalog, claims, query],
  );

  const refreshClaims = async (profileId: string) => setClaims(await listSkillClaims(profileId));

  // A chip claimed from the CvSuggestions block becomes a real claim row —
  // tag it (and any later ones from the same batch) as CV-sourced and pull
  // the fresh claims list so the row appears immediately.
  const handleCvClaimed = (names: string[]) => {
    setCvSuggested((prev) => {
      const next = new Set(prev);
      for (const n of names) next.add(n.toLowerCase());
      return next;
    });
    if (profile) void refreshClaims(profile.id);
  };

  const handleAdd = async (payload: { skill_id?: string; skill_name?: string }) => {
    if (!profile) return;
    setBusy(true);
    setError("");
    try {
      await addSkillClaim(profile.id, { ...payload, proficiency_level: proficiency || undefined });
      await refreshClaims(profile.id);
      setQuery("");
      setProficiency("");
    } catch (err) {
      if ((err as { code?: string }).code === "skill_already_claimed") {
        setError("That skill is already on your profile.");
      } else {
        setError(describeApiError(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleProficiency = async (claimId: string, level: string) => {
    if (!profile) return;
    setClaims((cs) => cs.map((c) => (c.id === claimId ? { ...c, proficiency_level: level as SkillClaim["proficiency_level"] } : c)));
    try {
      await updateSkillClaim(profile.id, claimId, level);
    } catch {
      await refreshClaims(profile.id);
    }
  };

  const handleDelete = async (claimId: string) => {
    if (!profile) return;
    setClaims((cs) => cs.filter((c) => c.id !== claimId));
    try {
      await deleteSkillClaim(profile.id, claimId);
    } catch {
      await refreshClaims(profile.id);
    }
  };

  // Get-verified — files a profile_skill verification request.
  const handleVerifyClaim = async (claim: SkillClaim) => {
    if (!profile) return;
    setError("");
    setNotice("");
    setVerifyingId(claim.id);
    try {
      await createVerificationRequest("profile_skill", claim.id);
      setRequestedIds((ids) => new Set(ids).add(claim.id));
      setNotice(`Verification requested for “${claim.skill_name}” — an admin will review it.`);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "request_exists") {
        setRequestedIds((ids) => new Set(ids).add(claim.id));
        setNotice(`A verification request is already pending for “${claim.skill_name}”.`);
      } else if (code === "already_verified") {
        setNotice(`“${claim.skill_name}” is already evidenced.`);
        await refreshClaims(profile.id);
      } else {
        setError(describeApiError(err));
      }
    } finally {
      setVerifyingId(null);
    }
  };

  if (error === "no-profile") {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md text-center border border-hairline rounded-md p-10 bg-canvas">
          <h1 className="text-card-heading font-display text-ink mb-3">No profile yet</h1>
          <p className="text-muted mb-6">Create yours to start claiming skills.</p>
          <Link href="/onboarding/profile"><Button>Create profile</Button></Link>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-text mx-auto px-6 py-12">
      <PageHeader eyebrow="Capability" title="Skills" lede="Claim what you can do. Verification raises the evidence tier." />

      {error && error !== "no-profile" && <div className="mb-6"><Notice kind="error">{error}</Notice></div>}
      {notice && <div className="mb-6"><Notice kind="ok">{notice}</Notice></div>}

      {/* CV-sourced suggestions (readiness-check CV); hidden when there is no CV */}
      <CvSuggestions onClaimed={handleCvClaimed} />

      {/* Add skill */}
      <div className="bg-canvas border border-hairline rounded-md p-6 mb-8">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text" placeholder="Search or type a new skill…" value={query}
            onChange={(e) => setQuery(e.target.value)} aria-label="Skill search"
            className="flex-1 bg-canvas border border-hairline rounded-sm px-4 py-2.5 text-ink placeholder:text-muted-2"
          />
          <select value={proficiency} onChange={(e) => setProficiency(e.target.value)} aria-label="Proficiency"
            className="bg-canvas border border-hairline rounded-sm px-3 py-2.5 text-ink">
            <option value="">Proficiency…</option>
            {PROFICIENCY.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <Button type="button" disabled={busy || !query.trim() || exactMatch} onClick={() => handleAdd({ skill_name: query.trim() })}>
            {busy ? "Adding…" : "Add skill"}
          </Button>
        </div>
        {suggestions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button key={s.id} type="button" onClick={() => handleAdd({ skill_id: s.id })}
                className="px-3 py-1.5 rounded-full border border-hairline text-sm text-ink hover:bg-stone transition-colors">
                {s.name}{s.category ? ` · ${s.category}` : ""}
              </button>
            ))}
          </div>
        )}
        {query.trim() && !exactMatch && suggestions.length > 0 && (
          <p className="mt-2 text-xs text-muted">Not in the list? “Add skill” creates “{query.trim()}” as a new skill.</p>
        )}
      </div>

      {/* Claims */}
      {claims.length === 0 ? (
        <p className="text-center py-16 text-muted border border-hairline rounded-md">No skills claimed yet. Add your first above.</p>
      ) : (
        <div className="divide-y divide-hairline border-y border-hairline">
          {claims.map((claim) => (
            <div key={claim.id} className="flex flex-col sm:flex-row sm:items-center gap-3 py-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-ink font-medium">{claim.skill_name}</span>
                  <Chip tone={claim.claim_type === "evidenced" ? "green" : "neutral"}>
                    {claim.claim_type === "evidenced" ? "Evidenced" : "Self-declared"}
                  </Chip>
                  {cvSuggested.has(claim.skill_name.toLowerCase()) && <Chip tone="navy">Suggested by CV</Chip>}
                  {requestedIds.has(claim.id) && claim.claim_type !== "evidenced" && <Chip tone="coral">Requested</Chip>}
                </div>
              </div>
              {claim.claim_type !== "evidenced" && !requestedIds.has(claim.id) && (
                <button type="button" onClick={() => handleVerifyClaim(claim)} disabled={verifyingId === claim.id}
                  className="text-sm text-blue underline underline-offset-4 disabled:opacity-40">
                  {verifyingId === claim.id ? "Submitting…" : "Get verified"}
                </button>
              )}
              <select value={claim.proficiency_level ?? ""} onChange={(e) => handleProficiency(claim.id, e.target.value)}
                aria-label={`Proficiency for ${claim.skill_name}`} className="bg-canvas border border-hairline rounded-sm px-3 py-2 text-sm text-ink">
                <option value="">Unset</option>
                {PROFICIENCY.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <button type="button" onClick={() => handleDelete(claim.id)} className="text-muted hover:text-error-red px-2"
                aria-label={`Remove ${claim.skill_name}`}>✕</button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

export default function SkillsPage() {
  return (
    <AppShell>
      <SkillsEditor />
    </AppShell>
  );
}

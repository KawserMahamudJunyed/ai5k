"use client";

// Skills editor (REVIEW.md item 1.4).
// GET /skills (catalog) + GET/POST/PATCH/DELETE /profiles/{id}/skills.
// claim_type is server-asserted: claims always start self_declared; only an
// admin verification decision flips them to evidenced — so no UI control for it.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import AppShell from "@/components/layout/AppShell";
import { ApiError } from "@/lib/api";
import {
  addSkillClaim,
  createVerificationRequest,
  deleteSkillClaim,
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
  const [proficiency, setProficiency] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  // Claims this session has filed a verification request for (server has no
  // "list my requests" endpoint, so this is best-effort UI feedback).
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getMyProfile()
      .then(async (p) => {
        setProfile(p);
        setClaims(await listSkillClaims(p.id));
      })
      .catch((err) =>
        setError(
          err instanceof ApiError && err.code === "profile_not_found"
            ? "no-profile"
            : (err as Error).message,
        ),
      )
      .finally(() => setLoading(false));

    listSkills()
      .then((r) => setCatalog(r.data))
      .catch(() => setCatalog([])); // catalog is optional for custom-skill entry
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

  const refreshClaims = async (profileId: string) => {
    setClaims(await listSkillClaims(profileId));
  };

  const handleAdd = async (payload: { skill_id?: string; skill_name?: string }) => {
    if (!profile) return;
    setBusy(true);
    setError("");
    try {
      await addSkillClaim(profile.id, {
        ...payload,
        proficiency_level: proficiency || undefined,
      });
      await refreshClaims(profile.id);
      setQuery("");
      setProficiency("");
    } catch (err) {
      if (err instanceof ApiError && err.code === "skill_already_claimed") {
        setError("That skill is already on your profile.");
      } else {
        setError(describe(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleProficiency = async (claimId: string, level: string) => {
    if (!profile) return;
    // Optimistic update; PATCH allows proficiency_level only.
    setClaims((cs) =>
      cs.map((c) =>
        c.id === claimId ? { ...c, proficiency_level: level as SkillClaim["proficiency_level"] } : c,
      ),
    );
    try {
      await updateSkillClaim(profile.id, claimId, level);
    } catch {
      await refreshClaims(profile.id);
    }
  };

  const handleDelete = async (claimId: string) => {
    if (!profile) return;
    setClaims((cs) => cs.filter((c) => c.id !== claimId)); // optimistic
    try {
      await deleteSkillClaim(profile.id, claimId);
    } catch {
      await refreshClaims(profile.id);
    }
  };

  // Get-verified CTA (REVIEW.md 3.3): files a request against the skill claim;
  // an admin approval flips claim_type to evidenced.
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
      if (err instanceof ApiError && err.status === 409 && err.code === "request_exists") {
        setRequestedIds((ids) => new Set(ids).add(claim.id));
        setNotice(`A verification request is already pending for “${claim.skill_name}”.`);
      } else if (err instanceof ApiError && err.status === 409 && err.code === "already_verified") {
        setNotice(`“${claim.skill_name}” is already evidenced.`);
        await refreshClaims(profile.id);
      } else {
        setError(describe(err));
      }
    } finally {
      setVerifyingId(null);
    }
  };

  if (error === "no-profile") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md text-center bg-surface-elevated/80 border border-white/10 rounded-2xl p-10">
          <h1 className="font-display text-2xl font-bold text-white mb-3">No profile yet</h1>
          <p className="text-fog mb-6">Create yours to start claiming skills.</p>
          <Link href="/onboarding/profile"><Button>Create profile</Button></Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen py-12 px-6 relative">
      <div className="absolute top-0 right-0 w-[700px] h-[700px] bg-brand-violet/10 blur-[150px] rounded-full pointer-events-none" />
      <div className="max-w-3xl mx-auto relative z-10">
        <div className="flex items-center justify-between mb-10">
          <div>
            <p className="text-sm text-fog mb-2">What you can do, and how well</p>
            <h1 className="font-display text-3xl font-bold text-white">Skills</h1>
          </div>
          <Link href="/profile/me" className="text-sm text-fog hover:text-white">
            ← Profile
          </Link>
        </div>

        {error && error !== "no-profile" && (
          <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {notice && (
          <div className="mb-6 p-3 rounded-lg bg-brand-violet/10 border border-brand-violet/20 text-brand-violet text-sm">
            {notice}
          </div>
        )}

        {/* Add-skill box: catalog autocomplete + free-text create */}
        <div ref={boxRef} className="bg-surface-elevated/80 border border-white/10 rounded-2xl p-6 mb-8">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Search or type a new skill…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-void border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan placeholder:text-white/20"
            />
            <select
              value={proficiency}
              onChange={(e) => setProficiency(e.target.value)}
              className="bg-void border border-white/10 rounded-lg px-3 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan"
            >
              <option value="">Proficiency…</option>
              {PROFICIENCY.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <Button
              type="button"
              disabled={busy || !query.trim() || exactMatch}
              onClick={() => handleAdd({ skill_name: query.trim() })}
            >
              {busy ? "Adding…" : "Add skill"}
            </Button>
          </div>

          {suggestions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleAdd({ skill_id: s.id })}
                  className="px-3 py-1.5 rounded-full bg-brand-cyan/10 border border-brand-cyan/30 text-sm text-brand-cyan hover:bg-brand-cyan/20 transition-colors"
                >
                  {s.name}
                  {s.category ? ` · ${s.category}` : ""}
                </button>
              ))}
            </div>
          )}
          {query.trim() && !exactMatch && suggestions.length > 0 && (
            <p className="mt-2 text-xs text-fog">
              Not in the list? &ldquo;Add skill&rdquo; creates &ldquo;{query.trim()}&rdquo; as a new skill.
            </p>
          )}
        </div>

        {/* Claimed skills */}
        {claims.length === 0 ? (
          <div className="text-center py-16 bg-surface-elevated/40 border border-white/5 rounded-2xl">
            <p className="text-fog">No skills claimed yet. Add your first above.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {claims.map((claim) => (
              <div
                key={claim.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 p-5 rounded-xl bg-surface-elevated border border-surface-border"
              >
                <div className="flex-1">
                  <p className="text-white font-semibold">{claim.skill_name}</p>
                  <p className="text-xs text-fog mt-0.5">
                    {claim.claim_type === "evidenced"
                      ? "Evidenced — verified through the review queue"
                      : "Self-declared — verify it with evidence to raise trust"}
                  </p>
                </div>
                {claim.claim_type !== "evidenced" && !requestedIds.has(claim.id) && (
                  <button
                    type="button"
                    onClick={() => handleVerifyClaim(claim)}
                    disabled={verifyingId === claim.id}
                    className="text-xs font-semibold px-3 py-1.5 rounded bg-brand-violet/20 text-brand-violet hover:bg-brand-violet/30 transition-colors disabled:opacity-50"
                  >
                    {verifyingId === claim.id ? "Submitting…" : "Get verified"}
                  </button>
                )}
                {requestedIds.has(claim.id) && claim.claim_type !== "evidenced" && (
                  <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-void text-brand-violet border border-brand-violet/20">
                    Requested
                  </span>
                )}
                <select
                  value={claim.proficiency_level ?? ""}
                  onChange={(e) => handleProficiency(claim.id, e.target.value)}
                  className="bg-void border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value="">Unset</option>
                  {PROFICIENCY.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => handleDelete(claim.id)}
                  className="text-fog hover:text-red-400 px-2"
                  aria-label={`Remove ${claim.skill_name}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function describe(err: unknown): string {
  if (err instanceof ApiError && err.status === 422 && err.details && typeof err.details === "object") {
    const entries = Object.entries(err.details as Record<string, string>);
    if (entries.length > 0) return entries.map(([f, m]) => `${f}: ${m}`).join(" · ");
  }
  return (err as Error).message || "Failed";
}

export default function SkillsPage() {
  return (
    <AppShell>
      <SkillsEditor />
    </AppShell>
  );
}

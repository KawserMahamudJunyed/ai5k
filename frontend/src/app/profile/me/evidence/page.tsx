"use client";

// Evidence page (REVIEW.md items 3.2 + 3.3).
// Three upload flows: file (presign → PUT → create), link, testimonial.
// Each row: delete, link/unlink skill claims, and a "Get verified" CTA that
// files a verification request against the evidence row (target_type identity_doc).
// 503 storage_not_configured → graceful degradation for the file flow.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import AppShell from "@/components/layout/AppShell";
import { ApiError } from "@/lib/api";
import {
  createEvidence,
  createVerificationRequest,
  deleteEvidence,
  describeApiError,
  getMyProfile,
  linkEvidenceToSkill,
  listEvidence,
  listSkillClaims,
  presignEvidence,
  unlinkEvidenceFromSkill,
  uploadToS3,
  type EvidenceRead,
  type ProfileRead,
  type SkillClaim,
  type SourceType,
} from "@/lib/api-helpers";

const FILE_TYPES = [
  { value: "document", label: "Document (PDF)" },
  { value: "certificate", label: "Certificate (PDF/PNG/JPEG)" },
  { value: "screenshot", label: "Screenshot (PNG/JPEG/WebP)" },
] as const;

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-void text-fog border-white/10",
  verified: "bg-brand-mint/10 text-brand-mint border-brand-mint/20",
  rejected: "bg-red-500/10 text-red-400 border-red-500/20",
};

// Client-side scheme normalization (backend requires ^https?://).
function normalizeUrl(u: string): string {
  const t = u.trim();
  return t && !/^https?:\/\//i.test(t) ? `https://${t}` : t;
}

function typeLabel(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function AddEvidenceCard({
  profileId,
  claims,
  onCreated,
}: {
  profileId: string;
  claims: SkillClaim[];
  onCreated: () => void;
}) {
  const [mode, setMode] = useState<"file" | "link" | "testimonial">("link");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<(typeof FILE_TYPES)[number]["value"]>("document");
  const [linkSkillId, setLinkSkillId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const contentTypeFor: Record<string, string> = {
    document: "application/pdf",
    certificate: file?.type || "application/pdf",
    screenshot: file?.type || "image/png",
  };

  const reset = () => {
    setTitle("");
    setDescription("");
    setUrl("");
    setFile(null);
    setLinkSkillId("");
    if (fileInput.current) fileInput.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setOk("");
    setBusy(true);
    try {
      let sourceType: SourceType;
      let body: Parameters<typeof createEvidence>[1];

      if (mode === "file") {
        if (!file) {
          setError("Choose a file first.");
          setBusy(false);
          return;
        }
        sourceType = fileType;
        // 3-step flow: presign → direct PUT to S3 → create row.
        const presign = await presignEvidence(profileId, fileType, contentTypeFor[fileType]);
        await uploadToS3(presign.upload_url, contentTypeFor[fileType], file);
        body = {
          source_type: sourceType,
          title: title.trim(),
          description: description.trim() || undefined,
          file_key: presign.file_key,
        };
      } else if (mode === "link") {
        sourceType = "link";
        body = {
          source_type: sourceType,
          title: title.trim(),
          description: description.trim() || undefined,
          url: normalizeUrl(url),
        };
      } else {
        sourceType = "testimonial";
        body = {
          source_type: sourceType,
          title: title.trim(),
          description: description.trim() || undefined,
          url: normalizeUrl(url),
        };
      }

      const created = await createEvidence(profileId, body);

      // Optionally link to a skill claim right away.
      if (linkSkillId) {
        await linkEvidenceToSkill(profileId, created.id, linkSkillId);
      }

      setOk("Evidence added.");
      reset();
      onCreated();
    } catch (err) {
      if (err instanceof ApiError && err.status === 503 && err.code === "storage_not_configured") {
        setError(
          "File uploads need S3 storage configured on the server. Use the Link or Testimonial tabs meanwhile.",
        );
      } else {
        setError(describeApiError(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const tabs = [
    { key: "link", label: "Link" },
    { key: "testimonial", label: "Testimonial" },
    { key: "file", label: "File" },
  ] as const;

  return (
    <form onSubmit={handleSubmit} className="bg-surface-elevated/80 border border-white/10 rounded-2xl p-6 mb-8 space-y-4">
      <div className="flex gap-2" role="tablist" aria-label="Evidence type">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={mode === t.key}
            onClick={() => { setMode(t.key); setError(""); }}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              mode === t.key
                ? "bg-white/10 text-white font-medium"
                : "text-fog hover:text-white hover:bg-white/5"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}
      {ok && (
        <div className="p-3 rounded-lg bg-brand-mint/10 border border-brand-mint/20 text-brand-mint text-sm">
          {ok}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-fog mb-1.5" htmlFor="evTitle">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            id="evTitle" type="text" required maxLength={255}
            placeholder={mode === "testimonial" ? "e.g. Client reference — Acme Corp" : "e.g. AWS ML Specialty certificate"}
            value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-void border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan"
          />
        </div>
        {mode === "link" || mode === "testimonial" ? (
          <div>
            <label className="block text-sm font-medium text-fog mb-1.5" htmlFor="evUrl">
              URL <span className="text-red-400">*</span>
            </label>
            <input
              id="evUrl" type="text" inputMode="url" required maxLength={2048}
              placeholder="example.com/proof"
              value={url} onChange={(e) => setUrl(e.target.value)}
              className="w-full bg-void border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan"
            />
            <p className="text-xs text-fog mt-1">https:// is added automatically.</p>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-fog mb-1.5" htmlFor="evFile">
              File <span className="text-red-400">*</span>
            </label>
            <div className="flex gap-2">
              <select
                aria-label="File category"
                value={fileType}
                onChange={(e) => setFileType(e.target.value as typeof fileType)}
                className="bg-void border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm"
              >
                {FILE_TYPES.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
              <input
                id="evFile" ref={fileInput} type="file" required
                accept={
                  fileType === "document"
                    ? "application/pdf"
                    : fileType === "certificate"
                      ? "application/pdf,image/png,image/jpeg"
                      : "image/png,image/jpeg,image/webp"
                }
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="flex-1 text-sm text-fog file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-white/10 file:text-white file:text-sm"
              />
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-fog mb-1.5" htmlFor="evDesc">
          Description
        </label>
        <textarea
          id="evDesc" rows={2} maxLength={2000}
          value={description} onChange={(e) => setDescription(e.target.value)}
          className="w-full bg-void border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan"
        />
      </div>

      {claims.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-fog mb-1.5" htmlFor="evSkill">
            Link to a skill claim <span className="text-fog/60">(optional)</span>
          </label>
          <select
            id="evSkill" value={linkSkillId}
            onChange={(e) => setLinkSkillId(e.target.value)}
            className="w-full md:w-80 bg-void border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm"
          >
            <option value="">None</option>
            {claims.map((c) => (
              <option key={c.id} value={c.id}>
                {c.skill_name}
                {c.proficiency_level ? ` · ${c.proficiency_level}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <Button type="submit" disabled={busy || !title.trim()}>
        {busy ? "Adding…" : "Add evidence"}
      </Button>
    </form>
  );
}

function EvidenceRow({
  profileId,
  evidence,
  claims,
  onChanged,
}: {
  profileId: string;
  evidence: EvidenceRead;
  claims: SkillClaim[];
  onChanged: () => void;
}) {
  const [verifying, setVerifying] = useState(false);
  const [requested, setRequested] = useState(false);
  const [rowError, setRowError] = useState("");
  const [linking, setLinking] = useState(false);
  const [linkChoice, setLinkChoice] = useState("");

  const linkedIds = new Set(evidence.skill_links.map((l) => l.profile_skill_id));

  const handleVerify = async () => {
    setRowError("");
    setVerifying(true);
    try {
      await createVerificationRequest("identity_doc", evidence.id);
      setRequested(true);
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === "request_exists") {
        setRequested(true);
        setRowError("A verification request is already pending for this evidence.");
      } else if (err instanceof ApiError && err.status === 409 && err.code === "already_verified") {
        setRowError("This evidence is already verified.");
      } else {
        setRowError(describeApiError(err));
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleLink = async () => {
    if (!linkChoice) return;
    setRowError("");
    try {
      await linkEvidenceToSkill(profileId, evidence.id, linkChoice);
      setLinkChoice("");
      setLinking(false);
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === "link_exists") {
        setRowError("Already linked to that skill.");
      } else {
        setRowError(describeApiError(err));
      }
    }
  };

  const handleUnlink = async (linkId: string) => {
    setRowError("");
    try {
      await unlinkEvidenceFromSkill(profileId, evidence.id, linkId);
      onChanged();
    } catch (err) {
      setRowError(describeApiError(err));
    }
  };

  const handleDelete = async () => {
    setRowError("");
    try {
      await deleteEvidence(profileId, evidence.id);
      onChanged();
    } catch (err) {
      setRowError(describeApiError(err));
    }
  };

  const linkable = claims.filter((c) => !linkedIds.has(c.id));

  return (
    <div className="p-5 rounded-xl bg-surface-elevated border border-surface-border space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-white font-semibold">{evidence.title}</p>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-void text-fog border border-white/10">
              {typeLabel(evidence.source_type)}
            </span>
            <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${STATUS_STYLES[evidence.verification_status] ?? STATUS_STYLES.pending}`}>
              {evidence.verification_status}
            </span>
          </div>
          {evidence.description && (
            <p className="text-sm text-fog mt-1">{evidence.description}</p>
          )}
          {evidence.file_url && (evidence.source_type === "link" || evidence.source_type === "testimonial") && (
            <a
              href={evidence.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-brand-cyan hover:text-white break-all mt-1 inline-block"
            >
              {evidence.file_url}
            </a>
          )}
          {evidence.download_url && (
            <a
              href={evidence.download_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-brand-cyan hover:text-white mt-1 inline-block"
            >
              Download file ↓
            </a>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {evidence.verification_status === "pending" && requested && (
            <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-void text-brand-violet border border-brand-violet/20">
              Requested
            </span>
          )}
          {evidence.verification_status === "pending" && !requested && (
            <button
              type="button"
              onClick={handleVerify}
              disabled={verifying}
              className="text-xs font-semibold px-3 py-1.5 rounded bg-brand-violet/20 text-brand-violet hover:bg-brand-violet/30 transition-colors disabled:opacity-50"
            >
              {verifying ? "Submitting…" : "Get verified"}
            </button>
          )}
          <button
            type="button"
            onClick={handleDelete}
            className="text-sm text-fog hover:text-red-400 px-1"
            aria-label={`Delete ${evidence.title}`}
          >
            ✕
          </button>
        </div>
      </div>

      {rowError && (
        <p className="text-xs text-red-400">{rowError}</p>
      )}

      {/* Skill links */}
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/5">
        <span className="text-xs text-fog">Supports:</span>
        {evidence.skill_links.length === 0 && <span className="text-xs text-fog/60 italic">no skills linked</span>}
        {evidence.skill_links.map((l) => {
          const claim = claims.find((c) => c.id === l.profile_skill_id);
          return (
            <span
              key={l.id}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-brand-cyan/10 border border-brand-cyan/30 text-brand-cyan"
            >
              {claim?.skill_name ?? "skill"}
              <button
                type="button"
                onClick={() => handleUnlink(l.id)}
                className="hover:text-white"
                aria-label={`Unlink ${claim?.skill_name ?? "skill"}`}
              >
                ✕
              </button>
            </span>
          );
        })}
        {linkable.length > 0 && !linking && (
          <button
            type="button"
            onClick={() => setLinking(true)}
            className="text-xs text-fog hover:text-white"
          >
            + link a skill
          </button>
        )}
        {linking && (
          <span className="inline-flex items-center gap-2">
            <select
              value={linkChoice}
              onChange={(e) => setLinkChoice(e.target.value)}
              className="bg-void border border-white/10 rounded-lg px-2 py-1 text-xs text-white"
            >
              <option value="">Choose…</option>
              {linkable.map((c) => (
                <option key={c.id} value={c.id}>{c.skill_name}</option>
              ))}
            </select>
            <button type="button" onClick={handleLink} className="text-xs text-brand-cyan hover:text-white">
              Link
            </button>
            <button type="button" onClick={() => setLinking(false)} className="text-xs text-fog hover:text-white">
              Cancel
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

function EvidencePageInner() {
  const [profile, setProfile] = useState<ProfileRead | null>(null);
  const [evidence, setEvidence] = useState<EvidenceRead[]>([]);
  const [claims, setClaims] = useState<SkillClaim[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: ProfileRead) => {
    const [ev, cl] = await Promise.all([listEvidence(p.id), listSkillClaims(p.id)]);
    setEvidence(ev);
    setClaims(cl);
  }, []);

  useEffect(() => {
    getMyProfile()
      .then(async (p) => {
        setProfile(p);
        await load(p);
      })
      .catch((err) =>
        setError(
          err instanceof ApiError && err.code === "profile_not_found"
            ? "no-profile"
            : describeApiError(err),
        ),
      )
      .finally(() => setLoading(false));
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-12 h-12 rounded-full border-4 border-brand-cyan/20 border-t-brand-cyan animate-spin" />
      </div>
    );
  }

  if (error === "no-profile") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md text-center bg-surface-elevated/80 border border-white/10 rounded-2xl p-10">
          <h1 className="font-display text-2xl font-bold text-white mb-3">No profile yet</h1>
          <p className="text-fog mb-6">Create yours to start adding evidence.</p>
          <Link href="/onboarding/profile"><Button>Create profile</Button></Link>
        </div>
      </main>
    );
  }

  return (
    <main className="py-12 px-6 relative">
      <div className="absolute top-0 right-0 w-[700px] h-[700px] bg-brand-violet/10 blur-[150px] rounded-full pointer-events-none" />
      <div className="max-w-3xl mx-auto relative z-10">
        <div className="flex items-center justify-between mb-10">
          <div>
            <p className="text-sm text-fog mb-2">Proof behind your claims</p>
            <h1 className="font-display text-3xl font-bold text-white">Evidence</h1>
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

        {profile && (
          <>
            <AddEvidenceCard profileId={profile.id} claims={claims} onCreated={() => load(profile)} />

            {evidence.length === 0 ? (
              <div className="text-center py-16 bg-surface-elevated/40 border border-white/5 rounded-2xl">
                <p className="text-fog">No evidence yet. Add a link, testimonial, or file above.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {evidence.map((ev) => (
                  <EvidenceRow
                    key={ev.id}
                    profileId={profile.id}
                    evidence={ev}
                    claims={claims}
                    onChanged={() => load(profile)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default function EvidencePage() {
  return (
    <AppShell>
      <EvidencePageInner />
    </AppShell>
  );
}

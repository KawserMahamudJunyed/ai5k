"use client";

// Evidence — UF-6b/6c. Three flows: link, testimonial, file (presign → PUT →
// create when S3 is configured; CV-style local upload for PDF/DOCX/TXT/MD when
// it isn't — the file lands in the readiness CV store and the row points at it).
// Rows support skill linking + get-verified CTA.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import Button from "@/components/ui/Button";
import { Chip, Field, inputClass, Notice, PageHeader, Spinner } from "@/components/ui/Bits";
import {
  attachCvAsEvidence,
  createEvidence,
  createVerificationRequest,
  deleteEvidence,
  describeApiError,
  downloadEvidenceFile,
  getMyProfile,
  linkEvidenceToSkill,
  listEvidence,
  listSkillClaims,
  normalizeUrl,
  presignEvidence,
  unlinkEvidenceFromSkill,
  uploadCv,
  uploadToS3,
  type EvidenceRead,
  type ProfileRead,
  type SkillClaim,
  type SourceType,
} from "@/lib/api-helpers";

const FILE_TYPES = [
  { value: "document", label: "Document (PDF, DOCX, MD, TXT)", accept: ".pdf,.docx,.md,.txt" },
  { value: "certificate", label: "Certificate / CV (PDF, DOCX, MD, TXT, PNG, JPG)", accept: ".pdf,.docx,.md,.txt,.png,.jpg,.jpeg" },
  { value: "screenshot", label: "Screenshot", accept: "image/png,image/jpeg,image/webp" },
] as const;

// S3-backed types (presign → PUT) — everything else rides the CV local store.
const S3_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

function evidenceContentType(file: File): string {
  const name = file.name.toLowerCase();
  if (name.endsWith(".md")) return "text/markdown";
  if (name.endsWith(".txt")) return "text/plain";
  if (name.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return file.type || "application/octet-stream";
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
  const [mode, setMode] = useState<"link" | "testimonial" | "file">("link");
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

  const reset = () => {
    setTitle(""); setDescription(""); setUrl(""); setFile(null); setLinkSkillId("");
    if (fileInput.current) fileInput.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setOk(""); setBusy(true);
    try {
      let body: Parameters<typeof createEvidence>[1];
      if (mode === "file") {
        if (!file) { setError("Choose a file first."); setBusy(false); return; }
        const contentType = evidenceContentType(file);
        if (S3_TYPES.has(contentType)) {
          // S3-backed: presign → direct PUT → create row (503-degradable).
          const presign = await presignEvidence(profileId, fileType, contentType);
          await uploadToS3(presign.upload_url, contentType, file);
          body = { source_type: fileType as SourceType, title: title.trim(), description: description.trim() || undefined, file_key: presign.file_key };
          const created = await createEvidence(profileId, body);
          if (linkSkillId) await linkEvidenceToSkill(profileId, created.id, linkSkillId);
        } else {
          // DOCX/TXT/MD (and PDF when S3 is down): upload to the CV store and
          // attach as file evidence in one call — works with zero S3 config.
          const up = await uploadCv(file);
          await attachCvAsEvidence({
            cv_token: up.cv_token,
            source_type: fileType === "screenshot" ? "document" : (fileType as "certificate" | "document"),
            title: title.trim(),
            description: description.trim() || undefined,
          });
        }
        setOk("Evidence added.");
        reset();
        onCreated();
        return;
      }
      body = { source_type: mode, title: title.trim(), description: description.trim() || undefined, url: normalizeUrl(url) };
      const created = await createEvidence(profileId, body);
      if (linkSkillId) await linkEvidenceToSkill(profileId, created.id, linkSkillId);
      setOk("Evidence added.");
      reset();
      onCreated();
    } catch (err) {
      if ((err as { status?: number }).status === 503) {
        setError("S3 storage is not configured. Screenshots and PDFs need it — but you can still upload DOCX, MD or TXT files (they use local storage), or use the Link or Testimonial tabs.");
      } else {
        setError(describeApiError(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const needsUrl = mode === "link" || mode === "testimonial";

  return (
    <form onSubmit={handleSubmit} className="bg-canvas border border-hairline rounded-md p-6 mb-8 space-y-5">
      <div className="flex gap-2" role="tablist" aria-label="Evidence type">
        {(["link", "testimonial", "file"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={mode === t}
            onClick={() => { setMode(t); setError(""); }}
            className={`px-4 py-2 rounded-full text-sm capitalize transition-colors ${
              mode === t ? "bg-near-black text-white" : "text-muted hover:text-ink hover:bg-stone"
            }`}>
            {t}
          </button>
        ))}
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Title" htmlFor="evTitle" required>
          <input id="evTitle" type="text" required maxLength={255} value={title}
            onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </Field>
        {needsUrl ? (
          <Field label="URL" htmlFor="evUrl" required hint="https:// added automatically">
            <input id="evUrl" type="text" inputMode="url" required maxLength={2048} placeholder="example.com/proof"
              value={url} onChange={(e) => setUrl(e.target.value)} className={inputClass} />
          </Field>
        ) : (
          <Field label="File" htmlFor="evFile" required>
            <div className="flex gap-2">
              <select aria-label="File category" value={fileType}
                onChange={(e) => setFileType(e.target.value as typeof fileType)}
                className="bg-canvas border border-hairline rounded-sm px-3 py-2.5 text-sm text-ink">
                {FILE_TYPES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <input id="evFile" ref={fileInput} type="file" required accept={FILE_TYPES.find((f) => f.value === fileType)?.accept}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="flex-1 text-sm text-muted file:mr-3 file:py-2 file:px-3 file:rounded-full file:border-0 file:bg-near-black file:text-white file:text-sm" />
            </div>
          </Field>
        )}
      </div>

      <Field label="Description" htmlFor="evDesc">
        <textarea id="evDesc" rows={2} maxLength={2000} value={description}
          onChange={(e) => setDescription(e.target.value)} className={inputClass} />
      </Field>

      {claims.length > 0 && (
        <Field label="Link to a skill claim" htmlFor="evSkill" hint="(optional)">
          <select id="evSkill" value={linkSkillId} onChange={(e) => setLinkSkillId(e.target.value)}
            className="w-full md:w-80 bg-canvas border border-hairline rounded-sm px-4 py-2.5 text-sm text-ink">
            <option value="">None</option>
            {claims.map((c) => (
              <option key={c.id} value={c.id}>{c.skill_name}{c.proficiency_level ? ` · ${c.proficiency_level}` : ""}</option>
            ))}
          </select>
        </Field>
      )}

      <Button type="submit" disabled={busy || !title.trim()}>{busy ? "Adding…" : "Add evidence"}</Button>
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
  const linkable = claims.filter((c) => !linkedIds.has(c.id));
  const isUrlType = evidence.source_type === "link" || evidence.source_type === "testimonial";

  const handleVerify = async () => {
    setRowError(""); setVerifying(true);
    try {
      await createVerificationRequest("identity_doc", evidence.id);
      setRequested(true);
      onChanged();
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "request_exists") { setRequested(true); setRowError("A verification request is already pending for this evidence."); }
      else if (code === "already_verified") { setRowError("This evidence is already verified."); }
      else setRowError(describeApiError(err));
    } finally {
      setVerifying(false);
    }
  };

  const handleLink = async () => {
    if (!linkChoice) return;
    setRowError("");
    try {
      await linkEvidenceToSkill(profileId, evidence.id, linkChoice);
      setLinkChoice(""); setLinking(false); onChanged();
    } catch (err) {
      setRowError((err as { code?: string }).code === "link_exists" ? "Already linked to that skill." : describeApiError(err));
    }
  };

  const handleUnlink = async (linkId: string) => {
    setRowError("");
    try { await unlinkEvidenceFromSkill(profileId, evidence.id, linkId); onChanged(); }
    catch (err) { setRowError(describeApiError(err)); }
  };

  const handleDelete = async () => {
    setRowError("");
    try { await deleteEvidence(profileId, evidence.id); onChanged(); }
    catch (err) { setRowError(describeApiError(err)); }
  };

  return (
    <div className="py-5 border-b border-hairline space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-ink font-medium">{evidence.title}</span>
            <Chip>{evidence.source_type}</Chip>
            <Chip tone={evidence.verification_status === "verified" ? "green" : evidence.verification_status === "rejected" ? "red" : "neutral"}>
              {evidence.verification_status}
            </Chip>
          </div>
          {evidence.description && <p className="text-sm text-muted mt-1">{evidence.description}</p>}
          {isUrlType && evidence.file_url && (
            <a href={evidence.file_url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-blue underline underline-offset-4 break-all mt-1 inline-block">
              {evidence.file_url}
            </a>
          )}
          {evidence.download_url && (
            evidence.download_url.startsWith("/") ? (
              <button type="button" onClick={() => downloadEvidenceFile(evidence.download_url!)}
                className="text-xs text-blue underline underline-offset-4 mt-1 inline-block">Download file ↓</button>
            ) : (
              <a href={evidence.download_url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue underline underline-offset-4 mt-1 inline-block">Download file ↓</a>
            )
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {evidence.verification_status === "pending" && requested && <Chip tone="coral">Requested</Chip>}
          {evidence.verification_status === "pending" && !requested && (
            <button type="button" onClick={handleVerify} disabled={verifying}
              className="text-sm text-blue underline underline-offset-4 disabled:opacity-40">
              {verifying ? "Submitting…" : "Get verified"}
            </button>
          )}
          <button type="button" onClick={handleDelete} className="text-muted hover:text-error-red px-1"
            aria-label={`Delete ${evidence.title}`}>✕</button>
        </div>
      </div>

      {rowError && <p className="text-xs text-error-red">{rowError}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Supports:</span>
        {evidence.skill_links.length === 0 && <span className="text-xs text-muted-2 italic">no skills linked</span>}
        {evidence.skill_links.map((l) => {
          const claim = claims.find((c) => c.id === l.profile_skill_id);
          return (
            <span key={l.id} className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full border border-hairline text-ink">
              {claim?.skill_name ?? "skill"}
              <button type="button" onClick={() => handleUnlink(l.id)} className="text-muted hover:text-error-red"
                aria-label={`Unlink ${claim?.skill_name ?? "skill"}`}>✕</button>
            </span>
          );
        })}
        {linkable.length > 0 && !linking && (
          <button type="button" onClick={() => setLinking(true)} className="text-xs text-blue underline underline-offset-4">
            + link a skill
          </button>
        )}
        {linking && (
          <span className="inline-flex items-center gap-2">
            <select value={linkChoice} onChange={(e) => setLinkChoice(e.target.value)} aria-label="Skill to link"
              className="bg-canvas border border-hairline rounded-sm px-2 py-1 text-xs text-ink">
              <option value="">Choose…</option>
              {linkable.map((c) => <option key={c.id} value={c.id}>{c.skill_name}</option>)}
            </select>
            <button type="button" onClick={handleLink} className="text-xs text-blue underline underline-offset-4">Link</button>
            <button type="button" onClick={() => setLinking(false)} className="text-xs text-muted underline underline-offset-4">Cancel</button>
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
      .then(async (p) => { setProfile(p); await load(p); })
      .catch((err) =>
        setError((err as { code?: string }).code === "profile_not_found" ? "no-profile" : describeApiError(err)),
      )
      .finally(() => setLoading(false));
  }, [load]);

  if (loading) return <div className="flex justify-center py-24"><Spinner /></div>;

  if (error === "no-profile") {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md text-center border border-hairline rounded-md p-10 bg-canvas">
          <h1 className="text-card-heading font-display text-ink mb-3">No profile yet</h1>
          <Link href="/onboarding/profile"><Button>Create profile</Button></Link>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-text mx-auto px-6 py-12">
      <PageHeader eyebrow="Trust" title="Evidence" lede="Proof behind your claims — links, testimonials, certificates." />

      {error && error !== "no-profile" && <div className="mb-6"><Notice kind="error">{error}</Notice></div>}

      {profile && (
        <>
          <AddEvidenceCard profileId={profile.id} claims={claims} onCreated={() => load(profile)} />
          {evidence.length === 0 ? (
            <p className="text-center py-16 text-muted border border-hairline rounded-md">No evidence yet. Add a link, testimonial, or file above.</p>
          ) : (
            <div className="border-t border-hairline">
              {evidence.map((ev) => (
                <EvidenceRow key={ev.id} profileId={profile.id} evidence={ev} claims={claims} onChanged={() => load(profile)} />
              ))}
            </div>
          )}
        </>
      )}
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

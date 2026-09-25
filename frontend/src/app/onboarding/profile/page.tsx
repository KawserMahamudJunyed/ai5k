"use client";

// Onboarding — UF-4. POST /profiles; URLs scheme-normalized; CV upload uses
// the presign→PUT→create flow and degrades gracefully on 503.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { Field, inputClass, MonoLabel, Notice } from "@/components/ui/Bits";
import {
  createEvidence,
  createProfile,
  describeApiError,
  getMyProfile,
  normalizeUrl,
  presignEvidence,
  uploadToS3,
  updateProfile,
} from "@/lib/api-helpers";

export default function OnboardingPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [headline, setHeadline] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [upworkUrl, setUpworkUrl] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvNote, setCvNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const links = [
        githubUrl.trim() && { label: "GitHub", url: normalizeUrl(githubUrl) },
        upworkUrl.trim() && { label: "Upwork", url: normalizeUrl(upworkUrl) },
      ].filter(Boolean) as { label: string; url: string }[];

      // create-or-update (returning to onboarding after 404 elsewhere, etc.)
      let profile;
      try {
        profile = await createProfile({
          display_name: displayName.trim(),
          headline: headline.trim() || undefined,
          portfolio_links: links,
        });
      } catch (err) {
        if (err instanceof Error && "status" in err && (err as { status: number }).status === 409) {
          const existing = await getMyProfile();
          profile = await updateProfile(existing.id, {
            display_name: displayName.trim(),
            headline: headline.trim() || undefined,
            portfolio_links: links,
          });
        } else {
          throw err;
        }
      }

      // Optional CV upload — degradable.
      if (cvFile) {
        try {
          const presign = await presignEvidence(profile.id, "document", "application/pdf");
          await uploadToS3(presign.upload_url, "application/pdf", cvFile);
          await createEvidence(profile.id, {
            source_type: "document",
            title: "Curriculum vitae",
            file_key: presign.file_key,
          });
        } catch (err) {
          const status = (err as { status?: number }).status;
          if (status === 503) {
            setCvNote("CV upload skipped — file storage isn't configured on the server yet. You can add evidence later.");
          } else {
            setCvNote(`CV upload failed: ${describeApiError(err)} — profile saved without it.`);
          }
        }
      }

      router.push("/dashboard");
    } catch (err) {
      setError(describeApiError(err));
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-navy">
      <div className="max-w-text mx-auto px-6 py-16">
        <MonoLabel className="block mb-3">Step 1 of 1 · Basic setup</MonoLabel>
        <h1 className="text-section-heading font-display text-white">Create your profile</h1>
        <p className="text-body text-muted mt-3 mb-10">
          This becomes your public capability page. You can refine everything later.
        </p>

        {error && <div className="mb-6"><Notice kind="error">{error}</Notice></div>}
        {cvNote && <div className="mb-6"><Notice kind="info">{cvNote}</Notice></div>}

        <form onSubmit={handleSubmit} className="bg-void border border-white/10 rounded-md p-8 space-y-6">
          <Field label="Display name" htmlFor="displayName" required>
            <input id="displayName" type="text" required maxLength={255} value={displayName}
              onChange={(e) => setDisplayName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Headline" htmlFor="headline" hint="role + industry + outcome">
            <input id="headline" type="text" maxLength={255} placeholder="e.g. Agentic AI Engineer · U.S. Mortgage · document-intake agents"
              value={headline} onChange={(e) => setHeadline(e.target.value)} className={inputClass} />
          </Field>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="GitHub URL" htmlFor="github" hint="https:// added automatically">
              <input id="github" type="text" inputMode="url" placeholder="github.com/you"
                value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Upwork profile" htmlFor="upwork" hint="https:// added automatically">
              <input id="upwork" type="text" inputMode="url" placeholder="upwork.com/freelancers/~"
                value={upworkUrl} onChange={(e) => setUpworkUrl(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <Field label="CV (PDF, optional)" htmlFor="cv">
            <input id="cv" type="file" accept="application/pdf"
              onChange={(e) => setCvFile(e.target.files?.[0] ?? null)}
              className="text-sm text-muted file:mr-3 file:py-2 file:px-3 file:rounded-full file:border-0 file:bg-near-black file:text-white file:text-sm" />
          </Field>
          <div className="pt-2">
            <Button type="submit" size="lg" disabled={busy || !displayName.trim()}>
              {busy ? "Saving…" : "Save and continue"}
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}

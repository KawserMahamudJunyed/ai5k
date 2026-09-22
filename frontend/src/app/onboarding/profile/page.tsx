"use client";

import Image from "next/image";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import {
  createProfile,
  getMyProfile,
  presignEvidence,
  uploadToS3,
  createEvidence,
} from "@/lib/api-helpers";
import { ApiError } from "@/lib/api";

function OnboardingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusField = searchParams.get("focus");

  // Basic Info
  const [displayName, setDisplayName] = useState("");
  const [headline, setHeadline] = useState("");

  // Portfolio & Links
  const [githubUrl, setGithubUrl] = useState("");
  const [upworkUrl, setUpworkUrl] = useState("");

  // Resume / CV
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "success" | "error" | "degraded"
  >("idle");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Prefill from an existing profile (revisit after signup) and default the
  // display name from nothing — backend requires display_name (1-255 chars).
  useEffect(() => {
    getMyProfile()
      .then((p) => {
        setDisplayName(p.display_name);
        setHeadline(p.headline ?? "");
        const gh = p.portfolio_links.find((l) => l.label.toLowerCase() === "github");
        const uw = p.portfolio_links.find((l) => l.label.toLowerCase() === "upwork");
        if (gh) setGithubUrl(gh.url);
        if (uw) setUpworkUrl(uw.url);
      })
      .catch(() => {
        /* 404 profile_not_found = first time, fine */
      });
  }, []);

  // Focus effect
  useEffect(() => {
    if (focusField) {
      const el = document.getElementById(focusField);
      if (el) {
        el.focus();
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [focusField]);

  // Backend requires portfolio URLs to match ^https?:// — users habitually
  // type "github.com/...", so default the scheme client-side.
  const normalizeUrl = (u: string): string => {
    const trimmed = u.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
    return trimmed;
  };

  // Turn the backend's 422 details ({field: message}) into readable text.
  const describeValidationError = (err: unknown): string => {
    if (err instanceof ApiError && err.status === 422 && err.details && typeof err.details === "object") {
      const entries = Object.entries(err.details as Record<string, string>);
      if (entries.length > 0) {
        return entries.map(([field, msg]) => `${field}: ${msg}`).join(" · ");
      }
    }
    return (err as Error).message || "Failed to save profile";
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setCvFile(e.target.files[0]);
    }
  };

  // Real evidence flow: presign → PUT bytes directly to S3 → create evidence row.
  // Requires a profile to exist first (evidence is profile-scoped).
  const uploadCV = async (profileId: string, file: File): Promise<"success" | "error" | "degraded"> => {
    try {
      const contentType = file.type || "application/pdf";
      const { file_key, upload_url } = await presignEvidence(profileId, "document", contentType);
      await uploadToS3(upload_url, contentType, file);
      await createEvidence(profileId, {
        source_type: "document",
        title: file.name,
        file_key,
      });
      return "success";
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      if (code === "storage_not_configured") return "degraded";
      console.warn("CV upload failed:", err);
      return "error";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const portfolio_links = [
        ...(githubUrl.trim() ? [{ label: "GitHub", url: normalizeUrl(githubUrl) }] : []),
        ...(upworkUrl.trim() ? [{ label: "Upwork", url: normalizeUrl(upworkUrl) }] : []),
      ];

      // Create or update the individual profile.
      let profileId: string;
      try {
        const existing = await getMyProfile();
        const { updateProfile } = await import("@/lib/api-helpers");
        const updated = await updateProfile(existing.id, {
          display_name: displayName,
          headline,
          portfolio_links,
        });
        profileId = updated.id;
      } catch {
        const created = await createProfile({
          display_name: displayName,
          headline,
          portfolio_links,
        });
        profileId = created.id;
      }

      // Evidence upload only after the profile exists.
      let finalUploadStatus: "idle" | "success" | "error" | "degraded" = "idle";
      if (cvFile) {
        setUploadStatus("uploading");
        finalUploadStatus = await uploadCV(profileId, cvFile);
        setUploadStatus(finalUploadStatus);
      }

      router.push("/analyze");
    } catch (err) {
      setError(describeValidationError(err));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Section 1: Basic info */}
      <section>
        <h2 className="font-display text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-brand-blue/20 text-brand-blue text-xs">1</span>
          Basic info
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-fog mb-1.5" htmlFor="displayName">
              Display name <span className="text-red-400">*</span>
            </label>
            <input
              id="displayName" type="text" required maxLength={255}
              placeholder="e.g. Jane Doe"
              value={displayName} onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-void border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan transition-shadow"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-fog mb-1.5" htmlFor="headline">Headline</label>
            <input
              id="headline" type="text" maxLength={255}
              placeholder="e.g. Senior AI Engineer"
              value={headline} onChange={(e) => setHeadline(e.target.value)}
              className="w-full bg-void border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan transition-shadow"
            />
          </div>
        </div>
      </section>

      {/* Section 2: Portfolio & links */}
      <section className="pt-6 border-t border-white/5">
        <h2 className="font-display text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-brand-blue/20 text-brand-blue text-xs">2</span>
          Portfolio & links
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-fog mb-1.5" htmlFor="githubUrl">GitHub URL</label>
            <input
              id="githubUrl" type="text" inputMode="url" placeholder="github.com/username"
              value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)}
              className="w-full bg-void border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan transition-shadow"
            />
            <p className="mt-1 text-xs text-fog">https:// is added automatically.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-fog mb-1.5" htmlFor="upworkUrl">Upwork Profile</label>
            <input
              id="upworkUrl" type="text" inputMode="url" placeholder="upwork.com/freelancers/username"
              value={upworkUrl} onChange={(e) => setUpworkUrl(e.target.value)}
              className="w-full bg-void border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan transition-shadow"
            />
          </div>
        </div>
      </section>

      {/* Section 3: Resume / CV */}
      <section className="pt-6 border-t border-white/5">
        <h2 className="font-display text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-brand-blue/20 text-brand-blue text-xs">3</span>
          Resume / CV
        </h2>
        <div>
          <label className="block text-sm font-medium text-fog mb-1.5" htmlFor="cvUpload">
            Upload document (PDF)
          </label>
          <input
            id="cvUpload" type="file" accept=".pdf"
            onChange={handleFileChange}
            className="block w-full text-sm text-fog file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/20 transition-colors"
          />
          <p className="mt-2 text-xs text-fog">
            PDF only. Stored as evidence; starts in pending verification.
          </p>

          {uploadStatus === "uploading" && (
            <p className="mt-3 text-sm text-brand-cyan">Uploading CV…</p>
          )}
          {uploadStatus === "success" && (
            <p className="mt-3 text-sm text-brand-mint">CV uploaded.</p>
          )}
          {uploadStatus === "degraded" && (
            <p className="mt-3 text-sm text-brand-mint">
              Storage is currently unconfigured. Saved profile without the CV.
            </p>
          )}
          {uploadStatus === "error" && (
            <p className="mt-3 text-sm text-red-400">Failed to upload CV. You can retry later.</p>
          )}
        </div>
      </section>

      <div className="pt-8 border-t border-white/5 flex items-center justify-between">
        <Link
          href="/analyze"
          className="text-sm font-medium text-fog hover:text-white transition-colors"
        >
          Skip for now
        </Link>
        <Button type="submit" disabled={saving || !displayName.trim()}>
          {saving ? "Saving..." : "Save and analyze"}
        </Button>
      </div>
    </form>
  );
}

export default function OnboardingProfilePage() {
  return (
    <main className="flex min-h-screen items-center justify-center  p-6 relative">
      {/* Glow */}
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-brand-blue/10 blur-[150px] rounded-full pointer-events-none"></div>

      <div className="w-full max-w-3xl relative z-10 py-12">
        <div className="flex justify-center mb-10">
          <Link href="/" className="inline-block transition-transform hover:scale-105">
            <div className="relative w-56 h-20">
              <Image src="/assets/logo.png" alt="AI5K Logo" fill className="object-contain" />
            </div>
          </Link>
        </div>

        <div className="bg-surface-elevated/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 md:p-12 shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5 mix-blend-overlay pointer-events-none"></div>

          <div className="relative z-10">
            <div className="flex items-start justify-between mb-10">
              <div>
                <h1 className="font-display text-3xl font-bold text-white mb-2">Get a sharper report</h1>
                <p className="text-fog">
                  Add your CV, headline, and portfolio links — the more we have, the better your analysis.
                </p>
              </div>
              <Link
                href="/analyze"
                className="text-sm font-medium text-fog hover:text-white transition-colors underline underline-offset-4 hidden sm:block"
              >
                Skip for now
              </Link>
            </div>

            <Suspense fallback={<div className="text-fog">Loading form...</div>}>
              <OnboardingForm />
            </Suspense>
          </div>
        </div>
      </div>
    </main>
  );
}

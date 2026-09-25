"use client";

// My profile — UF-5. GET /profiles/me + PATCH /profiles/{id}.

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import Button from "@/components/ui/Button";
import { Chip, Field, inputClass, MonoLabel, Notice, PageHeader, Spinner } from "@/components/ui/Bits";
import {
  describeApiError,
  getMyProfile,
  normalizeUrl,
  updateProfile,
  type ProfileRead,
} from "@/lib/api-helpers";

function ProfileForm({ profile }: { profile: ProfileRead }) {
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [headline, setHeadline] = useState(profile.headline ?? "");
  const [visibility, setVisibility] = useState(profile.visibility);
  const [jobRoles, setJobRoles] = useState(profile.job_roles.join(", "));
  const [links, setLinks] = useState(profile.portfolio_links.map((l) => ({ ...l })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      await updateProfile(profile.id, {
        display_name: displayName.trim(),
        headline: headline.trim(),
        visibility,
        job_roles: jobRoles.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10),
        portfolio_links: links
          .filter((l) => l.label.trim() && l.url.trim())
          .map((l) => ({ label: l.label.trim().slice(0, 100), url: normalizeUrl(l.url) }))
          .slice(0, 20),
      });
      setSaved(true);
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <Notice kind="error">{error}</Notice>}
      {saved && <Notice kind="ok">Profile saved.</Notice>}

      <div className="grid md:grid-cols-2 gap-5">
        <Field label="Display name" htmlFor="pName" required>
          <input id="pName" type="text" required maxLength={255} value={displayName}
            onChange={(e) => setDisplayName(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Visibility" htmlFor="pVis">
          <select id="pVis" value={visibility} onChange={(e) => setVisibility(e.target.value as "private" | "public")} className={inputClass}>
            <option value="private">Private — only you and admins</option>
            <option value="public">Public — anyone on the network</option>
          </select>
        </Field>
      </div>

      <Field label="Headline" htmlFor="pHeadline" hint="role + industry + outcome">
        <input id="pHeadline" type="text" maxLength={255} value={headline}
          onChange={(e) => setHeadline(e.target.value)} className={inputClass} />
      </Field>

      <Field label="Job roles" htmlFor="pRoles" hint="comma-separated, up to 10">
        <input id="pRoles" type="text" placeholder="ML Engineer, Data Scientist" value={jobRoles}
          onChange={(e) => setJobRoles(e.target.value)} className={inputClass} />
      </Field>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-white">Portfolio links</span>
          <button type="button" onClick={() => links.length < 20 && setLinks([...links, { label: "", url: "" }])}
            className="text-sm text-blue underline underline-offset-4">
            + Add link
          </button>
        </div>
        {links.length === 0 && <p className="text-sm text-muted">No links yet.</p>}
        <div className="space-y-2">
          {links.map((link, i) => (
            <div key={i} className="flex gap-2">
              <input type="text" placeholder="Label" maxLength={100} value={link.label} aria-label={`Link ${i + 1} label`}
                onChange={(e) => setLinks(links.map((l, idx) => (idx === i ? { ...l, label: e.target.value } : l)))}
                className="w-40 bg-void border border-white/10 rounded-sm px-3 py-2 text-white" />
              <input type="text" inputMode="url" placeholder="example.com/page" value={link.url} aria-label={`Link ${i + 1} URL`}
                onChange={(e) => setLinks(links.map((l, idx) => (idx === i ? { ...l, url: e.target.value } : l)))}
                className="flex-1 bg-void border border-white/10 rounded-sm px-3 py-2 text-white" />
              <button type="button" onClick={() => setLinks(links.filter((_, idx) => idx !== i))}
                className="px-3 text-muted hover:text-error-red" aria-label={`Remove link ${i + 1}`}>✕</button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-5 pt-4 border-t border-white/10">
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        <Link href={`/profiles/${profile.id}`} className="text-sm text-blue underline underline-offset-4">
          View public page →
        </Link>
      </div>
    </form>
  );
}

function MyProfileInner() {
  const [profile, setProfile] = useState<ProfileRead | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "no-profile" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    getMyProfile()
      .then((p) => { setProfile(p); setLoadState("ready"); })
      .catch((err) => {
        if ((err as { code?: string }).code === "profile_not_found") setLoadState("no-profile");
        else { setError(describeApiError(err)); setLoadState("error"); }
      });
  }, []);

  if (loadState === "loading") {
    return <div className="flex justify-center py-24"><Spinner /></div>;
  }

  if (loadState === "no-profile") {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md text-center border border-white/10 rounded-md p-10 bg-void">
          <h1 className="text-card-heading font-display text-white mb-3">No profile yet</h1>
          <p className="text-muted mb-6">Create yours to join the network.</p>
          <Link href="/onboarding/profile"><Button>Create profile</Button></Link>
        </div>
      </main>
    );
  }

  if (loadState === "error") {
    return (
      <main className="max-w-3xl mx-auto px-6 py-16"><Notice kind="error">{error}</Notice></main>
    );
  }

  return (
    <main className="max-w-text mx-auto px-6 py-12">
      <PageHeader eyebrow="Signed in" title="My profile" />
      {profile && (
        <div className="bg-void border border-white/10 rounded-md p-8">
          <ProfileForm profile={profile} />
        </div>
      )}
    </main>
  );
}

export default function MyProfilePage() {
  return (
    <AppShell>
      <MyProfileInner />
    </AppShell>
  );
}

"use client";

// My profile — view + edit (REVIEW.md item 1.2).
// GET /profiles/me, PATCH /profiles/{id}. Owner fields are server-side;
// the editable set is display_name, headline, job_roles, portfolio_links,
// visibility.

import { useEffect, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { useAuth } from "@/lib/auth-context";
import AppShell from "@/components/layout/AppShell";
import { ApiError } from "@/lib/api";
import {
  getMyProfile,
  updateProfile,
  type ProfileRead,
} from "@/lib/api-helpers";

// Backend requires ^https?:// — normalize scheme-less input.
function normalizeUrl(u: string): string {
  const t = u.trim();
  return t && !/^https?:\/\//i.test(t) ? `https://${t}` : t;
}

function describeValidationError(err: unknown): string {
  if (
    err instanceof ApiError &&
    err.status === 422 &&
    err.details &&
    typeof err.details === "object"
  ) {
    const entries = Object.entries(err.details as Record<string, string>);
    if (entries.length > 0) {
      return entries.map(([f, m]) => `${f}: ${m}`).join(" · ");
    }
  }
  return (err as Error).message || "Failed to save";
}

function ProfileForm({ profile }: { profile: ProfileRead }) {
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [headline, setHeadline] = useState(profile.headline ?? "");
  const [visibility, setVisibility] = useState(profile.visibility);
  const [jobRoles, setJobRoles] = useState(profile.job_roles.join(", "));
  const [links, setLinks] = useState(
    profile.portfolio_links.map((l) => ({ label: l.label, url: l.url })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const addLink = () => {
    if (links.length < 20) setLinks([...links, { label: "", url: "" }]);
  };
  const removeLink = (i: number) => setLinks(links.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      const job_roles = jobRoles
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10);
      const portfolio_links = links
        .filter((l) => l.label.trim() && l.url.trim())
        .map((l) => ({ label: l.label.trim().slice(0, 100), url: normalizeUrl(l.url) }))
        .slice(0, 20);
      await updateProfile(profile.id, {
        display_name: displayName,
        headline,
        job_roles,
        portfolio_links,
        visibility,
      });
      setSaved(true);
    } catch (err) {
      setError(describeValidationError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}
      {saved && (
        <div className="p-3 rounded-lg bg-brand-mint/10 border border-brand-mint/20 text-brand-mint text-sm">
          Profile saved.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-fog mb-1.5" htmlFor="displayName">
            Display name <span className="text-red-400">*</span>
          </label>
          <input
            id="displayName" type="text" required maxLength={255}
            value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            className="w-full bg-void border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan transition-shadow"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-fog mb-1.5" htmlFor="visibility">
            Visibility
          </label>
          <select
            id="visibility" value={visibility}
            onChange={(e) => setVisibility(e.target.value as "private" | "public")}
            className="w-full bg-void border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan"
          >
            <option value="private">Private — only you and admins</option>
            <option value="public">Public — anyone on the network</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-fog mb-1.5" htmlFor="headline">
          Headline
        </label>
        <input
          id="headline" type="text" maxLength={255}
          placeholder="e.g. Senior AI Engineer"
          value={headline} onChange={(e) => setHeadline(e.target.value)}
          className="w-full bg-void border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan transition-shadow"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-fog mb-1.5" htmlFor="jobRoles">
          Job roles <span className="text-fog/60">(comma-separated, up to 10)</span>
        </label>
        <input
          id="jobRoles" type="text"
          placeholder="ML Engineer, Data Scientist"
          value={jobRoles} onChange={(e) => setJobRoles(e.target.value)}
          className="w-full bg-void border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan transition-shadow"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-fog">Portfolio links</span>
          <button
            type="button" onClick={addLink} disabled={links.length >= 20}
            className="text-sm text-brand-cyan hover:text-white disabled:opacity-40"
          >
            + Add link
          </button>
        </div>
        {links.length === 0 && (
          <p className="text-sm text-fog">No links yet.</p>
        )}
        <div className="space-y-2">
          {links.map((link, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text" placeholder="Label" maxLength={100}
                value={link.label}
                onChange={(e) =>
                  setLinks(links.map((l, idx) => (idx === i ? { ...l, label: e.target.value } : l)))
                }
                className="w-40 bg-void border border-white/10 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-brand-cyan"
              />
              <input
                type="text" inputMode="url" placeholder="example.com/page"
                value={link.url}
                onChange={(e) =>
                  setLinks(links.map((l, idx) => (idx === i ? { ...l, url: e.target.value } : l)))
                }
                className="flex-1 bg-void border border-white/10 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-brand-cyan"
              />
              <button
                type="button" onClick={() => removeLink(i)}
                className="px-3 text-fog hover:text-red-400"
                aria-label={`Remove link ${link.label || i + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 pt-4 border-t border-white/5">
        <Button type="submit" disabled={saving || !displayName.trim()}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        <Link href={`/profiles/${profile.id}`} className="text-sm text-fog hover:text-white">
          View public page →
        </Link>
      </div>
    </form>
  );
}

function MyProfilePageInner() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileRead | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyProfile()
      .then(setProfile)
      .catch((err) => {
        if (err instanceof ApiError && err.code === "profile_not_found") {
          setError("no-profile");
        } else {
          setError((err as Error).message || "Failed to load profile");
        }
      })
      .finally(() => setLoading(false));
  }, []);

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
          <p className="text-fog mb-6">Create yours to join the network.</p>
          <Link href="/onboarding/profile">
            <Button>Create profile</Button>
          </Link>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      </main>
    );
  }

  return (
    <main className="py-12 px-6 relative">
      <div className="absolute top-0 right-0 w-[700px] h-[700px] bg-brand-blue/10 blur-[150px] rounded-full pointer-events-none" />
      <div className="max-w-3xl mx-auto relative z-10">
        <div className="mb-10">
          <p className="text-sm text-fog mb-2">
            Signed in as {user?.email}
          </p>
          <h1 className="font-display text-3xl font-bold text-white">My profile</h1>
        </div>
        {profile && (
          <div className="bg-surface-elevated/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
            <ProfileForm profile={profile} />
          </div>
        )}
      </div>
    </main>
  );
}

export default function MyProfilePage() {
  return (
    <AppShell>
      <MyProfilePageInner />
    </AppShell>
  );
}

"use client";

// Organizations hub — list mine + create new (REVIEW.md items 2.1 + list).
// POST /organizations → 409 slug_taken, 422 invalid_slug.
// GET /organizations, GET /organizations/invitations for the inbox badge.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import AppShell from "@/components/layout/AppShell";
import { ApiError } from "@/lib/api";
import {
  createOrganization,
  describeApiError,
  listMyInvitations,
  listMyOrganizations,
  slugifyOrgName,
  type Invitation,
  type Organization,
} from "@/lib/api-helpers";

function CreateOrgForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // Auto-suggest the slug from the name until the user edits it manually.
  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugTouched) setSlug(slugifyOrgName(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      const org = await createOrganization({
        name: name.trim(),
        slug: slug.trim() || undefined,
        description: description.trim() || undefined,
        website_url: websiteUrl.trim() || undefined,
      });
      router.push(`/organizations/${org.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === "slug_taken") {
        setError("That URL slug is already taken — pick another one.");
      } else {
        setError(describeApiError(err));
      }
      setCreating(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface-elevated/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 space-y-5"
    >
      <h2 className="font-display text-xl font-bold text-white">Create an organization</h2>
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-fog mb-1.5" htmlFor="orgName">
            Name <span className="text-red-400">*</span>
          </label>
          <input
            id="orgName" type="text" required maxLength={255}
            placeholder="e.g. Acme AI Collective"
            value={name} onChange={(e) => handleNameChange(e.target.value)}
            className="w-full bg-void border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-fog mb-1.5" htmlFor="orgSlug">
            Slug <span className="text-fog/60">(permanent URL — immutable)</span>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-fog/60 text-sm">/organizations/</span>
            <input
              id="orgSlug" type="text" maxLength={128}
              placeholder="acme-ai"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              title="Lowercase letters, digits, and dashes only"
              value={slug}
              onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }}
              className="flex-1 bg-void border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-fog mb-1.5" htmlFor="orgDesc">
          Description
        </label>
        <textarea
          id="orgDesc" rows={3} maxLength={2000}
          placeholder="What does your organization do?"
          value={description} onChange={(e) => setDescription(e.target.value)}
          className="w-full bg-void border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-fog mb-1.5" htmlFor="orgWebsite">
          Website
        </label>
        <input
          id="orgWebsite" type="text" inputMode="url" maxLength={2048}
          placeholder="https://example.com"
          value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)}
          className="w-full bg-void border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan"
        />
      </div>

      <div className="pt-2">
        <Button type="submit" disabled={creating || !name.trim()}>
          {creating ? "Creating…" : "Create organization"}
        </Button>
        <p className="text-xs text-fog mt-3">
          You become the org admin. Members join by invitation and must consent before their
          skills appear in the aggregate view.
        </p>
      </div>
    </form>
  );
}

function OrganizationsPageInner() {
  const [orgs, setOrgs] = useState<Organization[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([listMyOrganizations(), listMyInvitations()])
      .then(([orgList, invites]) => {
        setOrgs(orgList);
        setInvitations(invites);
      })
      .catch((err) => setError(describeApiError(err)));
  }, []);

  return (
    <main className="py-12 px-6 relative">
      <div className="absolute top-0 right-0 w-[700px] h-[700px] bg-brand-blue/10 blur-[150px] rounded-full pointer-events-none" />
      <div className="max-w-3xl mx-auto relative z-10 space-y-10">
        <header>
          <h1 className="font-display text-3xl font-bold text-white">Organizations</h1>
          <p className="text-fog mt-2">Teams you belong to, or create your own.</p>
        </header>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {invitations.length > 0 && (
          <Link
            href="/organizations/invitations"
            className="block p-4 rounded-xl bg-brand-blue/10 border border-brand-blue/30 hover:border-brand-blue/60 transition-colors"
          >
            <span className="text-white font-medium">
              📬 {invitations.length} pending invitation{invitations.length > 1 ? "s" : ""}
            </span>
            <span className="text-fog text-sm ml-2">— review and respond →</span>
          </Link>
        )}

        {orgs === null ? (
          <div className="flex justify-center py-12">
            <div className="w-12 h-12 rounded-full border-4 border-brand-cyan/20 border-t-brand-cyan animate-spin" />
          </div>
        ) : orgs.length > 0 ? (
          <div className="space-y-3">
            {orgs.map((org) => (
              <Link
                key={org.id}
                href={`/organizations/${org.id}`}
                className="block p-5 rounded-xl bg-surface-card border border-surface-card-border hover:border-brand-cyan/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-white font-semibold">{org.name}</p>
                    <p className="text-sm text-fog mt-0.5">
                      /organizations/{org.slug}
                      {org.description ? ` · ${org.description.slice(0, 80)}${org.description.length > 80 ? "…" : ""}` : ""}
                    </p>
                  </div>
                  <span className="text-xs uppercase tracking-wider px-2 py-1 rounded bg-void text-fog border border-white/10">
                    {org.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-fog">You&apos;re not part of any organization yet.</p>
        )}

        <CreateOrgForm />
      </div>
    </main>
  );
}

export default function OrganizationsPage() {
  return (
    <AppShell>
      <OrganizationsPageInner />
    </AppShell>
  );
}

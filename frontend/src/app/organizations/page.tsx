"use client";

// Organizations hub — UF-8a. POST /organizations (creator becomes org_admin);
// slug auto-suggested, immutable after create. 409 slug_taken / 422 invalid_slug.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import Button from "@/components/ui/Button";
import { Chip, Field, inputClass, Notice, PageHeader, Spinner } from "@/components/ui/Bits";
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setCreating(true);
    try {
      const org = await createOrganization({
        name: name.trim(),
        slug: slug.trim() || undefined,
        description: description.trim() || undefined,
        website_url: websiteUrl.trim() || undefined,
      });
      router.push(`/organizations/${org.id}`);
    } catch (err) {
      if ((err as { code?: string }).code === "slug_taken") {
        setError("That URL slug is already taken — pick another one.");
      } else {
        setError(describeApiError(err));
      }
      setCreating(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-void border border-white/10 rounded-md p-8 space-y-5">
      <h2 className="text-feature-heading font-display text-white">Create an organization</h2>
      {error && <Notice kind="error">{error}</Notice>}

      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Name" htmlFor="orgName" required>
          <input id="orgName" type="text" required maxLength={255} placeholder="e.g. Nova Solutions"
            value={name}
            onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugifyOrgName(e.target.value)); }}
            className={inputClass} />
        </Field>
        <Field label="Slug" htmlFor="orgSlug" hint="(permanent URL — immutable)">
          <input id="orgSlug" type="text" maxLength={128} placeholder="nova-solutions"
            pattern="[a-z0-9]+(-[a-z0-9]+)*" title="Lowercase letters, digits, and dashes only"
            value={slug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }}
            className={inputClass} />
        </Field>
      </div>
      <Field label="Description" htmlFor="orgDesc">
        <textarea id="orgDesc" rows={3} maxLength={2000} value={description}
          onChange={(e) => setDescription(e.target.value)} className={inputClass} />
      </Field>
      <Field label="Website" htmlFor="orgSite" hint="https:// added on the server if missing">
        <input id="orgSite" type="text" inputMode="url" maxLength={2048} placeholder="https://example.com"
          value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} className={inputClass} />
      </Field>
      <div>
        <Button type="submit" disabled={creating || !name.trim()}>
          {creating ? "Creating…" : "Create organization"}
        </Button>
        <p className="text-xs text-muted mt-3">
          You become the org admin. Members join by invitation and must consent before their skills appear in the aggregate view.
        </p>
      </div>
    </form>
  );
}

function OrgsInner() {
  const [orgs, setOrgs] = useState<Organization[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([listMyOrganizations(), listMyInvitations()])
      .then(([orgList, invites]) => { setOrgs(orgList); setInvitations(invites); })
      .catch((err) => setError(describeApiError(err)));
  }, []);

  return (
    <main className="max-w-text mx-auto px-6 py-12">
      <PageHeader eyebrow="Teams" title="Organizations" lede="Agencies and teams you belong to — or create your own." />

      {error && <div className="mb-6"><Notice kind="error">{error}</Notice></div>}

      {invitations.length > 0 && (
        <Link href="/organizations/invitations"
          className="block p-4 rounded-sm border border-coral/40 bg-coral/5 hover:bg-coral/10 transition-colors mb-8">
          <span className="text-white font-medium">
            {invitations.length} pending invitation{invitations.length > 1 ? "s" : ""}
          </span>
          <span className="text-muted text-sm ml-2">— review and respond →</span>
        </Link>
      )}

      {orgs === null ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : orgs.length > 0 ? (
        <div className="divide-y divide-hairline border-y border-white/10 mb-10">
          {orgs.map((org) => (
            <Link key={org.id} href={`/organizations/${org.id}`}
              className="flex items-center justify-between gap-4 py-4 hover:bg-navy/40 transition-colors">
              <div>
                <p className="text-white font-medium">{org.name}</p>
                <p className="text-sm text-muted">
                  /organizations/{org.slug}
                  {org.description ? ` · ${org.description.slice(0, 80)}${org.description.length > 80 ? "…" : ""}` : ""}
                </p>
              </div>
              <Chip>{org.status}</Chip>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-muted mb-10">You&apos;re not part of any organization yet.</p>
      )}

      <CreateOrgForm />
    </main>
  );
}

export default function OrganizationsPage() {
  return (
    <AppShell>
      <OrgsInner />
    </AppShell>
  );
}

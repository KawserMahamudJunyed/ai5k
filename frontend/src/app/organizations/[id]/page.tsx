"use client";

// Org overview — UF-8b. GET/PATCH /organizations/{id}. Slug immutable.
// 403 → "Private organization" state.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import Button from "@/components/ui/Button";
import OrgTabNav from "@/components/org/OrgTabNav";
import { Chip, Field, inputClass, Notice, Spinner } from "@/components/ui/Bits";
import { usePermissions } from "@/lib/auth-context";
import { describeApiError, getOrganization, updateOrganization, type Organization } from "@/lib/api-helpers";

function OrgOverviewInner({ orgId }: { orgId: string }) {
  const { hasRole, isPlatformAdmin } = usePermissions();
  const [org, setOrg] = useState<Organization | null>(null);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const load = useCallback(() => {
    getOrganization(orgId)
      .then((o) => { setOrg(o); setName(o.name); setDescription(o.description ?? ""); setWebsiteUrl(o.website_url ?? ""); })
      .catch((err) => {
        const status = (err as { status?: number }).status;
        if (status === 403) setLoadError("private");
        else if (status === 404) setLoadError("not-found");
        else setLoadError(describeApiError(err));
      });
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(""); setSaving(true);
    try {
      const updated = await updateOrganization(orgId, {
        name: name.trim(),
        description: description.trim(),
        website_url: websiteUrl.trim(),
      });
      setOrg(updated);
      setEditing(false);
    } catch (err) {
      setSaveError(describeApiError(err));
    } finally {
      setSaving(false);
    }
  };

  if (loadError === "private") {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md text-center border border-white/10 rounded-md p-10 bg-void">
          <h1 className="text-card-heading font-display text-white mb-3">Private organization</h1>
          <p className="text-muted mb-6">You&apos;re not a member of this organization.</p>
          <Link href="/organizations" className="text-blue underline underline-offset-4">← Your organizations</Link>
        </div>
      </main>
    );
  }
  if (loadError === "not-found") {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md text-center border border-white/10 rounded-md p-10 bg-void">
          <h1 className="text-card-heading font-display text-white mb-3">Organization not found</h1>
          <Link href="/organizations" className="text-blue underline underline-offset-4">← Your organizations</Link>
        </div>
      </main>
    );
  }
  if (loadError) {
    return <main className="max-w-3xl mx-auto px-6 py-16"><Notice kind="error">{loadError}</Notice></main>;
  }
  if (!org) return <div className="flex justify-center py-24"><Spinner /></div>;

  const isAdmin = hasRole("org_admin", orgId) || isPlatformAdmin;

  return (
    <main className="max-w-text mx-auto px-6 py-12">
      <header className="mb-8">
        <p className="font-mono text-micro text-muted mb-2">/organizations/{org.slug}</p>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h1 className="text-section-heading font-display text-white">{org.name}</h1>
          {isAdmin && (
            <Button variant="outline" onClick={() => setEditing(!editing)}>{editing ? "Cancel" : "Edit"}</Button>
          )}
        </div>
      </header>

      <OrgTabNav orgId={orgId} />

      {saveError && <div className="mb-6"><Notice kind="error">{saveError}</Notice></div>}

      {editing ? (
        <form onSubmit={handleSave} className="bg-void border border-white/10 rounded-md p-8 space-y-5">
          <Field label="Name" htmlFor="oName" required>
            <input id="oName" type="text" required maxLength={255} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Description" htmlFor="oDesc">
            <textarea id="oDesc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Website" htmlFor="oSite">
            <input id="oSite" type="text" inputMode="url" maxLength={2048} value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} className={inputClass} />
          </Field>
          <div className="flex gap-3">
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div className="border-y border-white/10 divide-y divide-hairline">
          <div className="py-4"><p className="text-sm text-muted">Description</p>
            <p className="text-white mt-1">{org.description || <span className="text-muted italic">None yet.</span>}</p></div>
          <div className="py-4"><p className="text-sm text-muted">Website</p>
            {org.website_url ? (
              <a href={org.website_url} target="_blank" rel="noopener noreferrer" className="text-blue underline underline-offset-4 break-all">{org.website_url}</a>
            ) : <p className="text-muted italic mt-1">None yet.</p>}</div>
          <div className="py-4 flex items-center gap-4"><p className="text-sm text-muted">Status</p><Chip>{org.status}</Chip></div>
          <div className="py-4"><p className="text-sm text-muted">Created</p>
            <p className="text-white mt-1">{new Date(org.created_at).toLocaleDateString()}</p></div>
        </div>
      )}
    </main>
  );
}

export default function OrgOverviewPage() {
  const params = useParams<{ id: string }>();
  return (
    <AppShell>
      <OrgOverviewInner orgId={params.id} />
    </AppShell>
  );
}

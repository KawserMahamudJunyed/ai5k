"use client";

// Org overview (REVIEW.md 2.2). GET /organizations/{id} (403 permission_denied
// for non-members), PATCH for org_admins. Slug is immutable — never editable.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import OrgTabNav from "@/components/org/OrgTabNav";
import AppShell from "@/components/layout/AppShell";
import Button from "@/components/ui/Button";
import { usePermissions } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import {
  describeApiError,
  getOrganization,
  updateOrganization,
  type Organization,
} from "@/lib/api-helpers";

function OrgOverviewInner({ orgId }: { orgId: string }) {
  const { hasRole } = usePermissions();
  const [org, setOrg] = useState<Organization | null>(null);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    getOrganization(orgId)
      .then((o) => {
        setOrg(o);
        setName(o.name);
        setDescription(o.description ?? "");
        setWebsiteUrl(o.website_url ?? "");
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) {
          setLoadError("private");
        } else if (err instanceof ApiError && err.status === 404) {
          setLoadError("not-found");
        } else {
          setLoadError(describeApiError(err));
        }
      });
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError("");
    setSaved(false);
    setSaving(true);
    try {
      const updated = await updateOrganization(orgId, {
        name: name.trim(),
        description: description.trim(),
        website_url: websiteUrl.trim(),
      });
      setOrg(updated);
      setSaved(true);
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
        <div className="max-w-md text-center bg-surface-elevated/80 border border-white/10 rounded-2xl p-10">
          <h1 className="font-display text-2xl font-bold text-white mb-3">Private organization</h1>
          <p className="text-fog mb-6">You&apos;re not a member of this organization.</p>
          <Link href="/organizations" className="text-brand-cyan hover:text-white">
            ← Your organizations
          </Link>
        </div>
      </main>
    );
  }
  if (loadError === "not-found") {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md text-center bg-surface-elevated/80 border border-white/10 rounded-2xl p-10">
          <h1 className="font-display text-2xl font-bold text-white mb-3">Organization not found</h1>
          <Link href="/organizations" className="text-brand-cyan hover:text-white">
            ← Your organizations
          </Link>
        </div>
      </main>
    );
  }
  if (loadError) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{loadError}</div>
      </main>
    );
  }
  if (!org) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-12 h-12 rounded-full border-4 border-brand-cyan/20 border-t-brand-cyan animate-spin" />
      </div>
    );
  }

  const isAdmin = hasRole("org_admin", orgId) || hasRole("platform_admin");

  return (
    <main className="py-12 px-6 relative">
      <div className="absolute top-0 right-0 w-[700px] h-[700px] bg-brand-blue/10 blur-[150px] rounded-full pointer-events-none" />
      <div className="max-w-3xl mx-auto relative z-10">
        <header className="mb-8">
          <p className="text-sm text-fog mb-2">/organizations/{org.slug}</p>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h1 className="font-display text-3xl font-bold text-white">{org.name}</h1>
            {isAdmin && (
              <Button variant="secondary" onClick={() => setEditing(!editing)}>
                {editing ? "Cancel" : "Edit"}
              </Button>
            )}
          </div>
        </header>

        <OrgTabNav orgId={orgId} />

        {saveError && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-6">{saveError}</div>
        )}

        {editing ? (
          <form onSubmit={handleSave} className="bg-surface-elevated/80 border border-white/10 rounded-2xl p-8 space-y-5">
            {saved && (
              <div className="p-3 rounded-lg bg-brand-mint/10 border border-brand-mint/20 text-brand-mint text-sm">
                Saved.
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-fog mb-1.5" htmlFor="orgEditName">
                Name
              </label>
              <input
                id="orgEditName" type="text" required maxLength={255} value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-void border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-fog mb-1.5" htmlFor="orgEditDesc">
                Description
              </label>
              <textarea
                id="orgEditDesc" rows={3} value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-void border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-fog mb-1.5" htmlFor="orgEditWebsite">
                Website
              </label>
              <input
                id="orgEditWebsite" type="text" inputMode="url" maxLength={2048} value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                className="w-full bg-void border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
              <Button variant="secondary" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="bg-surface-elevated/80 border border-white/10 rounded-2xl p-8 space-y-4">
            <div>
              <p className="text-sm text-fog">Description</p>
              <p className="text-white">
                {org.description || <span className="text-fog italic">None yet.</span>}
              </p>
            </div>
            <div>
              <p className="text-sm text-fog">Website</p>
              {org.website_url ? (
                <a
                  href={org.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-cyan hover:text-white break-all"
                >
                  {org.website_url}
                </a>
              ) : (
                <p className="text-fog italic">None yet.</p>
              )}
            </div>
            <div>
              <p className="text-sm text-fog">Status</p>
              <p className="text-white capitalize">{org.status}</p>
            </div>
            <div>
              <p className="text-sm text-fog">Created</p>
              <p className="text-white">{new Date(org.created_at).toLocaleDateString()}</p>
            </div>
          </div>
        )}
      </div>
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

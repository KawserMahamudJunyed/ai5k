"use client";

// Members admin — UF-8c. Invite by email (account must exist; backend sends
// no email — UI surfaces the "share the site URL" instruction).

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import Button from "@/components/ui/Button";
import OrgTabNav from "@/components/org/OrgTabNav";
import { Chip, Field, inputClass, Notice, PageHeader, Spinner } from "@/components/ui/Bits";
import { usePermissions } from "@/lib/auth-context";
import { describeApiError, inviteMember, listMembers, removeMember, type OrgMember } from "@/lib/api-helpers";

function MembersInner({ orgId }: { orgId: string }) {
  const { hasRole, isPlatformAdmin } = usePermissions();
  const [members, setMembers] = useState<OrgMember[] | null>(null);
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const isAdmin = hasRole("org_admin", orgId) || isPlatformAdmin;

  const load = useCallback(() => {
    if (!isAdmin) return;
    listMembers(orgId)
      .then(setMembers)
      .catch((err) => {
        if ((err as { status?: number }).status === 403) setError("Only organization admins can view the members list.");
        else setError(describeApiError(err));
        setMembers([]);
      });
  }, [orgId, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setNotice(""); setInviting(true);
    try {
      const m = await inviteMember(orgId, email.trim());
      setMembers((prev) => (prev ? [...prev, m] : [m]));
      setNotice(`${m.user.full_name} (${m.user.email}) added — share the site URL with them; no email is sent. They'll find the org under Organizations.`);
      setEmail("");
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "member_exists") setError("That person is already a member (or already invited).");
      else if (code === "user_not_found") setError("No AI5K account uses that email yet — they need to sign up first.");
      else setError(describeApiError(err));
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (m: OrgMember) => {
    setError(""); setNotice("");
    try {
      await removeMember(orgId, m.id);
      setMembers((prev) => (prev ? prev.filter((x) => x.id !== m.id) : []));
    } catch (err) {
      if ((err as { code?: string }).code === "cannot_remove_self") setError("You can't remove yourself — ask another org admin.");
      else setError(describeApiError(err));
    }
  };

  if (!isAdmin) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md text-center border border-white/10 rounded-md p-10 bg-void">
          <h1 className="text-card-heading font-display text-white mb-3">Admins only</h1>
          <p className="text-muted">Members administration requires the org_admin role.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-text mx-auto px-6 py-12">
      <PageHeader eyebrow="Team" title="Members" lede="People in your organization and their consent status." />

      <OrgTabNav orgId={orgId} />

      <form onSubmit={handleInvite} className="bg-void border border-white/10 rounded-md p-6 mb-8 space-y-4">
        <Field label="Invite by email" htmlFor="invEmail" hint="(they must already have an AI5K account)">
          <div className="flex gap-2">
            <input id="invEmail" type="email" required placeholder="colleague@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            <Button type="submit" disabled={inviting}>{inviting ? "Adding…" : "Add member"}</Button>
          </div>
        </Field>
        {error && <Notice kind="error">{error}</Notice>}
        {notice && <Notice kind="ok">{notice}</Notice>}
      </form>

      {members === null ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : members.length === 0 ? (
        <p className="text-center py-16 text-muted border border-white/10 rounded-md">No members yet — invite someone above.</p>
      ) : (
        <div className="divide-y divide-hairline border-y border-white/10">
          {members.map((m) => (
            <div key={m.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4">
              <div>
                <p className="text-white font-medium">{m.user.full_name} <span className="text-muted text-sm">· {m.user.email}</span></p>
                <p className="text-xs text-muted mt-1">
                  {m.consent_given ? "Consented — skills appear in aggregate view" : "Awaiting consent — not yet visible in aggregate skills"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Chip tone={m.consent_given ? "green" : "neutral"}>{m.status}</Chip>
                <button type="button" onClick={() => handleRemove(m)} className="text-sm text-muted hover:text-error-red">Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

export default function OrgMembersPage() {
  const params = useParams<{ id: string }>();
  return (
    <AppShell>
      <MembersInner orgId={params.id} />
    </AppShell>
  );
}

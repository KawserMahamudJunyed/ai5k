"use client";

// Members admin (REVIEW.md 2.3). GET/POST/DELETE /organizations/{id}/members.
// Error codes: member_exists, cannot_remove_self, user_not_found, member_not_found.
// No backend email — invite confirmation is visible here only.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import OrgTabNav from "@/components/org/OrgTabNav";
import AppShell from "@/components/layout/AppShell";
import Button from "@/components/ui/Button";
import { usePermissions } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import {
  describeApiError,
  listMembers,
  inviteMember,
  removeMember,
  type OrgMember,
} from "@/lib/api-helpers";

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
        if (err instanceof ApiError && err.status === 403) {
          setError("Only organization admins can view the members list.");
        } else {
          setError(describeApiError(err));
        }
        setMembers([]);
      });
  }, [orgId, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setInviting(true);
    try {
      const m = await inviteMember(orgId, email.trim());
      setMembers((prev) => (prev ? [...prev, m] : [m]));
      setNotice(
        `${m.user.full_name} (${m.user.email}) added — share the site URL with them; the backend sends no email. They'll find the org under Organizations.`,
      );
      setEmail("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === "member_exists") {
        setError("That person is already a member (or already invited).");
      } else {
        setError(describeApiError(err));
      }
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (m: OrgMember) => {
    setError("");
    setNotice("");
    try {
      await removeMember(orgId, m.id);
      setMembers((prev) => (prev ? prev.filter((x) => x.id !== m.id) : []));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === "cannot_remove_self") {
        setError("You can't remove yourself — ask another org admin.");
      } else {
        setError(describeApiError(err));
      }
    }
  };

  if (!isAdmin) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md text-center bg-surface-elevated/80 border border-white/10 rounded-2xl p-10">
          <h1 className="font-display text-2xl font-bold text-white mb-3">Admins only</h1>
          <p className="text-fog">Members administration requires the org_admin role.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="py-12 px-6 relative">
      <div className="absolute top-0 right-0 w-[700px] h-[700px] bg-brand-blue/10 blur-[150px] rounded-full pointer-events-none" />
      <div className="max-w-3xl mx-auto relative z-10">
        <header className="mb-8">
          <h1 className="font-display text-3xl font-bold text-white">Members</h1>
          <p className="text-fog mt-2">People in your organization and their membership status.</p>
        </header>

        <OrgTabNav orgId={orgId} />

        <form
          onSubmit={handleInvite}
          className="mb-8 bg-surface-elevated/80 border border-white/10 rounded-2xl p-6 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-fog mb-1.5" htmlFor="inviteEmail">
              Invite by email{" "}
              <span className="text-fog/60">(they must already have an AI5K account)</span>
            </label>
            <div className="flex gap-2">
              <input
                id="inviteEmail" type="email" required
                placeholder="colleague@example.com"
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="flex-1 bg-void border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan"
              />
              <Button type="submit" disabled={inviting}>
                {inviting ? "Adding…" : "Add member"}
              </Button>
            </div>
          </div>
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}
          {notice && (
            <div className="p-3 rounded-lg bg-brand-mint/10 border border-brand-mint/20 text-brand-mint text-sm">
              {notice}
            </div>
          )}
        </form>

        <div className="space-y-2">
          {members === null ? (
            <div className="flex justify-center py-12">
              <div className="w-12 h-12 rounded-full border-4 border-brand-cyan/20 border-t-brand-cyan animate-spin" />
            </div>
          ) : members.length === 0 ? (
            <p className="text-fog">No members yet — invite someone above.</p>
          ) : (
            members.map((m) => (
              <div
                key={m.id}
                className="p-4 rounded-xl bg-surface-card border border-surface-card-border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <p className="text-white font-medium">
                    {m.user.full_name} <span className="text-fog text-sm">· {m.user.email}</span>
                  </p>
                  <p className="text-xs text-fog mt-1">
                    {m.consent_given
                      ? "Consented — skills appear in aggregate view"
                      : "Awaiting consent — not yet visible in aggregate skills"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs uppercase tracking-wider px-2 py-1 rounded border ${
                      m.consent_given
                        ? "bg-brand-mint/10 text-brand-mint border-brand-mint/20"
                        : "bg-void text-fog border-white/10"
                    }`}
                  >
                    {m.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemove(m)}
                    className="text-sm text-fog hover:text-red-400 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
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

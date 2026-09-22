"use client";

// Invitations inbox (REVIEW.md 2.4). GET /organizations/invitations +
// POST /organizations/{id}/members/me/consent. 409 not_pending → reload.
// Consent grants org-scoped `professional`, NOT org_admin.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import Button from "@/components/ui/Button";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import {
  describeApiError,
  giveConsent,
  listMyInvitations,
  type Invitation,
} from "@/lib/api-helpers";

function InvitationsInner() {
  const { refresh } = useAuth();
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    listMyInvitations()
      .then(setInvitations)
      .catch((err) => setError(describeApiError(err)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleConsent = async (inv: Invitation) => {
    setBusyId(inv.member_id);
    setError("");
    setNotice("");
    try {
      await giveConsent(inv.organization_id);
      setNotice(`You joined ${inv.organization_name}. Your skills can now appear in its aggregate view.`);
      // Consent granted → roles changed server-side; refresh the auth context.
      await refresh();
      setInvitations((prev) => (prev ? prev.filter((i) => i.member_id !== inv.member_id) : []));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === "not_pending") {
        setError("That invitation was already handled — refreshing.");
        load();
      } else {
        setError(describeApiError(err));
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="py-12 px-6 relative">
      <div className="absolute top-0 right-0 w-[700px] h-[700px] bg-brand-blue/10 blur-[150px] rounded-full pointer-events-none" />
      <div className="max-w-2xl mx-auto relative z-10">
        <header className="mb-8">
          <h1 className="font-display text-3xl font-bold text-white">Invitations</h1>
          <p className="text-fog mt-2">
            Organizations that added you. Accepting grants them a scoped view of your skills.
          </p>
        </header>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-6">
            {error}
          </div>
        )}
        {notice && (
          <div className="p-3 rounded-lg bg-brand-mint/10 border border-brand-mint/20 text-brand-mint text-sm mb-6">
            {notice}
          </div>
        )}

        {invitations === null ? (
          <div className="flex justify-center py-16">
            <div className="w-12 h-12 rounded-full border-4 border-brand-cyan/20 border-t-brand-cyan animate-spin" />
          </div>
        ) : invitations.length === 0 ? (
          <div className="bg-surface-elevated/80 border border-white/10 rounded-2xl p-10 text-center">
            <p className="text-fog mb-6">No pending invitations.</p>
            <Link href="/organizations" className="text-brand-cyan hover:text-white">
              ← Your organizations
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {invitations.map((inv) => (
              <div
                key={inv.member_id}
                className="p-6 rounded-2xl bg-surface-card border border-surface-card-border flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div>
                  <p className="text-white font-semibold text-lg">{inv.organization_name}</p>
                  <p className="text-sm text-fog mt-1">
                    Consenting lets this organization see an aggregate view of your skills —
                    proficiency levels and evidence counts. You can be removed at any time.
                  </p>
                </div>
                <Button
                  onClick={() => handleConsent(inv)}
                  disabled={busyId === inv.member_id}
                >
                  {busyId === inv.member_id ? "Joining…" : "Join"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export default function InvitationsPage() {
  return (
    <AppShell>
      <InvitationsInner />
    </AppShell>
  );
}

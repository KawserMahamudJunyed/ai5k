"use client";

// Invitations inbox — UF-8d. Consent grants org-scoped professional role
// (NOT org_admin) — session roles refresh after joining.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import Button from "@/components/ui/Button";
import { Notice, PageHeader, Spinner } from "@/components/ui/Bits";
import { useAuth } from "@/lib/auth-context";
import { describeApiError, giveConsent, listMyInvitations, type Invitation } from "@/lib/api-helpers";

function InvitationsInner() {
  const { refresh } = useAuth();
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    listMyInvitations().then(setInvitations).catch((err) => setError(describeApiError(err)));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleConsent = async (inv: Invitation) => {
    setBusyId(inv.member_id); setError(""); setNotice("");
    try {
      await giveConsent(inv.organization_id);
      setNotice(`You joined ${inv.organization_name}. Your skills can now appear in its aggregate view.`);
      await refresh(); // roles changed server-side
      setInvitations((prev) => (prev ? prev.filter((i) => i.member_id !== inv.member_id) : []));
    } catch (err) {
      if ((err as { code?: string }).code === "not_pending") {
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
    <main className="max-w-text mx-auto px-6 py-12">
      <PageHeader eyebrow="Membership" title="Invitations"
        lede="Organizations that added you. Accepting grants them a scoped aggregate view of your skills." />

      {error && <div className="mb-6"><Notice kind="error">{error}</Notice></div>}
      {notice && <div className="mb-6"><Notice kind="ok">{notice}</Notice></div>}

      {invitations === null ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : invitations.length === 0 ? (
        <div className="border border-hairline rounded-md p-10 text-center bg-canvas">
          <p className="text-muted mb-6">No pending invitations.</p>
          <Link href="/organizations" className="text-blue underline underline-offset-4">← Your organizations</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {invitations.map((inv) => (
            <div key={inv.member_id}
              className="border border-hairline rounded-md p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-canvas">
              <div>
                <p className="text-ink font-medium text-lg">{inv.organization_name}</p>
                <p className="text-sm text-muted mt-1">
                  Consenting lets this organization see an aggregate view of your skills — proficiency levels and
                  evidence counts. You can be removed at any time.
                </p>
              </div>
              <Button onClick={() => handleConsent(inv)} disabled={busyId === inv.member_id}>
                {busyId === inv.member_id ? "Joining…" : "Join"}
              </Button>
            </div>
          ))}
        </div>
      )}
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

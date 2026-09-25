"use client";

// Verification queue — UF-9a. verification:review to list, verification:approve
// to decide. Decision-once: 409 already_decided → reload row.

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import Button from "@/components/ui/Button";
import { Chip, Notice, PageHeader, Spinner, inputClass } from "@/components/ui/Bits";
import { usePermissions } from "@/lib/auth-context";
import { decideVerificationRequest, describeApiError, listVerificationRequests, type VerificationRequest } from "@/lib/api-helpers";

function QueueInner() {
  const { isPlatformAdmin, hasRole } = usePermissions();
  const [rows, setRows] = useState<VerificationRequest[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const canReview = isPlatformAdmin || hasRole("platform_admin");

  const load = useCallback(() => {
    listVerificationRequests("pending")
      .then((r) => setRows(r.data))
      .catch((err) => {
        if ((err as { status?: number }).status === 403) setError("You need the verification:review permission to see the queue.");
        else setError(describeApiError(err));
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (row: VerificationRequest, approved: boolean) => {
    setBusyId(row.id); setError(""); setNotice("");
    try {
      await decideVerificationRequest(row.id, approved, notes[row.id]);
      setNotice(`Request ${approved ? "approved" : "rejected"}.`);
      setRows((prev) => (prev ? prev.filter((r) => r.id !== row.id) : []));
    } catch (err) {
      if ((err as { code?: string }).code === "already_decided") {
        setError("That request was already decided — refreshing.");
        load();
      } else {
        setError(describeApiError(err));
      }
    } finally {
      setBusyId(null);
    }
  };

  if (!canReview) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md text-center border border-white/10 rounded-md p-10 bg-void">
          <h1 className="text-card-heading font-display text-white mb-3">Reviewers only</h1>
          <p className="text-muted">The verification queue requires platform review permissions.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-shell mx-auto px-6 py-12">
      <PageHeader eyebrow="Trust & quality" title="Verification queue"
        lede="Approve to elevate a claim to evidenced, or an evidence row to verified. Decisions are final." />

      {error && <div className="mb-6"><Notice kind="error">{error}</Notice></div>}
      {notice && <div className="mb-6"><Notice kind="ok">{notice}</Notice></div>}

      {rows === null ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : rows.length === 0 ? (
        <p className="text-center py-16 text-muted border border-white/10 rounded-md">Queue is clear. Nothing pending.</p>
      ) : (
        <div className="divide-y divide-hairline border-y border-white/10">
          {rows.map((row) => (
            <div key={row.id} className="py-5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <Chip tone={row.target_type === "profile_skill" ? "navy" : "coral"}>
                    {row.target_type === "profile_skill" ? "Skill claim" : "Identity doc"}
                  </Chip>
                  <span className="font-mono text-micro text-muted">
                    target {row.target_id.slice(0, 8)}… · filed {new Date(row.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => decide(row, true)} disabled={busyId === row.id} className="!bg-gradient-brand hover:!bg-[#00281f]">
                    {busyId === row.id ? "…" : "Approve"}
                  </Button>
                  <Button variant="danger" onClick={() => decide(row, false)} disabled={busyId === row.id}>
                    {busyId === row.id ? "…" : "Reject"}
                  </Button>
                </div>
              </div>
              <input
                type="text" placeholder="Optional note (visible in the audit log)"
                value={notes[row.id] ?? ""} aria-label={`Note for request ${row.id}`}
                onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
                className={`${inputClass} text-sm`}
              />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

export default function VerificationQueuePage() {
  return (
    <AppShell>
      <QueueInner />
    </AppShell>
  );
}

"use client";

// Aggregate skills — UF-8e. GET /organizations/{id}/skills (members only).

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import OrgTabNav from "@/components/org/OrgTabNav";
import { Notice, PageHeader, Spinner } from "@/components/ui/Bits";
import { describeApiError, getOrgSkills, type AggregateSkillRow } from "@/lib/api-helpers";

function Bar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted">{label}</span>
        <span className="text-white">{count}</span>
      </div>
      <div className="w-full h-1.5 bg-hairline/50 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-brand" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function OrgSkillsInner({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<AggregateSkillRow[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    getOrgSkills(orgId)
      .then(setRows)
      .catch((err) => {
        if ((err as { status?: number }).status === 403) setError("Only organization members can view the aggregate skills.");
        else setError(describeApiError(err));
      });
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  return (
    <main className="max-w-text mx-auto px-6 py-12">
      <PageHeader eyebrow="Capability" title="Aggregate skills"
        lede="What your organization can do, counted across consenting members." />

      <OrgTabNav orgId={orgId} />

      {error && <Notice kind="error">{error}</Notice>}

      {rows === null && !error ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : rows !== null && rows.length === 0 ? (
        <p className="text-center py-16 text-muted border border-white/10 rounded-md">
          No skill data yet — members must consent, and at least one member needs claimed skills.
        </p>
      ) : rows !== null ? (
        <div className="space-y-6">
          {rows.map((row) => (
            <div key={row.skill_id} className="border-b border-white/10 pb-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <p className="text-white font-medium">{row.name}</p>
                  {row.category && <p className="text-xs text-muted mt-0.5">{row.category}</p>}
                </div>
                <span className="font-mono text-micro text-muted uppercase">{row.member_count} member{row.member_count !== 1 ? "s" : ""}</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Bar label="Evidenced" count={row.evidenced_count} total={row.member_count} />
                <Bar label="Self-declared" count={row.self_declared_count} total={row.member_count} />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </main>
  );
}

export default function OrgSkillsPage() {
  const params = useParams<{ id: string }>();
  return (
    <AppShell>
      <OrgSkillsInner orgId={params.id} />
    </AppShell>
  );
}

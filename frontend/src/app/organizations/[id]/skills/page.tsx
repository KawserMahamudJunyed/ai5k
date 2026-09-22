"use client";

// Org aggregate skills (REVIEW.md 2.5). GET /organizations/{id}/skills —
// members see skill counts across consenting members; 403 for outsiders.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import OrgTabNav from "@/components/org/OrgTabNav";
import AppShell from "@/components/layout/AppShell";
import { ApiError } from "@/lib/api";
import {
  describeApiError,
  getOrgSkills,
  type AggregateSkillRow,
} from "@/lib/api-helpers";

function SkillBar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-fog">{label}</span>
        <span className="text-white">{count}</span>
      </div>
      <div className="w-full h-1.5 bg-void rounded-full overflow-hidden">
        <div className="h-full bg-brand-blue" style={{ width: `${pct}%` }} />
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
        if (err instanceof ApiError && err.status === 403) {
          setError("Only organization members can view the aggregate skills.");
        } else {
          setError(describeApiError(err));
        }
      });
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="py-12 px-6 relative">
      <div className="absolute top-0 right-0 w-[700px] h-[700px] bg-brand-blue/10 blur-[150px] rounded-full pointer-events-none" />
      <div className="max-w-3xl mx-auto relative z-10">
        <header className="mb-8">
          <h1 className="font-display text-3xl font-bold text-white">Aggregate skills</h1>
          <p className="text-fog mt-2">
            What your organization can do, counted across consenting members.
          </p>
        </header>

        <OrgTabNav orgId={orgId} />

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {rows === null && !error ? (
          <div className="flex justify-center py-16">
            <div className="w-12 h-12 rounded-full border-4 border-brand-cyan/20 border-t-brand-cyan animate-spin" />
          </div>
        ) : rows !== null && rows.length === 0 ? (
          <div className="bg-surface-elevated/80 border border-white/10 rounded-2xl p-10 text-center">
            <p className="text-fog">
              No skill data yet — members must consent, and at least one member needs claimed skills.
            </p>
          </div>
        ) : rows !== null ? (
          <div className="space-y-3">
            {rows.map((row) => (
              <div
                key={row.skill_id}
                className="p-5 rounded-xl bg-surface-card border border-surface-card-border"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <p className="text-white font-semibold">{row.name}</p>
                    {row.category && <p className="text-xs text-fog mt-0.5">{row.category}</p>}
                  </div>
                  <span className="text-xs uppercase tracking-wider px-2 py-1 rounded bg-void text-fog border border-white/10">
                    {row.member_count} member{row.member_count !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <SkillBar
                    label="Evidenced"
                    count={row.evidenced_count}
                    total={row.member_count}
                  />
                  <SkillBar
                    label="Self-declared"
                    count={row.self_declared_count}
                    total={row.member_count}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
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

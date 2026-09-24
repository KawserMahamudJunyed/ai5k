"use client";

// Analysis — UF-7 (LIVE). Readiness check: submit sources → poll → verdict.
// The backend owns the data and invokes the ai-backend web-search tool to
// corroborate Upwork/Fiverr presence; GitHub is fetched via the public API.
// Per-source honesty (ok/failed/skipped), evidence-cap explanation, ranked gaps.

import { useCallback, useEffect, useRef, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import CvSuggestions from "@/components/skills/CvSuggestions";
import { Chip, MonoLabel, Notice, PageHeader, Spinner } from "@/components/ui/Bits";
import { ButtonLink } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth-context";
import {
  createProfileCheck,
  describeApiError,
  getLatestProfileCheck,
  getMyProfile,
  getProfileCheck,
  listSkillClaims,
  uploadCv,
  type ProfileCheck,
} from "@/lib/api-helpers";

const SOURCE_LABELS: Record<string, string> = {
  cv: "CV",
  github: "GitHub",
  upwork: "Upwork",
  fiverr: "Fiverr",
};

const IN_FLIGHT = new Set(["pending", "fetching", "evaluating"]);

function normalizeUrl(url: string): string {
  const t = url.trim();
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

// ---------------------------------------------------------------------------
// Submit form
// ---------------------------------------------------------------------------

function SubmitForm({ onStarted }: { onStarted: (id: string) => void }) {
  const [github, setGithub] = useState("");
  const [upwork, setUpwork] = useState("");
  const [fiverr, setFiverr] = useState("");
  const [cv, setCv] = useState<{ token: string; filename: string; size: number } | null>(null);
  const [cvBusy, setCvBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pickCv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setCvBusy(true);
    try {
      const up = await uploadCv(file);
      setCv({ token: up.cv_token, filename: up.filename, size: up.size_bytes });
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setCvBusy(false);
      e.target.value = "";
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const body: Record<string, string> = {};
      if (github.trim()) body.github_url = normalizeUrl(github);
      if (upwork.trim()) body.upwork_url = normalizeUrl(upwork);
      if (fiverr.trim()) body.fiverr_url = normalizeUrl(fiverr);
      if (cv) body.cv_token = cv.token;
      if (Object.keys(body).length === 0) {
        setError("Add at least one source — a profile URL or your CV.");
        setBusy(false);
        return;
      }
      const created = await createProfileCheck(body);
      onStarted(created.id);
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full border border-hairline rounded-md px-3 py-2 text-sm bg-canvas text-ink focus:outline-none focus:border-ink";

  return (
    <form onSubmit={submit} className="max-w-xl">
      <p className="text-body text-muted mb-6">
        Submit your public profiles and/or your CV. The backend fetches each source — GitHub directly,
        Upwork/Fiverr corroborated via web search, your CV parsed for skills — stores everything, and
        returns an evidence-based verdict.
      </p>
      <div className="space-y-4">
        <div>
          <MonoLabel className="block mb-1.5">CV — PDF, DOCX, TXT or MD (max 10 MB)</MonoLabel>
          {cv ? (
            <div className="flex items-center justify-between border border-hairline rounded-md px-3 py-2 bg-canvas">
              <span className="text-sm text-ink">
                <span className="text-brand-green">✓</span> {cv.filename}
                <span className="text-muted"> · {(cv.size / 1024).toFixed(0)} KB — skills will be read from it</span>
              </span>
              <button type="button" onClick={() => setCv(null)} className="text-sm text-error-red underline underline-offset-4">
                Remove
              </button>
            </div>
          ) : (
            <label className="block border border-dashed border-hairline rounded-md px-3 py-4 text-center cursor-pointer hover:border-ink transition-colors">
              <span className="text-sm text-muted">{cvBusy ? "Uploading…" : "Click to choose a file"}</span>
              <input type="file" accept=".pdf,.docx,.txt,.md,application/pdf,text/plain,text/markdown" className="hidden"
                onChange={pickCv} disabled={cvBusy} />
            </label>
          )}
        </div>
        <div>
          <MonoLabel className="block mb-1.5">GitHub profile URL</MonoLabel>
          <input type="text" value={github} onChange={(e) => setGithub(e.target.value)}
            placeholder="github.com/yourhandle — https:// added automatically" className={inputCls} />
        </div>
        <div>
          <MonoLabel className="block mb-1.5">Upwork profile URL</MonoLabel>
          <input type="text" value={upwork} onChange={(e) => setUpwork(e.target.value)}
            placeholder="upwork.com/freelancers/~… — https:// added automatically" className={inputCls} />
        </div>
        <div>
          <MonoLabel className="block mb-1.5">Fiverr profile URL</MonoLabel>
          <input type="text" value={fiverr} onChange={(e) => setFiverr(e.target.value)}
            placeholder="fiverr.com/username — https:// added automatically" className={inputCls} />
        </div>
      </div>
      {error && <div className="mt-4"><Notice kind="error">{error}</Notice></div>}
      <button type="submit" disabled={busy}
        className="mt-6 bg-brand-green text-white rounded-full px-8 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
        {busy ? "Starting…" : "Run readiness check"}
      </button>
      <p className="text-micro text-muted-2 mt-3">
        GitHub is fetched directly; Upwork/Fiverr presence is corroborated via web search (a configured
        provider improves recall — the keyless fallback works too). Your CV is parsed for recognized skills.
      </p>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

const STAGES = ["pending", "fetching", "evaluating", "completed"] as const;

function Progress({ check }: { check: ProfileCheck }) {
  const idx = STAGES.indexOf(check.status as (typeof STAGES)[number]);
  const stage = check.status === "failed" ? -1 : idx;
  return (
    <div className="border border-hairline rounded-md p-8 max-w-xl">
      <div className="flex items-center gap-3">
        <Spinner />
        <p className="text-ink font-medium">
          {check.status === "pending" && "Queued…"}
          {check.status === "fetching" && "Fetching your sources…"}
          {check.status === "evaluating" && "Scoring your readiness…"}
          {check.status === "failed" && "Check failed"}
        </p>
      </div>
      <div className="flex gap-2 mt-6" aria-hidden>
        {STAGES.slice(0, 3).map((s, i) => (
          <div key={s} className="flex-1">
            <div className={`h-1 rounded-full ${i <= stage ? "bg-brand-green" : "bg-hairline"}`} />
            <p className={`font-mono text-micro mt-2 ${i <= stage ? "text-ink" : "text-muted-2"}`}>
              {s.toUpperCase()}
            </p>
          </div>
        ))}
      </div>
      {check.status === "failed" && (
        <div className="mt-6">
          <Notice kind="error">
            {check.error_message || "The check could not complete."} (code: {check.error_code})
          </Notice>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

function SourceRow({ s }: { s: ProfileCheck["sources"][number] }) {
  const label = SOURCE_LABELS[s.source] ?? s.source;
  if (s.status === "ok") {
    const detail =
      s.source === "cv" && s.raw
        ? `${s.raw.filename ?? "CV"} parsed — ${(s.raw.chars ?? 0).toLocaleString()} chars extracted`
        : `payload fetched${s.from_cache ? " (cached)" : ""}`;
    return (
      <div className="flex items-center gap-3 py-2">
        <Chip tone="green">ok</Chip>
        <span className="text-ink font-medium">{label}</span>
        <span className="text-sm text-muted">{detail}</span>
      </div>
    );
  }
  if (s.status === "failed") {
    const detail =
      s.source === "cv" && s.error_code === "cv_unreadable"
        ? "The file could not be parsed — is it a valid PDF/DOCX?"
        : s.error_message;
    return (
      <div className="py-2">
        <div className="flex items-center gap-3">
          <Chip tone="coral">failed</Chip>
          <span className="text-ink font-medium">{label}</span>
          <span className="text-sm text-muted">{detail} <code className="font-mono text-micro">({s.error_code})</code></span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 py-2">
      <Chip tone="neutral">skipped</Chip>
      <span className="text-ink font-medium">{label}</span>
      <span className="text-sm text-muted">not supplied</span>
    </div>
  );
}

function Verdict({
  check,
  onRerun,
  rerunning,
  lift,
  claimsSinceCheck,
  onClaimsChanged,
}: {
  check: ProfileCheck;
  onRerun: () => void;
  rerunning: boolean;
  lift: number | null;
  claimsSinceCheck: number;
  onClaimsChanged: () => void;
}) {
  const result = check.result!;
  const dims = result.result.dimensions;
  const maxReadiness = dims.reduce((acc, d) => acc + d.max, 0);

  return (
    <div>
      {/* Score band */}
      <section className="bg-brand-green rounded-md p-10 text-white">
        <div className="flex flex-col md:flex-row md:items-end gap-8">
          <div>
            <MonoLabel className="block text-white/60 mb-2">Readiness score</MonoLabel>
            <p className="font-display" style={{ fontSize: "clamp(3.5rem, 8vw, 6rem)", lineHeight: 1 }}>
              {result.readiness}
              <span className="text-white/40" style={{ fontSize: "0.4em" }}> / {maxReadiness}</span>
            </p>
          </div>
          <div className="flex-1 space-y-2">
            {result.capped && (
              <div className="border border-white/30 rounded-md p-4 bg-white/5">
                <p className="font-mono text-micro text-coral">EVIDENCE CAP — HELD AT {result.result.cap.at}</p>
                <p className="text-sm text-white/80 mt-1">{result.result.cap.reason}</p>
              </div>
            )}
            {result.partial && (
              <div className="border border-white/20 rounded-md p-4 bg-white/5">
                <p className="font-mono text-micro text-white/60">PARTIAL — SOME SOURCES MISSING OR FAILED</p>
                <p className="text-sm text-white/70 mt-1">
                  A missing or failed source is not an empty profile. Supply more sources or retry failed ones for a fuller verdict.
                </p>
              </div>
            )}
            {lift !== null && (
              <div className="border border-white/30 rounded-md p-4 bg-white/10">
                {lift > 0 && (
                  <>
                    <p className="font-mono text-micro">▲ +{lift} SINCE YOUR LAST CHECK</p>
                    <p className="text-sm text-white/80 mt-1">
                      New claims and changes are now folded into the score — see the breakdown below.
                    </p>
                  </>
                )}
                {lift < 0 && (
                  <>
                    <p className="font-mono text-micro">▼ {lift} VS YOUR LAST CHECK</p>
                    <p className="text-sm text-white/80 mt-1">Sources scored differently this run — see the breakdown below.</p>
                  </>
                )}
                {lift === 0 && (
                  <>
                    <p className="font-mono text-micro">— NO CHANGE SINCE YOUR LAST CHECK</p>
                    <p className="text-sm text-white/80 mt-1">Add evidence or claim more skills to move the score.</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Per-source honesty */}
      <section className="mt-12">
        <MonoLabel className="block mb-3">Per-source status</MonoLabel>
        <div className="border border-hairline rounded-md divide-y divide-hairline bg-canvas">
          {check.sources.map((s) => <SourceRow key={s.source} s={s} />)}
        </div>
      </section>

      {/* Dimension breakdown */}
      <section className="mt-12">
        <MonoLabel className="block mb-3">What moved the score</MonoLabel>
        <div className="space-y-6 max-w-2xl">
          {dims.map((d) => (
            <div key={d.key}>
              <div className="flex items-baseline justify-between mb-1">
                <p className="text-ink font-medium">{d.label}</p>
                <p className="font-mono text-sm text-muted">{d.points}/{d.max}</p>
              </div>
              <div className="h-1.5 bg-hairline rounded-full overflow-hidden">
                <div className="h-full bg-brand-green rounded-full"
                  style={{ width: `${d.max ? Math.round((d.points / d.max) * 100) : 0}%` }} />
              </div>
              {d.signals.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {d.signals.filter(Boolean).map((sig, i) => (
                    <li key={i} className="text-sm text-muted">· {sig}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Skill audit + next actions */}
      <CvSuggestions onClaimed={() => onClaimsChanged()} />
      {claimsSinceCheck > 0 && (
        <div className="mt-4 border border-ink rounded-md p-5 bg-canvas flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm text-ink">
            <span className="font-medium">
              {claimsSinceCheck} skill{claimsSinceCheck === 1 ? "" : "s"} claimed
            </span>{" "}
            since this check — re-run to fold them into your score.
          </p>
          <button onClick={onRerun} disabled={rerunning}
            className="border border-ink rounded-full px-5 py-2 text-sm hover:bg-ink hover:text-canvas transition-colors disabled:opacity-50">
            {rerunning ? "Starting…" : "Re-run check"}
          </button>
        </div>
      )}
      <section className="mt-12 grid md:grid-cols-2 gap-8">
        <div>
          <MonoLabel className="block mb-3">Skill audit</MonoLabel>
          <div className="border border-hairline rounded-md p-6 bg-canvas">
            {result.skill_audit ? (
              <>
                <p className="text-ink">
                  <span className="font-display text-2xl">{result.skill_audit.evidenced}</span> evidenced
                  &nbsp;·&nbsp; <span className="font-display text-2xl">{result.skill_audit.self_declared}</span> self-declared
                </p>
                <p className="text-sm text-muted mt-2">{result.skill_audit.note}</p>
              </>
            ) : (
              <p className="text-sm text-muted">No skill claims yet — claim skills on your profile to be audited.</p>
            )}
            <div className="flex gap-4 mt-4">
              <ButtonLink href="/profile/me/skills" variant="outline" className="!text-sm">Claim skills</ButtonLink>
              <ButtonLink href="/profile/me/evidence" variant="outline" className="!text-sm">Add evidence</ButtonLink>
            </div>
          </div>
        </div>
        <div>
          <MonoLabel className="block mb-3">Run details</MonoLabel>
          <div className="border border-hairline rounded-md p-6 bg-canvas text-sm text-muted space-y-1">
            <p>Attempt #{check.attempts} · evaluator <code className="font-mono">{result.result.evaluator}</code></p>
            <p>Pipeline took {(((result.duration_ms ?? 0) as number) / 1000).toFixed(1)}s · raw score before cap: {result.result.readiness_raw}</p>
          </div>
          <button onClick={onRerun} disabled={rerunning}
            className="mt-4 border border-ink rounded-full px-6 py-2 text-sm hover:bg-ink hover:text-canvas transition-colors disabled:opacity-50">
            {rerunning ? "Starting…" : "Re-run check"}
          </button>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function AnalyzeInner() {
  const { user } = useAuth();
  const [check, setCheck] = useState<ProfileCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [rerunning, setRerunning] = useState(false);
  // Readiness of the previous completed check — captured when a new run starts,
  // so the next verdict can show the lift. null = no baseline yet.
  const [prevReadiness, setPrevReadiness] = useState<number | null>(null);
  // Live claims count (polled once + updated when chips are claimed from the
  // verdict) — diffed against the check's claims snapshot to prompt a re-run.
  const [claimsCount, setClaimsCount] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getMyProfile()
      .then(async (p) => setClaimsCount((await listSkillClaims(p.id)).length))
      .catch(() => {});
  }, []);

  async function refreshClaimsCount() {
    try {
      const p = await getMyProfile();
      setClaimsCount((await listSkillClaims(p.id)).length);
    } catch {
      /* count stays stale — cosmetic only */
    }
  }

  // Freeze the current completed score as the lift baseline. Called before a
  // new run replaces `check` (state updates would otherwise lose it).
  function snapshotPrev() {
    if (check?.status === "completed" && check.result) {
      setPrevReadiness(check.result.readiness);
    }
  }

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    getLatestProfileCheck()
      .then((c) => setCheck(c))
      .catch((err) => setLoadError(describeApiError(err)))
      .finally(() => setLoading(false));
    return stopPolling;
  }, [stopPolling]);

  // Poll while a check is in flight.
  useEffect(() => {
    if (!check || !IN_FLIGHT.has(check.status)) {
      stopPolling();
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const fresh = await getProfileCheck(check.id);
        setCheck(fresh);
      } catch {
        /* transient poll error — keep trying */
      }
    }, 2000);
    return stopPolling;
  }, [check?.id, check?.status, stopPolling]);

  async function rerun() {
    if (!check) return;
    setRerunning(true);
    try {
      const body: Record<string, string | boolean> = { reuse_cv: true };
      if (check.github_url) body.github_url = check.github_url;
      if (check.upwork_url) body.upwork_url = check.upwork_url;
      if (check.fiverr_url) body.fiverr_url = check.fiverr_url;
      // CV tokens are single-use: instead of re-uploading, the backend re-links
      // the latest check's stored CV file (still on disk) when reuse_cv is set.
      const created = await createProfileCheck(body);
      snapshotPrev();
      const fresh = await getProfileCheck(created.id);
      setCheck(fresh);
    } catch (err) {
      setLoadError(describeApiError(err));
    } finally {
      setRerunning(false);
    }
  }

  return (
    <main className="max-w-shell mx-auto px-6 py-12">
      <PageHeader eyebrow="Profile readiness" title="Analysis" />

      {loadError && <div className="mb-8 max-w-xl"><Notice kind="error">{loadError}</Notice></div>}
      {loading && <Spinner />}

      {!loading && (
        <>
          {check ? (
            IN_FLIGHT.has(check.status) || check.status === "failed" ? (
              <Progress check={check} />
            ) : check.result ? (
              <Verdict
                check={check}
                onRerun={rerun}
                rerunning={rerunning}
                lift={
                  prevReadiness !== null && check.status === "completed"
                    ? check.result.readiness - prevReadiness
                    : null
                }
                claimsSinceCheck={
                  claimsCount !== null ? Math.max(0, claimsCount - check.result.claims.length) : 0
                }
                onClaimsChanged={refreshClaimsCount}
              />
            ) : (
              <Notice kind="error">Check {check.status} without a verdict.</Notice>
            )
          ) : (
            <SubmitForm
              onStarted={async (id) => {
                snapshotPrev();
                setCheck(await getProfileCheck(id));
              }}
            />
          )}

          {/* A completed check exists — offer a new submission below it. */}
          {check && check.status === "completed" && (
            <section className="mt-16 border-t border-hairline pt-10">
              <MonoLabel className="block mb-4">New check</MonoLabel>
              <SubmitForm
                onStarted={async (id) => {
                  snapshotPrev();
                  setCheck(await getProfileCheck(id));
                }}
              />
            </section>
          )}

          {/* Failed/in-flight checks can also be re-submitted */}
          {check && (IN_FLIGHT.has(check.status) || check.status === "failed") && (
            <section className="mt-16 border-t border-hairline pt-10">
              <MonoLabel className="block mb-4">Start a different check</MonoLabel>
              <SubmitForm
                onStarted={async (id) => {
                  snapshotPrev();
                  setCheck(await getProfileCheck(id));
                }}
              />
            </section>
          )}
        </>
      )}

      <p className="text-micro text-muted-2 mt-16 max-w-xl">
        Signed in as {user?.email}. Readiness is a point-in-time snapshot — re-run after changes.
        Scores never promise income; they measure evidence.
      </p>
    </main>
  );
}

export default function AnalyzePage() {
  return (
    <AppShell>
      <AnalyzeInner />
    </AppShell>
  );
}

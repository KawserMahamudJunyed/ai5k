"use client";

// Services editor (REVIEW.md item 1.5).
// POST/GET/PATCH/DELETE /profiles/{id}/services.
// rate_type: hourly|fixed|retainer · rate_amount > 0 ·
// availability_status: available|booked|unavailable.

import { useEffect, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import AppShell from "@/components/layout/AppShell";
import { ApiError } from "@/lib/api";
import {
  createService,
  deleteService,
  getMyProfile,
  listServices,
  updateService,
  type ProfileRead,
  type Service,
} from "@/lib/api-helpers";

const RATE_TYPES = ["hourly", "fixed", "retainer"] as const;
const AVAILABILITY = ["available", "booked", "unavailable"] as const;

const AVAILABILITY_STYLE: Record<string, string> = {
  available: "text-brand-mint border-brand-mint/30 bg-brand-mint/10",
  booked: "text-orange-400 border-orange-400/30 bg-orange-400/10",
  unavailable: "text-fog border-white/10 bg-white/5",
};

function describe(err: unknown): string {
  if (err instanceof ApiError && err.status === 422 && err.details && typeof err.details === "object") {
    const entries = Object.entries(err.details as Record<string, string>);
    if (entries.length > 0) return entries.map(([f, m]) => `${f}: ${m}`).join(" · ");
  }
  return (err as Error).message || "Failed";
}

function ServicesEditor() {
  const [profile, setProfile] = useState<ProfileRead | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Create form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rateType, setRateType] = useState<string>("hourly");
  const [rateAmount, setRateAmount] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    getMyProfile()
      .then(async (p) => {
        setProfile(p);
        setServices(await listServices(p.id));
      })
      .catch((err) =>
        setError(
          err instanceof ApiError && err.code === "profile_not_found"
            ? "no-profile"
            : describe(err),
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setCreating(true);
    setError("");
    try {
      const amount = Number(rateAmount);
      const created = await createService(profile.id, {
        title: title.trim(),
        description: description.trim(),
        rate_type: rateType,
        rate_amount: amount,
      });
      setServices((ss) => [...ss, created]);
      setTitle("");
      setDescription("");
      setRateAmount("");
    } catch (err) {
      setError(describe(err));
    } finally {
      setCreating(false);
    }
  };

  const handleAvailability = async (serviceId: string, status: string) => {
    if (!profile) return;
    setServices((ss) =>
      ss.map((s) =>
        s.id === serviceId
          ? { ...s, availability_status: status as Service["availability_status"] }
          : s,
      ),
    );
    try {
      await updateService(profile.id, serviceId, { availability_status: status });
    } catch {
      setServices(await listServices(profile.id));
    }
  };

  const handleDelete = async (serviceId: string) => {
    if (!profile) return;
    setServices((ss) => ss.filter((s) => s.id !== serviceId)); // optimistic
    try {
      await deleteService(profile.id, serviceId);
    } catch {
      setServices(await listServices(profile.id));
    }
  };

  if (error === "no-profile") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md text-center bg-surface-elevated/80 border border-white/10 rounded-2xl p-10">
          <h1 className="font-display text-2xl font-bold text-white mb-3">No profile yet</h1>
          <p className="text-fog mb-6">Create yours before listing services.</p>
          <Link href="/onboarding/profile"><Button>Create profile</Button></Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen py-12 px-6 relative">
      <div className="absolute top-0 right-0 w-[700px] h-[700px] bg-brand-mint/10 blur-[150px] rounded-full pointer-events-none" />
      <div className="max-w-3xl mx-auto relative z-10">
        <div className="flex items-center justify-between mb-10">
          <div>
            <p className="text-sm text-fog mb-2">What you offer, and at what rate</p>
            <h1 className="font-display text-3xl font-bold text-white">Services</h1>
          </div>
          <Link href="/profile/me" className="text-sm text-fog hover:text-white">
            ← Profile
          </Link>
        </div>

        {error && error !== "no-profile" && (
          <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}
        {loading && (
          <div className="flex justify-center py-24">
            <div className="w-12 h-12 rounded-full border-4 border-brand-cyan/20 border-t-brand-cyan animate-spin" />
          </div>
        )}

        {!loading && (
          <>
            {/* Create form */}
            <form
              onSubmit={handleCreate}
              className="bg-surface-elevated/80 border border-white/10 rounded-2xl p-6 mb-8 space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3">
                <input
                  type="text" required maxLength={255}
                  placeholder="Service title — e.g. RAG pipeline build"
                  value={title} onChange={(e) => setTitle(e.target.value)}
                  className="bg-void border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan placeholder:text-white/20"
                />
                <select
                  value={rateType} onChange={(e) => setRateType(e.target.value)}
                  className="bg-void border border-white/10 rounded-lg px-3 py-2.5 text-white"
                >
                  {RATE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input
                  type="number" required min={0.01} step={0.01}
                  placeholder="Rate" value={rateAmount}
                  onChange={(e) => setRateAmount(e.target.value)}
                  className="w-28 bg-void border border-white/10 rounded-lg px-4 py-2.5 text-white"
                />
              </div>
              <textarea
                required
                placeholder="Describe scope, deliverables, and what's included…"
                value={description} onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full bg-void border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan placeholder:text-white/20"
              />
              <Button type="submit" disabled={creating || !title.trim() || !rateAmount}>
                {creating ? "Adding…" : "Add service"}
              </Button>
            </form>

            {/* List */}
            {services.length === 0 ? (
              <div className="text-center py-16 bg-surface-elevated/40 border border-white/5 rounded-2xl">
                <p className="text-fog">No services listed yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {services.map((s) => (
                  <div
                    key={s.id}
                    className="p-5 rounded-xl bg-surface-elevated border border-surface-border"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-white font-semibold">{s.title}</p>
                        <p className="text-sm text-fog mt-1 whitespace-pre-line">
                          {s.description}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-white font-mono">
                          {s.rate_type === "hourly" ? "$" : ""}
                          {s.rate_amount.toLocaleString()}
                          {s.rate_type === "hourly" ? "/h" : s.rate_type === "fixed" ? " fixed" : " retainer"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                      <select
                        value={s.availability_status}
                        onChange={(e) => handleAvailability(s.id, e.target.value)}
                        className={`text-xs px-3 py-1.5 rounded-full border ${AVAILABILITY_STYLE[s.availability_status]}`}
                      >
                        {AVAILABILITY.map((a) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleDelete(s.id)}
                        className="text-sm text-fog hover:text-red-400"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default function ServicesPage() {
  return (
    <AppShell>
      <ServicesEditor />
    </AppShell>
  );
}

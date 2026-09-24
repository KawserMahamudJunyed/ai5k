"use client";

// Services editor — UF-6. rate_amount must be > 0; availability toggle.

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import Button from "@/components/ui/Button";
import { Chip, Field, inputClass, Notice, PageHeader, Spinner } from "@/components/ui/Bits";
import {
  createService,
  deleteService,
  describeApiError,
  getMyProfile,
  listServices,
  updateService,
  type ProfileRead,
  type Service,
} from "@/lib/api-helpers";

const RATE_TYPES = ["hourly", "fixed", "retainer"] as const;
const AVAILABILITY = ["available", "booked", "unavailable"] as const;

function rateLabel(s: Service): string {
  const suffix = s.rate_type === "hourly" ? "/h" : s.rate_type === "retainer" ? "/mo" : "";
  return `$${s.rate_amount}${suffix}`;
}

function ServicesEditor() {
  const [profile, setProfile] = useState<ProfileRead | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [title, setTitle] = useState("");
  const [rateType, setRateType] = useState<string>("hourly");
  const [rateAmount, setRateAmount] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyProfile()
      .then(async (p) => {
        setProfile(p);
        setServices(await listServices(p.id));
      })
      .catch((err) =>
        setError((err as { code?: string }).code === "profile_not_found" ? "no-profile" : describeApiError(err)),
      )
      .finally(() => setLoading(false));
  }, []);

  const refresh = async (p: ProfileRead) => setServices(await listServices(p.id));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setError("");
    setBusy(true);
    try {
      await createService(profile.id, {
        title: title.trim(),
        description: description.trim(),
        rate_type: rateType,
        rate_amount: Number(rateAmount),
      });
      setTitle(""); setRateAmount(""); setDescription("");
      await refresh(profile);
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleAvailability = async (s: Service, availability_status: string) => {
    if (!profile) return;
    setServices((ss) => ss.map((x) => (x.id === s.id ? { ...x, availability_status: availability_status as Service["availability_status"] } : x)));
    try {
      await updateService(profile.id, s.id, { availability_status });
    } catch {
      await refresh(profile);
    }
  };

  const handleDelete = async (s: Service) => {
    if (!profile) return;
    setServices((ss) => ss.filter((x) => x.id !== s.id));
    try {
      await deleteService(profile.id, s.id);
    } catch {
      await refresh(profile);
    }
  };

  if (loading) return <div className="flex justify-center py-24"><Spinner /></div>;

  if (error === "no-profile") {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md text-center border border-hairline rounded-md p-10 bg-canvas">
          <h1 className="text-card-heading font-display text-ink mb-3">No profile yet</h1>
          <Link href="/onboarding/profile"><Button>Create profile</Button></Link>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-text mx-auto px-6 py-12">
      <PageHeader eyebrow="Commercial" title="Services" lede="Package your capability as bookable offerings." />

      {error && error !== "no-profile" && <div className="mb-6"><Notice kind="error">{error}</Notice></div>}

      <form onSubmit={handleCreate} className="bg-canvas border border-hairline rounded-md p-6 mb-8 space-y-4">
        <Field label="Title" htmlFor="sTitle" required>
          <input id="sTitle" type="text" required maxLength={255} placeholder="e.g. Document-intake agent build"
            value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <Field label="Rate type" htmlFor="sRateType">
            <select id="sRateType" value={rateType} onChange={(e) => setRateType(e.target.value)} className={inputClass}>
              {RATE_TYPES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Amount (USD)" htmlFor="sRateAmount" required>
            <input id="sRateAmount" type="number" min={1} step="0.01" required placeholder="85"
              value={rateAmount} onChange={(e) => setRateAmount(e.target.value)} className={inputClass} />
          </Field>
          <div className="pb-0.5">
            <Button type="submit" disabled={busy || !title.trim() || !rateAmount}>{busy ? "Adding…" : "Add service"}</Button>
          </div>
        </div>
        <Field label="Description" htmlFor="sDesc">
          <textarea id="sDesc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
        </Field>
      </form>

      {services.length === 0 ? (
        <p className="text-center py-16 text-muted border border-hairline rounded-md">No services yet. Add your first above.</p>
      ) : (
        <div className="divide-y divide-hairline border-y border-hairline">
          {services.map((s) => (
            <div key={s.id} className="flex flex-col sm:flex-row sm:items-center gap-3 py-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-ink font-medium">{s.title}</span>
                  <Chip tone="navy">{rateLabel(s)}</Chip>
                </div>
                {s.description && <p className="text-sm text-muted mt-1">{s.description}</p>}
              </div>
              <select value={s.availability_status} onChange={(e) => handleAvailability(s, e.target.value)}
                aria-label={`Availability for ${s.title}`}
                className="bg-canvas border border-hairline rounded-sm px-3 py-2 text-sm text-ink">
                {AVAILABILITY.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <button type="button" onClick={() => handleDelete(s)} className="text-muted hover:text-error-red px-2"
                aria-label={`Delete ${s.title}`}>✕</button>
            </div>
          ))}
        </div>
      )}
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

"use client";

// Settings — the profile-settings hub. The six capability sections (Skills,
// Services, Evidence, Organizations, Analysis) plus profile editing live here,
// reachable from the avatar menu on every page.

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { ButtonLink } from "@/components/ui/Button";
import { Chip, MonoLabel, Notice, PageHeader, Spinner } from "@/components/ui/Bits";
import { useAuth } from "@/lib/auth-context";
import {
  changeEmail as changeEmailApi,
  changePassword as changePasswordApi,
  describeApiError,
  getMyProfile,
  type ProfileRead,
} from "@/lib/api-helpers";

const CAPABILITY_SECTIONS = [
  { href: "/profile/me/skills", title: "Skills", body: "Claim what you can do, set proficiency, and request verification." },
  { href: "/profile/me/services", title: "Services", body: "Package your capability as bookable offerings with rates." },
  { href: "/profile/me/evidence", title: "Evidence", body: "Links, testimonials, certificates — the proof behind your claims." },
  { href: "/organizations", title: "Organizations", body: "Your agencies and teams, invitations, and aggregate capability." },
  { href: "/analyze", title: "Analysis", body: "Readiness check against a niche benchmark (pipeline in progress)." },
];

const ACCOUNT_ITEMS = [
  { title: "Session", body: "Access tokens refresh automatically; logging out clears this device." },
  { title: "Visibility", body: "Controlled per-profile under Profile information." },
];

const inputCls =
  "w-full bg-void border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan/50 transition-all placeholder:text-white/20";

function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setDone(false);
    if (next.length < 8) return setError("New password must be at least 8 characters.");
    if (next !== confirm) return setError("New passwords do not match.");
    setBusy(true);
    try {
      await changePasswordApi(current, next);
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError(
        code === "invalid_credentials"
          ? "Current password is incorrect."
          : describeApiError(err),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="py-4">
      <p className="text-white font-medium">Change password</p>
      <p className="text-sm text-muted mt-0.5 mb-3">You'll need your current password to set a new one.</p>
      <div className="grid sm:grid-cols-3 gap-3 max-w-2xl">
        <input
          type="password"
          placeholder="Current password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          className={inputCls}
          autoComplete="current-password"
        />
        <input
          type="password"
          placeholder="New password (8+ chars)"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
          minLength={8}
          className={inputCls}
          autoComplete="new-password"
        />
        <input
          type="password"
          placeholder="Repeat new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          className={inputCls}
          autoComplete="new-password"
        />
      </div>
      {error && <p className="text-sm text-error-red mt-2">{error}</p>}
      {done && <p className="text-sm mt-2" style={{ color: "var(--brand-green)" }}>Password updated. Use it next time you sign in.</p>}
      <button
        type="submit"
        disabled={busy}
        className="mt-3 text-sm border border-white/10 rounded-full px-5 py-1.5 hover:bg-brand-cyan hover:text-canvas transition-colors disabled:opacity-50"
      >
        {busy ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}

function ChangeEmailForm() {
  const { user, refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setDone(false);
    setBusy(true);
    try {
      await changeEmailApi(email, password);
      setDone(true);
      setEmail("");
      setPassword("");
      await refresh();
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "invalid_credentials") setError("Current password is incorrect.");
      else if (code === "email_already_registered") setError("An account with that email already exists.");
      else if (code === "email_unchanged") setError("That is already your current email.");
      else setError(describeApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="py-4">
      <p className="text-white font-medium">Change email</p>
      <p className="text-sm text-muted mt-0.5 mb-3">
        Current: <span className="text-white">{user?.email}</span> — confirmed by your password.
      </p>
      <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end max-w-2xl">
        <input
          type="email"
          placeholder="New email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className={inputCls}
          autoComplete="email"
        />
        <input
          type="password"
          placeholder="Current password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className={inputCls}
          autoComplete="current-password"
        />
        <button
          type="submit"
          disabled={busy}
          className="text-sm border border-white/10 rounded-full px-5 py-2 hover:bg-brand-cyan hover:text-canvas transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {busy ? "Updating…" : "Update email"}
        </button>
      </div>
      {error && <p className="text-sm text-error-red mt-2">{error}</p>}
      {done && <p className="text-sm mt-2" style={{ color: "var(--brand-green)" }}>Email updated. Sign in with the new address from now on.</p>}
    </form>
  );
}

function SettingsInner() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<ProfileRead | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getMyProfile()
      .then(setProfile)
      .catch((err) => {
        if ((err as { status?: number }).status !== 404) setError(describeApiError(err));
      });
  }, []);

  return (
    <main className="max-w-shell mx-auto px-6 py-12">
      <PageHeader eyebrow="Account" title="Profile settings" />

      {error && <div className="mb-8"><Notice kind="error">{error}</Notice></div>}

      {/* Identity card */}
      <section className="bg-surface-elevated/40 border border-white/10 rounded-2xl p-6 md:p-8 mb-12 backdrop-blur-md shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-cyan/5 rounded-full blur-3xl"></div>
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-brand text-void flex items-center justify-center font-display text-xl shadow-lg">
              {(user?.full_name ?? "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <div>
              <p className="text-2xl font-display text-white">{user?.full_name}</p>
              <p className="text-sm text-brand-cyan">{user?.email}</p>
            </div>
          </div>
          <ButtonLink href="/profile/me" variant="outline" className="shrink-0 bg-white/5 border-white/20 hover:border-brand-cyan/50 hover:bg-brand-cyan/10">Edit profile</ButtonLink>
        </div>
        <div className="relative z-10 mt-6 pt-6 border-t border-white/10">
          {profile ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted">Profile Status:</span>
              <span className="text-white font-medium">{profile.display_name}</span>
              <Chip tone={profile.visibility === "public" ? "green" : "neutral"}>{profile.visibility}</Chip>
              <Link href={`/profiles/${profile.id}`} className="text-sm text-brand-cyan hover:text-white transition-colors ml-auto">View public page &rarr;</Link>
            </div>
          ) : (
            <p className="text-sm text-muted">
              No profile yet —{" "}
              <Link href="/onboarding/profile" className="text-brand-cyan hover:underline underline-offset-4">create one</Link>{" "}
              to unlock skills, evidence, and services.
            </p>
          )}
        </div>
      </section>

      {/* Verification Update Box */}
      <section className="mb-12">
        <MonoLabel className="block mb-4 text-brand-cyan">Capability Analysis & Links</MonoLabel>
        <div className="bg-surface-elevated/30 border border-brand-cyan/20 rounded-2xl p-6 hover:border-brand-cyan/50 transition-colors group">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h2 className="text-lg font-display text-white mb-1">Update CV & Verification Links</h2>
              <p className="text-sm text-muted max-w-2xl">
                Your CV, GitHub, Upwork, and Fiverr links are tied to your Readiness Score. To update these files or links, simply run a new AI Capability Analysis. The backend will parse your new files and automatically update your profile.
              </p>
            </div>
            <ButtonLink href="/analyze" className="shrink-0 bg-brand-cyan !text-void hover:bg-white transition-colors font-medium rounded-xl px-6 py-3">
              Run New Analysis
            </ButtonLink>
          </div>
        </div>
      </section>

      {/* Capability sections */}
      <section className="mb-12">
        <MonoLabel className="block mb-4">Profile sections</MonoLabel>
        <div className="grid md:grid-cols-2 gap-4">
          {CAPABILITY_SECTIONS.map((s) => (
            <Link key={s.href} href={s.href}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm hover:bg-white/10 hover:border-brand-cyan/40 transition-all duration-300">
              <div className="flex items-center justify-between">
                <h2 className="text-feature-heading font-display text-white">{s.title}</h2>
                <span className="text-muted group-hover:text-white">→</span>
              </div>
              <p className="text-sm text-muted mt-2">{s.body}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Account */}
      <section>
        <MonoLabel className="block mb-4">Account</MonoLabel>
        <div className="border border-white/10 bg-white/5 rounded-2xl p-6 divide-y divide-white/10 mt-2">
          {ACCOUNT_ITEMS.map((i) => (
            <div key={i.title} className="py-4">
              <p className="text-white font-medium">{i.title}</p>
              <p className="text-sm text-muted mt-0.5">{i.body}</p>
            </div>
          ))}
          <div className="py-4 flex items-center justify-between">
            <p className="text-white font-medium">Log out</p>
            <button type="button" onClick={logout} className="text-sm text-error-red underline underline-offset-4">
              Log out of this device
            </button>
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="mt-12">
        <MonoLabel className="block mb-4">Security</MonoLabel>
        <div className="border border-white/10 bg-white/5 rounded-2xl p-6 divide-y divide-white/10 mt-2">
          <ChangeEmailForm />
          <ChangePasswordForm />
        </div>
      </section>
    </main>
  );
}

export default function SettingsPage() {
  return (
    <AppShell>
      <SettingsInner />
    </AppShell>
  );
}

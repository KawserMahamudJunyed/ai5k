"use client";

// Shared micro-components implementing DESIGN.md primitives:
// mono uppercase labels, hairline rules, quiet chips, flat surfaces.

import type { ReactNode } from "react";

export function MonoLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`font-mono text-micro uppercase tracking-[0.28px] text-muted ${className}`}>
      {children}
    </span>
  );
}

export function Chip({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "coral" | "green" | "navy" | "red";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "border-white/10 text-muted bg-void",
    coral: "border-brand-violet/40 text-brand-violet bg-brand-violet/10",
    green: "border-brand-mint/40 text-brand-mint bg-brand-mint/10",
    navy: "border-brand-blue/40 text-brand-blue bg-brand-blue/10",
    red: "border-error-red/40 text-error-red bg-error-red/10",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-micro ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-white mb-1.5">
        {label} {required && <span className="text-error-red">*</span>}
        {hint && <span className="ml-1 font-normal text-muted">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

export const inputClass =
  "w-full bg-void border border-white/10 rounded-sm px-4 py-2.5 text-white placeholder:text-muted-2 focus-visible:outline-brand-cyan";

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`w-10 h-10 rounded-full border-2 border-white/10 border-t-brand-cyan animate-spin ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

export function Notice({ kind, children }: { kind: "error" | "ok" | "info"; children: ReactNode }) {
  const styles = {
    error: "border-error-red/30 bg-error-red/5 text-error-red",
    ok: "border-[#003c33]/30 bg-green-wash text-[#003c33]",
    info: "border-white/10 bg-blue-wash text-navy",
  }[kind];
  return <div className={`p-3 rounded-sm border text-sm ${styles}`}>{children}</div>;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="text-center py-16 border border-white/10 rounded-md bg-void">
      <p className="text-card-heading text-white">{title}</p>
      <p className="text-body text-muted mt-2 mb-6 max-w-md mx-auto">{body}</p>
      {action}
    </div>
  );
}

export function PageHeader({ eyebrow, title, lede }: { eyebrow: string; title: string; lede?: string }) {
  return (
    <header className="mb-10">
      <MonoLabel className="block mb-3">{eyebrow}</MonoLabel>
      <h1 className="text-section-heading font-display text-white">{title}</h1>
      {lede && <p className="text-body-lg text-muted mt-3 max-w-text">{lede}</p>}
    </header>
  );
}



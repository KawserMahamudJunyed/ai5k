import { ButtonLink } from "@/components/ui/Button";
import { MonoLabel } from "@/components/ui/Bits";
import Image from "next/image";

// Landing — DESIGN.md: white editorial canvas, one monumental headline,
// restrained copy, deep-green CTA band. Claims-policy compliant copy only.

const EVIDENCE_LADDER = [
  { tier: "T1", name: "Client-verified outcome", weight: "1.0×" },
  { tier: "T2", name: "Certification-backed", weight: "0.8×" },
  { tier: "T3", name: "AI5K assessment verified", weight: "0.8×" },
  { tier: "T4", name: "Project-demonstrated", weight: "0.6×" },
  { tier: "T5", name: "Organization-endorsed", weight: "0.5×" },
  { tier: "T6", name: "Peer-endorsed", weight: "0.3×" },
  { tier: "T7", name: "Self-declared", weight: "0.1×" },
];

export default function LandingPage() {
  return (
    <main>
      {/* Hero — white canvas, monumental type */}
      <section className="max-w-shell mx-auto px-6 pt-20 pb-16 md:pt-28 md:pb-24">
        <MonoLabel className="block mb-6">Global AI Capability Network</MonoLabel>
        <h1 className="text-hero font-display text-white max-w-5xl">
          Build AI. Prove capability. Earn globally.
        </h1>
        <p className="text-body-lg text-muted mt-8 max-w-2xl">
          AI5K verifies what you can do, packages it for global buyers, and connects you to
          opportunities worth pursuing. Evidence over assertion — every capability claim carries
          its proof.
        </p>
        <div className="flex flex-wrap gap-4 mt-10">
          <ButtonLink href="/signup" size="lg">Join as a professional</ButtonLink>
          <ButtonLink href="/login" variant="ghost" size="lg">Log in</ButtonLink>
        </div>
      </section>

      {/* Trust strip — quiet, wide spacing */}
      <section className="border-t border-white/10">
        <div className="max-w-shell mx-auto px-6 py-14 text-center">
          <MonoLabel>Built for the 5,000+ AI builder community</MonoLabel>
          <p className="text-muted text-body mt-4 max-w-xl mx-auto">
            A curated, concierge-led network — not an open marketplace. Quality before scale.
          </p>
        </div>
      </section>

      {/* Evidence ladder — editorial rows, not cards */}
      <section className="max-w-shell mx-auto px-6 py-20">
        <div className="grid md:grid-cols-[1fr_1.4fr] gap-12">
          <div>
            <MonoLabel className="block mb-4">The evidence hierarchy</MonoLabel>
            <h2 className="text-section-heading font-display text-white">
              Skills are weighted by their proof.
            </h2>
            <p className="text-body text-muted mt-4">
              Higher tiers command higher rates and platform placement. Self-declared is always
              labeled as such — verified capability is what buyers pay for.
            </p>
          </div>
          <ul className="divide-y divide-hairline border-t border-white/10">
            {EVIDENCE_LADDER.map((t) => (
              <li key={t.tier} className="flex items-center justify-between py-4">
                <span className="flex items-baseline gap-4">
                  <span className="font-mono text-micro text-coral w-8">{t.tier}</span>
                  <span className="text-white">{t.name}</span>
                </span>
                <span className="font-mono text-micro text-muted">{t.weight}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Dark green CTA band */}
      <section className="relative overflow-hidden bg-void border-t border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]">
        {/* Animated Liquid Orbs */}
        <div className="absolute inset-0 pointer-events-none opacity-50">
          <div className="absolute top-[-10%] left-[10%] w-96 h-96 bg-brand-cyan/40 rounded-full mix-blend-screen filter blur-[80px] animate-blob" />
          <div className="absolute top-[20%] right-[10%] w-96 h-96 bg-brand-violet/40 rounded-full mix-blend-screen filter blur-[80px] animate-blob" style={{ animationDelay: '2s' }} />
          <div className="absolute -bottom-20 left-[40%] w-96 h-96 bg-brand-blue/40 rounded-full mix-blend-screen filter blur-[80px] animate-blob" style={{ animationDelay: '4s' }} />
        </div>

        {/* Frosted Glass Plate */}
        <div className="absolute inset-0 bg-white/[0.02] backdrop-blur-[40px] pointer-events-none" />

        <div className="relative z-10 max-w-shell mx-auto px-6 py-20 text-center">
          <h2 className="text-section-heading font-display text-white">
            Verified AI capability. Global demand.
          </h2>
          <p className="text-body-lg text-white/70 mt-4 max-w-2xl mx-auto">
            Designed to help qualified, verified, market-ready professionals pursue at least
            USD 5,000 per month — through specialization, evidence, and access to global opportunities.
          </p>
          <div className="mt-8">
            <ButtonLink href="/signup" variant="primary" size="lg">
              Start your profile
            </ButtonLink>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10">
        <div className="max-w-shell mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <Image src="/assets/logo-light.png" alt="AI5K Logo" width={280} height={80} className="h-16 md:h-20 w-auto object-contain" />
          <p className="text-micro text-muted">
            AI5K is designed to help professionals pursue earnings targets — it does not guarantee income.
          </p>
        </div>
      </footer>
    </main>
  );
}








import { SITE_COPY } from "@/lib/constants";
import Button from "@/components/ui/Button";
import EvidenceGraph from "@/components/ui/EvidenceGraph";

export default function Hero() {
  return (
    <section id="top" className="pt-40 pb-20 lg:pt-48 lg:pb-32 overflow-hidden relative">
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center relative z-10">
        
        {/* Left Column: Copy & CTAs */}
        <div className="flex flex-col items-start text-left max-w-2xl">
          <div className="inline-flex items-center justify-center p-[1px] rounded-full bg-white/10 mb-8">
            <div className="px-4 py-1.5 rounded-full bg-void/80 backdrop-blur-sm">
              <span className="text-[11px] md:text-xs font-medium text-brand-mint uppercase tracking-[0.08em]">
                {SITE_COPY.hero.eyebrow}
              </span>
            </div>
          </div>

          <h1 className="font-display text-4xl md:text-5xl lg:text-[40px] xl:text-[48px] font-bold tracking-tight mb-6 leading-[1.1]">
            {SITE_COPY.hero.headline}
          </h1>

          <p className="text-lg md:text-[18px] text-fog mb-10 leading-[28px] max-w-xl">
            {SITE_COPY.hero.subhead}
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            <Button href={SITE_COPY.hero.primaryCta.href} variant="primary" className="w-full sm:w-auto">
              {SITE_COPY.hero.primaryCta.label}
            </Button>
            <Button href={SITE_COPY.hero.secondaryCta.href} variant="secondary" className="w-full sm:w-auto">
              {SITE_COPY.hero.secondaryCta.label}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-6 md:gap-8 mt-12 pt-12 divider-gradient-top">
            {SITE_COPY.hero.stats.map((stat, i) => (
              <div key={i} className="flex flex-col">
                <span className="text-white font-medium text-lg">{stat.value}</span>
                <span className="text-fog text-xs max-w-[160px] leading-relaxed">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Visual */}
        <div className="relative w-full flex justify-center lg:justify-end">
          <EvidenceGraph />
        </div>
      </div>
    </section>
  );
}


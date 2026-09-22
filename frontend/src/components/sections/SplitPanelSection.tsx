import { SITE_COPY } from "@/lib/constants";

export default function SplitPanelSection() {
  const { left, right } = SITE_COPY.splitPanel;

  return (
    <section id="buyers-builders" className="py-20 lg:py-32 divider-gradient-top">
      <div className="max-w-7xl mx-auto px-6">
        <div className="max-w-3xl mb-16 md:mb-24 text-center mx-auto">
          <h2 className="font-display text-3xl md:text-[32px] font-bold tracking-tight mb-6">
            {SITE_COPY.splitPanel.heading}
          </h2>
          <p className="text-lg text-fog leading-[28px]">
            {SITE_COPY.splitPanel.description}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_1px_1fr] gap-12 md:gap-0">
          
          {/* Left: For Buyers */}
          <div className="md:pr-16 lg:pr-24">
            <span className="font-mono text-[11px] text-brand-blue uppercase tracking-[0.08em] mb-4 block">
              {left.roleLabel}
            </span>
            <h3 className="font-display text-2xl font-bold mb-8">
              {left.headline}
            </h3>
            <ul className="space-y-5">
              {left.bullets.map((bullet, i) => (
                <li key={i} className="flex items-start gap-4 text-fog group hover:text-white transition-colors p-3 -m-3 rounded-lg hover:bg-brand-cyan/5 cursor-default">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-blue shrink-0 mt-2.5 transition-transform duration-300 ease-spring group-hover:scale-150 group-hover:bg-brand-cyan group-hover:shadow-[0_0_8px_rgba(80,223,251,0.5)]"></div>
                  <span className="leading-relaxed">{bullet}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Divider */}
          <div className="hidden md:block w-px bg-white/10 h-full"></div>

          {/* Right: For Builders */}
          <div className="md:pl-16 lg:pl-24 pt-12 md:pt-0 divider-gradient-top md:border-none">
            <span className="font-mono text-[11px] text-brand-mint uppercase tracking-[0.08em] mb-4 block">
              {right.roleLabel}
            </span>
            <h3 className="font-display text-2xl font-bold mb-8">
              {right.headline}
            </h3>
            <ul className="space-y-5">
              {right.bullets.map((bullet, i) => (
                <li key={i} className="flex items-start gap-4 text-fog group hover:text-white transition-colors p-3 -m-3 rounded-lg hover:bg-brand-cyan/5 cursor-default">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-mint shrink-0 mt-2.5 transition-transform duration-300 ease-spring group-hover:scale-150 group-hover:bg-brand-cyan group-hover:shadow-[0_0_8px_rgba(80,223,251,0.5)]"></div>
                  <span className="leading-relaxed">{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
          
        </div>
      </div>
    </section>
  );
}


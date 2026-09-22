import { SITE_COPY } from "@/lib/constants";


export default function StepsListSection() {
  return (
    <section id="how-it-works" className="py-20 lg:py-32 divider-gradient-top bg-navy/20 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="max-w-3xl mb-16 md:mb-24 text-center mx-auto">
          <h2 className="font-display text-3xl md:text-[32px] font-bold tracking-tight mb-6">
            {SITE_COPY.steps.heading}
          </h2>
          <p className="text-lg text-fog leading-[28px]">
            {SITE_COPY.steps.description}
          </p>
        </div>

        

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8 lg:gap-16">
          {SITE_COPY.steps.items.map((step) => (
            <div key={step.number} className="relative pt-8 divider-gradient-top">
              <span className="absolute -top-3.5 left-0 font-mono text-sm font-bold text-white bg-void px-2">
                {step.number}
              </span>
              <h3 className="font-display text-xl font-bold mb-4">{step.title}</h3>
              <p className="text-fog leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}


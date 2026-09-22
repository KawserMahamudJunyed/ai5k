import { SHELVED_LADDER_TIERS } from "@/lib/constants";
import VerificationLadder from "./VerificationLadder";

export default function VerificationLadderSection() {
  return (
    <section id="verification" className="py-20 lg:py-32 divider-gradient-top relative bg-navy/20">
      <div className="max-w-7xl mx-auto px-6">
        <div className="max-w-3xl mb-16">
          <h2 className="font-display text-3xl md:text-[32px] font-bold tracking-tight mb-6">
            {"Every claim carries its evidence"}
          </h2>
          <p className="text-lg text-fog leading-[28px]">
            {"A skill isn't just listed - it's scored. The ladder runs from a self-declared claim to a delivery a real client has signed off on, and buyers see exactly which rung any claim stands on."}
          </p>
        </div>

        <VerificationLadder tiers={SHELVED_LADDER_TIERS} />
      </div>
    </section>
  );
}




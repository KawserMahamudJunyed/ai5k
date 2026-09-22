import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Hero from "@/components/sections/Hero";
import VerificationLadderSection from "@/components/sections/VerificationLadderSection";
import SplitPanelSection from "@/components/sections/SplitPanelSection";
import StepsListSection from "@/components/sections/StepsListSection";
import CtaBand from "@/components/sections/CtaBand";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col">
      <Navbar />
      <Hero />
      <VerificationLadderSection />
      <SplitPanelSection />
      <StepsListSection />
      <CtaBand />
      <Footer />
    </main>
  );
}


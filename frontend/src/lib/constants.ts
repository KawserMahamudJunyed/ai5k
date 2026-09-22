// Shelved — not currently rendered. Kept for possible reuse. See 2026-09-22 discussion on tier-count reconciliation with the analyze/report tool's 8-tier system before reactivating.
export const ACTIVE_LADDER_TIERS = [
  { name: "Unverified Claim", weight: 0.1, color: "tier-0" },
  { name: "Self-declared", weight: 0.25, color: "tier-1" },
  { name: "Peer-endorsed", weight: 0.4, color: "tier-2" },
  { name: "Organization-endorsed", weight: 0.5, color: "tier-3" },
  { name: "Certification-backed", weight: 0.65, color: "tier-4" },
  { name: "AI5K-verified assessment", weight: 0.75, color: "tier-5" },
  { name: "Project-demonstrated", weight: 0.9, color: "tier-6" },
  { name: "Client-verified delivery", weight: 1.0, color: "tier-7" },
];

export const SHELVED_LADDER_TIERS = [
  { name: "Self-declared", weight: 0.35, color: "tier-1" },
  { name: "Peer-endorsed", weight: 0.5, color: "tier-2" },
  { name: "Organization-endorsed", weight: 0.6, color: "tier-3" },
  { name: "Certification-backed", weight: 0.7, color: "tier-4" },
  { name: "AI5K-verified assessment", weight: 0.8, color: "tier-5" },
  { name: "Project-demonstrated", weight: 0.9, color: "tier-6" },
  { name: "Client-verified delivery", weight: 1.0, color: "gradient" },
];

export const SITE_COPY = {
  nav: {
    links: [
      { label: "For buyers & builders", href: "#buyers-builders" },
      { label: "How it works", href: "#how-it-works" },
    ],
    signIn: { label: "Log in", href: "/login" },
    primaryCta: { label: "Get verified", href: "/signup" },
  },
  hero: {
    eyebrow: "Verified global AI capability network",
    headline: "Build AI. Prove capability. Earn globally.",
    subhead:
      "AI5K is where AI builders turn real work into evidence, and where financial-services, legal, and SMB teams find capability they can verify before they buy.",
    primaryCta: { label: "Get verified", href: "/signup" },
    secondaryCta: { label: "See how it works", href: "#how-it-works" },
    stats: [
      { label: "evidence tiers, from self-declared to client-verified", value: "7" },
      { label: "Buyers across", value: "US • UK • Canada" },
    ],
    graphReadouts: [
      { label: "tier: project-demonstrated", score: "0.90" },
      { label: "tier: client-verified", score: "1.00" },
    ],
  },
  splitPanel: {
    heading: "Two sides, one ledger",
    description:
      "Buyers and builders read the same evidence, so there's nothing to take on faith on either side of the deal.",
    left: {
      roleLabel: "For buyers",
      headline: "See capability before you commit",
      bullets: [
        "Filter by evidence tier, not just a title or a rate",
        "Review the project history behind any claim",
        "Work with builders and teams that have delivered for a verified client before",
        "Bring in AI capability the way you'd bring in any vetted vendor",
      ],
    },
    right: {
      roleLabel: "For builders",
      headline: "Turn delivered work into standing",
      bullets: [
        "Start from the network of builders assessed through AI5K",
        "Move up the ladder with every certification, project, and client sign-off",
        "Let a client-verified delivery speak louder than a self-written bio",
        "Reach buyers in the US, UK, and Canada looking for proof, not promises",
      ],
    },
  },
  steps: {
    heading: "How it works",
    description:
      "Three steps take a builder from registration to a scored, buyer-visible profile.",
    items: [
      {
        number: "01",
        title: "Register and assess",
        description:
          "Builders submit their background and sit AI5K's own capability assessment, the first rung on the ladder.",
      },
      {
        number: "02",
        title: "Earn evidence",
        description:
          "Certifications, endorsements, and delivered projects each raise a builder's score, tier by tier.",
      },
      {
        number: "03",
        title: "Get matched",
        description:
          "Buyers search by evidence tier and outcome, and reach out directly to builders who clear their bar.",
      },
    ],
  },
  ctaBand: {
    heading: "Ready to put your work on the record?",
    primaryCta: { label: "Get verified", href: "/signup" },
    secondaryCta: { label: "Talk to sales", href: "https://calendly.com/ai5k-sales" }, // Adding a fake calendly per previous proposals
  },
  footer: {
    tagline: "Verified AI capability for global work.",
    links: [
      { label: "For buyers", href: "#buyers-builders" },
      { label: "For builders", href: "#buyers-builders" },
      { label: "How it works", href: "#how-it-works" },
    ],
    legalLinks: [
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
    ],
  },
};



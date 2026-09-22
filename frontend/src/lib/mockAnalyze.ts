export interface DimensionScore {
  currentValue: number;
  benchmarkTarget: number;
}

export interface Blocker {
  id: string;
  description: string;
  fieldToFix: string; // Routes user to the corresponding onboarding field
}

export interface Action {
  id: string;
  description: string;
  scoreDelta: number;
  timeEstimateMin: number;
  fieldToFix: string; 
}

export interface ProfileClaim {
  text: string;
  sourceId: string | null; // A citation ID linking to the evidence ledger. Must not be null.
}

export interface EvidenceTier {
  tierNumber: number;
  name: string;
  weight: number;
  colorClass: string;
}

export interface LedgerEntry {
  id: string;
  claim: string;
  tierNumber: number;
  sourceRef: string; // The URL or document name serving as evidence
}

export interface SkillAction {
  skillName: string;
  sourceTags: string[];
  instruction: string;
  fieldToFix: string;
}

export interface AnalyzeReport {
  overallScore: number;
  sourceCount: number;
  dimensions: {
    positioning: DimensionScore;
    evidenceQuality: DimensionScore;
    keywordCoverage: DimensionScore;
    portfolioQuality: DimensionScore;
    completeness: DimensionScore;
    conversion: DimensionScore;
    pricingStrategy: DimensionScore;
  };
  blockers: Blocker[];
  nextActions: Action[];
  rewrittenProfile: ProfileClaim[];
  evidenceLegend: EvidenceTier[];
  evidenceLedger: LedgerEntry[];
  skillsChecklist: {
    wellCovered: SkillAction[];
    claimedUnproven: SkillAction[];
    missing: SkillAction[];
    demonstratedNotAdvertised: SkillAction[];
  };
}

// 8-tier placeholder legend
const MOCK_LEGEND: EvidenceTier[] = [
  { tierNumber: 0, name: "Unverified Claim", weight: 0.1, colorClass: "text-fog" },
  { tierNumber: 1, name: "Self-declared", weight: 0.25, colorClass: "text-brand-blue" },
  { tierNumber: 2, name: "Peer-endorsed", weight: 0.4, colorClass: "text-brand-blue" },
  { tierNumber: 3, name: "Organization-endorsed", weight: 0.5, colorClass: "text-brand-violet" },
  { tierNumber: 4, name: "Certification-backed", weight: 0.65, colorClass: "text-brand-cyan" },
  { tierNumber: 5, name: "AI5K-verified assessment", weight: 0.75, colorClass: "text-brand-cyan" },
  { tierNumber: 6, name: "Project-demonstrated", weight: 0.9, colorClass: "text-brand-mint" },
  { tierNumber: 7, name: "Client-verified delivery", weight: 1.0, colorClass: "text-brand-mint" },
];

export async function getMockAnalyzeReport(): Promise<AnalyzeReport> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  return {
    overallScore: 68,
    sourceCount: 3,
    dimensions: {
      positioning: { currentValue: 80, benchmarkTarget: 90 },
      evidenceQuality: { currentValue: 45, benchmarkTarget: 85 },
      keywordCoverage: { currentValue: 95, benchmarkTarget: 90 },
      portfolioQuality: { currentValue: 60, benchmarkTarget: 80 },
      completeness: { currentValue: 70, benchmarkTarget: 100 },
      conversion: { currentValue: 55, benchmarkTarget: 85 },
      pricingStrategy: { currentValue: 88, benchmarkTarget: 80 },
    },
    blockers: [
      {
        id: "b1",
        description: "Missing real-world project links to verify your AI engineering claims.",
        fieldToFix: "githubUrl"
      }
    ],
    nextActions: [
      {
        id: "a1",
        description: "Upload a recent CV to extract foundational background data.",
        scoreDelta: +15,
        timeEstimateMin: 2,
        fieldToFix: "cvUpload"
      },
      {
        id: "a2",
        description: "Clarify your target niche to improve matching accuracy.",
        scoreDelta: +8,
        timeEstimateMin: 1,
        fieldToFix: "targetNiche"
      }
    ],
    evidenceLegend: MOCK_LEGEND,
    evidenceLedger: [
      { id: "e1", claim: "Built scalable NLP pipelines", tierNumber: 1, sourceRef: "User Onboarding Input" },
      { id: "e2", claim: "AWS Certified Machine Learning Specialty", tierNumber: 4, sourceRef: "Credly Badge (Mocked)" },
      { id: "e3", claim: "Deployed LLM customer service bot", tierNumber: 6, sourceRef: "GitHub repo: /llm-support" },
    ],
    rewrittenProfile: [
      { text: "Senior AI Engineer specializing in ", sourceId: "e1" },
      { text: "scalable NLP pipelines", sourceId: "e1" },
      { text: " and backed by an ", sourceId: "e2" },
      { text: "AWS Machine Learning certification", sourceId: "e2" },
      { text: ". Recently demonstrated ability to ", sourceId: "e3" },
      { text: "deploy LLM customer service bots", sourceId: "e3" },
      { text: " to production.", sourceId: "e3" },
    ],
    skillsChecklist: {
      wellCovered: [
        { skillName: "Python", sourceTags: ["GitHub", "CV"], instruction: "Well documented. No action needed.", fieldToFix: "" }
      ],
      claimedUnproven: [
        { skillName: "PyTorch", sourceTags: ["CV"], instruction: "Add a project link demonstrating PyTorch usage.", fieldToFix: "githubUrl" }
      ],
      missing: [
        { skillName: "Vector Databases", sourceTags: [], instruction: "Highly demanded in your niche. Add to CV if you have experience.", fieldToFix: "cvUpload" }
      ],
      demonstratedNotAdvertised: [
        { skillName: "Docker", sourceTags: ["GitHub"], instruction: "Found in your repos but missing from your profile headline.", fieldToFix: "headline" }
      ]
    }
  };
}

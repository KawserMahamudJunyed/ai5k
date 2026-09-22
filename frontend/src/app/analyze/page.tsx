"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { getMockAnalyzeReport, AnalyzeReport } from "@/lib/mockAnalyze";

export default function AnalyzePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AnalyzeReport | null>(null);

  const runAnalysis = async () => {
    setLoading(true);
    try {
      const data = await getMockAnalyzeReport();
      setReport(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleImprove = (fieldToFix: string) => {
    router.push(`/onboarding/profile?focus=${fieldToFix}`);
  };

  if (!report && !loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center  p-6">
        <div className="max-w-md text-center">
          <h1 className="font-display text-3xl font-bold text-white mb-4">Profile Intelligence</h1>
          <p className="text-fog mb-8">Run a full capability analysis to see how your profile scores against market benchmarks.</p>
          <Button onClick={runAnalysis}>Analyze profile</Button>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center  p-6">
        <div className="w-12 h-12 rounded-full border-4 border-brand-cyan/20 border-t-brand-cyan animate-spin mb-4"></div>
        <p className="text-fog font-medium">Analyzing capability profile...</p>
      </main>
    );
  }

  if (!report) return null;

  return (
    <main className="flex min-h-screen  p-6 md:p-12 text-fog">
      <div className="max-w-5xl mx-auto w-full space-y-12 pb-24">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/10 pb-6">
          <div>
            <h1 className="font-display text-3xl font-bold text-white mb-2">Profile Intelligence</h1>
            <p className="text-sm">Based on {report.sourceCount} verified sources</p>
          </div>
          <Button variant="secondary" onClick={runAnalysis}>Re-analyze</Button>
        </header>

        {/* Top level metrics & Blockers */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <section className="md:col-span-1 p-6 rounded-2xl bg-surface-card border border-surface-card-border">
            <h2 className="font-display text-xl font-bold text-white mb-6">Readiness score</h2>
            <div className="flex items-baseline gap-2 mb-8">
              <span className="font-display text-6xl font-bold text-brand-mint">{report.overallScore}</span>
              <span className="text-sm">/ 100</span>
            </div>
            <div className="space-y-4">
              {Object.entries(report.dimensions).map(([key, dim]) => (
                <div key={key}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <span>{dim.currentValue} / {dim.benchmarkTarget}</span>
                  </div>
                  <div className="w-full h-1.5 bg-void rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${dim.currentValue >= dim.benchmarkTarget ? 'bg-brand-mint' : 'bg-brand-blue'}`}
                      style={{ width: `${(dim.currentValue / Math.max(100, dim.benchmarkTarget)) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="md:col-span-2 space-y-8">
            {report.blockers.length > 0 && (
              <section className="p-6 rounded-2xl bg-red-500/5 border border-red-500/20">
                <h2 className="font-display text-xl font-bold text-red-400 mb-4">Fix before publishing</h2>
                <div className="space-y-3">
                  {report.blockers.map(blocker => (
                    <div key={blocker.id} className="flex items-center justify-between gap-4 bg-void p-4 rounded-xl border border-red-500/10">
                      <p className="text-sm text-red-200">{blocker.description}</p>
                      <button onClick={() => handleImprove(blocker.fieldToFix)} className="text-xs font-semibold px-3 py-1.5 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 transition-colors">
                        Improve
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="p-6 rounded-2xl bg-brand-blue/5 border border-brand-blue/20">
              <h2 className="font-display text-xl font-bold text-brand-blue mb-4">Where to focus next</h2>
              <div className="space-y-3">
                {report.nextActions.map(action => (
                  <div key={action.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-void p-4 rounded-xl border border-brand-blue/10">
                    <div className="flex-1">
                      <p className="text-sm text-white mb-1">{action.description}</p>
                      <p className="text-xs text-brand-blue opacity-80">+{action.scoreDelta} pts • ~{action.timeEstimateMin} mins</p>
                    </div>
                    <button onClick={() => handleImprove(action.fieldToFix)} className="text-xs font-semibold px-4 py-2 bg-brand-blue/20 text-brand-blue rounded hover:bg-brand-blue/30 transition-colors whitespace-nowrap">
                      Improve
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* Rewritten Profile & Evidence */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <section className="space-y-6">
            <h2 className="font-display text-2xl font-bold text-white">Rewritten profile</h2>
            <div className="p-6 rounded-2xl bg-surface-card border border-surface-card-border leading-relaxed text-sm">
              {report.rewrittenProfile.map((claim, i) => {
                if (!claim.sourceId) {
                  console.error("Mock violated rule: claim rendered without sourceId");
                  return <span key={i}>{claim.text}</span>;
                }
                const tier = report.evidenceLedger.find(l => l.id === claim.sourceId)?.tierNumber || 0;
                const legendEntry = report.evidenceLegend.find(l => l.tierNumber === tier);
                return (
                  <span 
                    key={i} 
                    className={`inline px-1 py-0.5 rounded mr-0.5 ${legendEntry?.colorClass.replace('text-', 'bg-').replace(/$/, '/10')}`}
                    title={`Source: ${claim.sourceId}`}
                  >
                    <span className={legendEntry?.colorClass || "text-white"}>{claim.text}</span>
                  </span>
                );
              })}
            </div>

            <h2 className="font-display text-2xl font-bold text-white pt-4">Evidence tiers</h2>
            <div className="flex flex-wrap gap-2">
              {report.evidenceLegend.map(tier => (
                <div key={tier.tierNumber} className="flex items-center gap-2 text-xs bg-surface-card border border-surface-card-border px-3 py-1.5 rounded-full">
                  <span className={`w-2 h-2 rounded-full ${tier.colorClass.replace('text-', 'bg-')}`}></span>
                  <span className="text-white">{tier.tierNumber}: {tier.name}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-6">
            <h2 className="font-display text-2xl font-bold text-white">Evidence ledger</h2>
            <div className="space-y-2">
              {report.evidenceLedger.map(entry => {
                const legendEntry = report.evidenceLegend.find(l => l.tierNumber === entry.tierNumber);
                return (
                  <div key={entry.id} className="p-4 rounded-xl bg-surface-card border border-surface-card-border flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-sm text-white font-medium">&quot;{entry.claim}&quot;</p>
                      <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-void ${legendEntry?.colorClass || "text-white"}`}>
                        Tier {entry.tierNumber}
                      </span>
                    </div>
                    <p className="text-xs text-brand-blue">Source: {entry.sourceRef}</p>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Skills Checklist */}
        <section className="space-y-6">
          <h2 className="font-display text-2xl font-bold text-white">Skills checklist</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(report.skillsChecklist).map(([category, skills]) => (
              <div key={category} className="bg-surface-card border border-surface-card-border rounded-xl p-5">
                <h3 className="font-display text-sm font-bold text-white mb-4 capitalize">
                  {category.replace(/([A-Z])/g, ' $1').trim()}
                </h3>
                <div className="space-y-4">
                  {skills.length === 0 ? (
                    <p className="text-xs text-fog italic">None identified</p>
                  ) : (
                    skills.map((skill, i) => (
                      <div key={i} className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white">{skill.skillName}</span>
                          <div className="flex gap-1">
                            {skill.sourceTags.map(tag => (
                              <span key={tag} className="text-[9px] uppercase bg-void px-1.5 py-0.5 rounded text-fog border border-white/10">{tag}</span>
                            ))}
                          </div>
                        </div>
                        <p className="text-xs text-fog">{skill.instruction}</p>
                        {skill.fieldToFix && (
                          <button onClick={() => handleImprove(skill.fieldToFix)} className="text-xs self-start font-medium text-brand-cyan hover:text-white transition-colors">
                            Improve
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Next steps — keeps the flow moving instead of dead-ending */}
        <section className="p-6 rounded-2xl bg-surface-elevated/60 border border-white/10">
          <h2 className="font-display text-xl font-bold text-white mb-4">Keep going</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <a
              href="/profile/me/skills"
              className="p-5 rounded-xl bg-void border border-surface-border hover:border-brand-cyan/40 transition-colors group"
            >
              <p className="text-white font-semibold mb-1 group-hover:text-brand-cyan transition-colors">Claim your skills</p>
              <p className="text-sm text-fog">Add what you can do and set proficiency levels.</p>
            </a>
            <a
              href="/profile/me/services"
              className="p-5 rounded-xl bg-void border border-surface-border hover:border-brand-cyan/40 transition-colors group"
            >
              <p className="text-white font-semibold mb-1 group-hover:text-brand-cyan transition-colors">List a service</p>
              <p className="text-sm text-fog">Turn your skills into bookable offerings.</p>
            </a>
            <a
              href="/profile/me"
              className="p-5 rounded-xl bg-void border border-surface-border hover:border-brand-cyan/40 transition-colors group"
            >
              <p className="text-white font-semibold mb-1 group-hover:text-brand-cyan transition-colors">Polish your profile</p>
              <p className="text-sm text-fog">Edit headline, roles, links, and visibility.</p>
            </a>
          </div>
        </section>

      </div>
    </main>
  );
}



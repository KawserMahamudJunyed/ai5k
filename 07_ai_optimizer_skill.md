# 07. Reusable AI Skill: Fiverr AI Profile & Gig Optimizer

> **Skill Name**: `fiverr_ai_optimizer`  
> **Version**: 1.0.0  
> **Purpose**: Automated auditing, copy generation, SEO keyword optimization, and conversion engineering for Fiverr AI seller profiles and gigs.

---

## 1. Skill Overview & Trigger Commands

The `fiverr_ai_optimizer` skill functions as an expert AI consultant that continuously monitors seller analytics, evaluates marketplace competition, and generates ready-to-paste optimization assets.

### Recognized User Triggers
- `"Audit my Fiverr profile and suggest improvements."`
- `"Optimize this Fiverr gig title, tags, and description for RAG search."`
- `"Diagnose why my impressions are high but click-through rate is low."`
- `"Refresh keyword targets for my AI Agent gig based on current search trends."`
- `"Generate a custom offer and project proposal for this enterprise inquiry."`
- `"Create a 30-day experiment plan to boost gig conversion."`

---

## 2. Input Requirements

To execute a full optimization cycle, the skill accepts the following structured inputs:
- `current_profile`: Text copy of headline, narrative description, skills list, and languages.
- `current_gig`: Title, category, metadata, tags, full description text, package table, and FAQs.
- `seller_metrics`: Success Score (1-10), Seller Level, Impressions (last 30 days), Clicks, Messages, Orders, Conversion Rate (%), Cancellation Rate (%).
- `target_persona`: Target buyer category (e.g., Enterprise Leader, SaaS Founder, SMB Owner).
- `competitor_samples`: (Optional) Text or screenshots of top 3 competing gigs in the target subcategory.

---

## 3. 22-Step Optimization Workflow

```
 1. Input Validation          -->  2. Research Freshness Check  -->  3. Policy Compliance Scan
 4. Intent Classification      -->  5. Positioning Audit        -->  6. Relevance Analysis
 7. Keyword Coverage Audit     -->  8. Competitive Gap Audit    -->  9. Conversion Funnel Check
10. Root Cause Diagnosis       --> 11. Recommendation Prioritization --> 12. Copy Drafting
13. Compliance Validation      --> 14. Duplication Check       --> 15. Character Limit Audit
16. Before/After Comparison    --> 17. Change Request Generation --> 18. HUMAN SELLER APPROVAL
19. Publication Logging        --> 20. Test Period Setup        --> 21. Analytics Review
22. Retain or Rollback Decision
```

### Detailed Workflow Step Execution

1. **Input Validation**: Verify all required fields (gig copy, metrics) are present and readable.
2. **Freshness Verification**: Confirm platform policies and category limits align with recent 2025/2026 Fiverr rules.
3. **Policy Compliance Scan**: Ensure copy does not include forbidden contact keywords (email, WhatsApp, pay outside), guaranteed rankings, or false claims.
4. **Buyer Intent Classification**: Identify if query target is Transactional, Commercial, Problem-Based, or Enterprise Advisory.
5. **Positioning Audit**: Check if profile/gig copy communicates 30+ yrs enterprise authority + hands-on engineering capabilities.
6. **Relevance Analysis**: Measure keyword alignment between title, primary search tags, category metadata, and opening description paragraph.
7. **Keyword Coverage Audit**: Calculate density of primary and long-tail terms; detect and remove keyword stuffing (>3% density).
8. **Competitive Gap Audit**: Compare gig structure against top 5% competitor benchmarks (video usage, FAQ quality, package boundaries).
9. **Conversion Funnel Check**: Map performance drop-offs (e.g., High Impressions + Low Clicks = Weak Thumbnail/Title; High Clicks + Low Messages = Weak Description/Price).
10. **Root Cause Diagnosis**: Output exact bottleneck diagnosis (e.g., "Package pricing is unanchored, causing price resistance").
11. **Recommendation Prioritization**: Rank action items by Impact vs. Effort.
12. **Copy Drafting**: Generate revised mobile-first description, package names, 10 FAQs, and 5 title options.
13. **Compliance Validation**: Pass generated text through automated compliance rules.
14. **Duplication Check**: Ensure text is 100% original and not duplicated across seller's other gigs.
15. **Character Limit Audit**: Check character counts against strict Fiverr UI limits (Headline: 70, Title: 80, Description: 4000, FAQ Q: 100, FAQ A: 300).
16. **Before/After Comparison**: Render side-by-side diff showing exact text changes and SEO rationale.
17. **Change Request Generation**: Create a structured JSON change log object.
18. **HUMAN SELLER APPROVAL**: Pause workflow and present change request for manual seller review and confirmation.
19. **Publication Logging**: Log approved changes into the Operating System database with a timestamp.
20. **Test Period Setup**: Schedule a 14-day performance tracking window.
21. **Analytics Review**: Compare post-edit CTR, impressions, and inquiries against baseline metrics.
22. **Retain or Rollback Decision**: Retain changes if metrics improve; trigger rollback if performance declines by >15%.

---

## 4. Skill Guardrails & Strict Constraints

> [!CAUTION]
> **Enforced Guardrail Rules**:
> 1. NEVER fabricate credentials, degrees, client names, revenue numbers, or project outcomes.
> 2. NEVER copy competitor text directly.
> 3. NEVER suggest or include off-platform contact details (email, phone, Telegram, Skype) or off-platform payment methods.
> 4. NEVER guarantee #1 Fiverr ranking or specific order volume.
> 5. NEVER execute automatic publishing via browser scripts—ALL updates must be manually reviewed and pasted by the human seller.

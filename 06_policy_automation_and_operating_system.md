# 06. Fiverr Automation Policy Register & Seller Operating System Schema

## 1. Fiverr Automation Policy Register

Automation MUST follow strict policy compliance. Direct browser scraping, unsolicited messaging bots, fake online status scripts, and unapproved API bots violate Fiverr Terms of Service and lead to account suspension.

| Automation Activity | Allowed | Restricted | Prohibited | Official Policy Source | Recommended Safe Method |
|---|---|---|---|---|---|
| **AI Content Draft Generation** | Yes | - | - | Fiverr AI Policy (2025) | AI drafts profile/gig copy; Human reviews, edits, and manually pastes. |
| **External Analytics Extraction** | - | Yes | - | Fiverr API Terms | Use manual CSV export from Seller Dashboard or official API partners. |
| **Automated Buyer Outreach / Spam** | - | - | Yes | Fiverr TOS Section 4 | **PROHIBITED**: Never send unsolicited messages to users. |
| **Browser Auto-Refresh Bots** | - | - | Yes | Community Standards | **PROHIBITED**: Use official mobile app push notifications for instant alerts. |
| **Direct Gig Editing via Script** | - | - | Yes | Fiverr Terms of Service | **PROHIBITED**: Perform all profile/gig updates manually inside Fiverr UI. |
| **Sharing Contact / Off-Platform Pay** | - | - | Yes | Fiverr TOS Section 1 | **PROHIBITED**: Keep all communication and payments strictly on Fiverr. |
| **Portfolio / GitHub Linking** | - | Yes | - | Fiverr Approved Link Policy | Link ONLY to Fiverr-approved domains (e.g., GitHub, Vimeo, YouTube, Behance). |

---

## 2. Fiverr Profile Operating System Data Model

To maintain a single source of truth across all seller assets, keywords, pricing, FAQs, and performance metrics, we establish a relational database schema. This schema can be implemented in **Notion**, **Airtable**, **Supabase**, or **PostgreSQL**.

### Stack Evaluation Matrix

| Stack Option | Ease of Use | Cost | Automation Capability | Version Control | Auditability | Recommendation |
|---|---|---|---|---|---|---|
| **Notion** | High | Free / Low | Medium (Zapier/n8n) | Medium | Good | **Recommended for Content & Strategy** |
| **Airtable** | High | Medium | High (Native Automations) | Medium | Excellent | **Recommended for Operations & CRM** |
| **Supabase / PostgreSQL** | Low (Requires SQL) | Low | Unlimited (Custom Python/n8n) | High | Excellent | **Recommended for Enterprise AI Integration** |

### Relational Entity Schema Definition (27 Core Entities)

```
[Seller] 1 --- * [Credential]
[Seller] 1 --- * [Skill]
[Seller] 1 --- * [Gig]
  |
  +--- * [Gig Version] 1 --- * [Change Request]
  +--- * [Package]
  +--- * [Gig Extra]
  +--- * [FAQ]
  +--- * [Buyer Requirement]
  +--- * [Keyword Map] 1 --- 1 [Keyword Cluster]
  +--- * [Portfolio Item] 1 --- * [Media Asset]
[Gig] 1 --- * [Inquiry] 1 --- 1 [Order] 1 --- 1 [Review Theme]
[Order] 1 --- * [Delivery Asset]
[System] 1 --- * [Analytics Snapshot]
[System] 1 --- * [Experiment Log]
[System] 1 --- * [Policy Rule]
```

#### Entity Definitions (Sample)

1. **`Seller`**: Master record containing seller bio, positioning pillars, tone of voice, verified credentials, and account status.
2. **`Gig`**: Core service entity holding primary title, category metadata, active status, performance rank, and overall impression score.
3. **`Gig_Version`**: Version-controlled snapshot of title, description, package pricing, and search tags.
4. **`Keyword_Map`**: Terminology repository tracking search volume, competition score, buyer intent category, and target gig assignment.
5. **`Change_Request`**: Human-in-the-loop log tracking proposed edit, justification, safety compliance status, approval date, and roll-back trigger.

---

## 3. Human-in-the-Loop Audit & Approval Engine

```
[AI Keyword/Gig Audit Triggered]
             |
[AI Skill Generates Optimized Content Draft]
             |
[Automated Compliance Check: Character Caps, Forbidden Links, Keyword Density]
             |
  (Pass) ---> [Change Request Logged in OS Database]
                     |
        [HUMAN SELLER REVIEW & APPROVAL]
                     |
  (Approved) -> [Manual Paste & Publish to Fiverr UI] -> [Record Launch Snapshot]
```

- **Safety Rule**: No AI system or script is permitted to directly mutate live Fiverr gig content without manual seller inspection, approval, and audit logging.

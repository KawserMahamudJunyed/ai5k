# 06. Upwork Automation Policy Register & Seller Operating System Schema

## 1. Upwork Automation Policy Register

Automation on Upwork MUST strictly adhere to platform policies. Unapproved proposal spamming, auto-bidding bots, scraping job posts in violation of API terms, or sharing off-platform contact info prior to contract hiring will result in immediate account suspension.

| Automation Activity | Allowed | Restricted | Prohibited | Official Policy Source | Recommended Safe Method |
|---|---|---|---|---|---|
| **AI Proposal Copy Drafting** | Yes | - | - | Upwork AI Policy (2025) | AI generates proposal draft based on job post; Human seller reviews, customizes, and submits manually. |
| **External Job Feed Monitoring** | - | Yes | - | Upwork API Terms | Use official Upwork RSS feeds or Upwork API to monitor target keywords. |
| **Automated Proposal Spamming** | - | - | Yes | Upwork Terms of Service | **PROHIBITED**: Submit only highly customized, human-vetted proposals. |
| **Pre-Contract Off-Platform Comms** | - | - | Yes | User Agreement Section 7 | **PROHIBITED**: Keep all communication on Upwork Messages/Zoom prior to contract hire. |
| **Direct Auto-Bidding Bots** | - | - | Yes | Upwork TOS | **PROHIBITED**: Evaluate each job fit and Connects cost manually. |
| **Sharing Payment Info / Off-Platform Pay**| - | - | Yes | User Agreement Section 7 | **PROHIBITED**: All billing and payments MUST stay strictly on Upwork. |

---

## 2. Upwork Operating System Data Model

To manage proposals, job feeds, specialized profiles, Project Catalog items, client contracts, and JSS analytics, we establish a relational database schema (Notion, Airtable, or PostgreSQL).

```
[Freelancer Profile] 1 --- * [Specialized Profile]
[Freelancer Profile] 1 --- * [Project Catalog Item]
[Freelancer Profile] 1 --- * [Upwork Consultation]
  |
[Job Feed Entry] 1 --- 1 [Proposal Log] 1 --- 1 [Client Contract]
  |                                                  |
[Connects Ledger]                               [JSS Impact Tracker]
```

### Core Entities Definitions
1. **`Job_Feed_Entry`**: Ingests target AI job posts via RSS/API, scoring each post on budget, client payment verification, and technical fit score.
2. **`Proposal_Log`**: Tracks submitted proposals, Connects spent, boost position, response status, and interview conversion.
3. **`Client_Contract`**: Tracks active hourly/fixed contracts, escrow milestones, logged hours, and public/private feedback logs.
4. **`JSS_Tracker`**: Records weekly JSS percentage, completed contract volume, and badge qualification indicators.

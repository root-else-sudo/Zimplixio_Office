# Zimplixio CRM v2 — Planning: Function, Architecture & Design

| Field | Value |
|---|---|
| **Document Type** | Planning Specification (Function + Architecture + Design) |
| **Companion To** | CRM Department Redesign — Project Charter (2026-07-02) |
| **Version** | 4.0 (draft) |
| **Date Issued** | 2026-07-03 |
| **Owner** | Joe Ugalde |
| **Consumer** | Claude Code (implementation) |
| **Status** | Draft for owner review |

---

## Implementation Status (as of 2026-07-12)

This document is the original planning spec — kept as-is below as the decision record. What's actually happened since:

- **§7 Build Order — all 5 increments are complete and live**, not just "usable when" targets: generic Department + shared anatomy (seeded for all six departments), Company Profile + Findings, the Research Engine (Ground→Gather→Hypothesize→Test→Queue, scheduled + Run-now), the Review UI (approve/reject with written reason), and the Guidance Summary learning loop. See `docs/superpowers/specs/2026-07-09-crm-v2-implementation-audit.md` for a full gap audit against this doc and the three others — most gaps found there have since been fixed (MFA now enforced at both the page and API layer, login rate limiting, several UI bugs); a handful remain open by choice (recovery codes, an audit log table, Goals/Tasks creation UI, a toast system, wider Research-Engine source coverage, an app-shell top bar — each deferred to its own design conversation rather than rushed).
- **§5 (Development & Deployment Model) describes an earlier, more tentative plan than what was actually built.** The real git/environment model is `main` (production) / `development` (working branch) — not `main`/`develop`/`feature/*` — and there is currently only **one** Railway environment (`development`, which `crm.zimplixio.com` currently points at); a separate `production` environment is designed but not yet provisioned. The dedicated `2026-07-05-crm-v2-environments-and-git-workflow.md` doc in this same folder is the accurate, superseding reference for this — read that one, not §5 below, for the real operational model. Database migrations, originally envisioned as a manual staging-first gate (§5.3), are now applied automatically on every deploy via a Railway pre-deploy command (see that doc's §4).

---

## 0. What This Document Is

This is the planning reference for Zimplixio CRM v2, consumed by Claude Code. It is organized in parts:

- **Part I — Function** (§1–§2): what each department is, and what the Research Engine does.
- **Part II — Architecture** (§4): how the system is structured — layers, the generic-department model, where the agent runs.
- **Part III — Operations** (§5): the development and deployment model — branches, environments, migrations.
- **Part IV — Design Patterns** (§6) and **Build Order** (§7): the reusable solutions and the sequence of work.

Order matters: **architecture precedes design patterns** (§3 explains why). Function was settled first, because you cannot structure what you have not defined.

**Rebuild stance.** V2 is a **clean rebuild in the existing repository; V1 is fully sunset.** Nothing from V1's schema, tables, or columns carries over by default — a structure survives only if it is independently the right design for V2, judged on its own merits, not because it already exists. Keeping V1 artifacts "just in case" is the accretion that made V1 unmaintainable; there is no production data to preserve, so there is nothing to lose by discarding what does not add value. The **stack tooling** is kept (see §4), because those tools would win a fresh evaluation anyway — that is not reuse of V1, it is keeping the right toolbox.

**Governing rule.** The charter locks scope. This document elaborates within that scope. Where it revises a charter decision (e.g. anatomy now includes basic Knowledge + KPIs; features are rebuilt rather than rehomed), the owner has approved that revision.

---

## 1. Department Structure — The Skeleton

### 1.1 The Company, by Department

The CRM is organized as a **company made of departments**. Each department is a real, navigable, record-backed unit. **All six exist from day one**; they are built out one at a time (basic → complex). Naming a department reserves its seat; it does not require immediate build-out.

Build order in this phase: **Product/Research is built in full; the other five are reserved seats** — navigable and seeded with a starter anatomy, but not developed further yet.

*How the departments are surfaced in the interface (a sidebar, or a better model) is a design decision, deferred to the architecture layer (§7).*

| Department | Build Status |
|---|---|
| Product / Research | First department built |
| Engineering | Reserved seat |
| Marketing | Reserved seat |
| Sales | Reserved seat |
| Finance | Reserved seat |
| Operations | Reserved seat (owner's supervisor seat) |

### 1.2 Shared Department Anatomy

Every department shares the same base shape — revised from the charter's original Goals + Tasks to include a *basic* Knowledge and KPI layer from day one, seeded rather than empty:

- **Goals** — what the department is trying to achieve.
- **Tasks** — concrete work laddering up to goals.
- **Knowledge (basic)** — the department's starting operating context, seeded from how this function works in practice.
- **KPIs (basic)** — a small set of standard metrics the department is measured by.

"Basic → complex" means all four are present but shallow now, deepening later — not two layers now and two bolted on afterward. The seeded content below is a starting point for the owner to refine, not a finished system.

### 1.3 The Six Departments

Each department is defined by its **purpose**, **core functions**, **CRM home**, and a **seeded** starter Knowledge + KPI set.

Note on CRM home: V2 does **not** migrate V1's tables. Where a department will eventually own a capability that V1 had (Posts, Projects, Opportunities), that capability is **rebuilt fresh** when the department is built — V1's version is discarded, not lifted and shifted.

#### 1. Product / Research — *first department built*

- **Purpose:** Discover and validate viable niches and service needs for US SMBs that Zimplixio can credibly serve — and, over time, turn a proven service into a repeatable product.
- **Core functions:** market and opportunity research; customer need discovery; competitive and landscape scanning; niche and hypothesis validation; capability-fit analysis; service-to-product evolution.
- **CRM home:** Company Profile, Findings, and the Research Engine (§2) — all net-new.
- **Feeds:** Marketing (what to talk about) and Sales (who to talk to). It exists first on purpose — a company has nothing to market or sell until it knows what it solves and for whom. This corrects the v1 mistake of producing output on assumed pain points.

**Starter Knowledge (seeded)**
- Operating principle: solve a real US-SMB need as a **service** first; **productize** once client work reveals the repeatable pattern. There is no product without serving clients first.
- Fit lens: every opportunity is judged against Zimplixio's five service lines (Roadmap & Planning; Solution Architecture & Implementation; Data Engineering & Automation; Embedded Technical Partnership; AI & Agentic Automation).
- Needs are stated nowhere and implied everywhere: they are inferred by connecting dots across broad signal, then tested — not read off a single report.

**Starter KPIs (basic)**
- Validated service opportunities per month
- Validation rate (validated ÷ candidates surfaced)
- Opportunities that became a client engagement
- Candidate → validated turnaround time

#### 2. Engineering — *reserved seat*

- **Purpose:** Build and maintain the solutions Zimplixio delivers — client work and internal tooling alike.
- **Core functions:** solution design; development; delivery; maintenance and evolution; technical project execution.
- **CRM home:** project and technical-delivery tracking, rebuilt fresh when this department is built (V1's Projects feature is discarded, not migrated).

**Starter Knowledge (seeded)**
- Tech-agnostic across backend/frontend frameworks, relational & cloud databases, cloud platforms, data engineering (Azure Data Factory, SSIS), and agentic AI.
- Work runs in focused sprints with client-visible progress, following a PDCA methodology.
- Outcome over output — "done isn't done until it works."

**Starter KPIs (basic)**
- On-time milestone delivery rate
- Active projects in flight
- Post-delivery rework rate
- Cycle time per engagement phase

#### 3. Marketing — *reserved seat*

- **Purpose:** Create demand — build the brand, produce content, and engage prospects.
- **Core functions:** content creation; brand and positioning; campaign management; demand generation; audience engagement.
- **CRM home:** content and campaign management, rebuilt fresh when this department is built (V1's Posts feature is discarded, not migrated).
- **Relationships:** consumes validated Findings from Product/Research (so messaging is grounded in real needs, not guesses); hands qualified interest to Sales.

**Starter Knowledge (seeded)**
- Ground all messaging in validated Findings, not assumptions — this is the core v1 fix.
- Positioning: "Enterprise expertise, SMB agility"; value-plus-cost framing, never cost-leading.
- High-trust content angles: "we use what we build" and the data-migration rescue story. Primary channel today: LinkedIn.

**Starter KPIs (basic)**
- Publishing cadence (posts per week)
- Engagement rate per post
- Qualified leads handed to Sales
- Audience / follower growth

#### 4. Sales — *reserved seat*

- **Purpose:** Convert demand into revenue — outreach, qualification, and closing.
- **Core functions:** prospecting; outreach; pipeline / opportunity management; closing; handoff to delivery.
- **CRM home:** pipeline and opportunity management, rebuilt fresh when this department is built (V1's Opportunities feature is discarded, not migrated).
- **Relationships:** receives leads from Marketing (lead handoff); draws target context from Product/Research Findings.

**Starter Knowledge (seeded)**
- Positioning anchor: systems builder, not a hire substitute — "control plus the technology."
- Credibility sequencing: value first, credentials (PayPal, HP, IBM) after.
- Engagement path: Discovery → Assessment → Execution → Deliver. Book at zimplixio.com/book.

**Starter KPIs (basic)**
- Discovery calls booked
- Open pipeline value
- Win rate (closed-won ÷ total)
- Sales-cycle length

#### 5. Finance — *reserved seat*

- **Purpose:** Manage the money — expenses, costs, runway, and billing.
- **Core functions:** budgeting; expense and cost tracking; invoicing and billing; cash-flow and runway monitoring; financial reporting.
- **CRM home:** net-new; no V1 feature is a source.

**Starter Knowledge (seeded)**
- Billing models: Fixed Fee and T&M only — no retainers; Net 15 terms.
- Pricing rhythm: fixed assessment fee upfront, 50% deposit before execution, balance at delivery.
- US B2B: PDF invoices are legally sufficient; W-9 and 1099-NEC are the key administrative items.

**Starter KPIs (basic)**
- Monthly revenue
- Runway (months of cost covered)
- Receivables outstanding / average days-to-pay
- Gross margin per engagement

#### 6. Operations — *reserved seat; owner's supervisor seat*

- **Purpose:** Run the company as a whole — strategy, coordination, and cross-department oversight. This is where the human supervises the system.
- **Core functions:** company strategy; cross-department coordination; system oversight. People/HR and Legal fold in here for now (real functions, but they do not yet earn standalone seats).
- **CRM home:** the supervisory layer; net-new. In the long-term vision, the seat above the future department agents.

**Starter Knowledge (seeded)**
- Founder-led, remote-first, two-person core (Joe Ugalde + Maria Jose Espinoza).
- People/HR + Legal live here for now — contracts/NDAs, contractor administration.
- Long-term, this becomes the supervision layer coordinating each department's agent.

**Starter KPIs (basic)**
- Cross-department goal completion
- Owner review turnaround (health of the human-in-the-loop gate)
- Departments / agents operational
- Overall system output health

### 1.4 Department Relationships (connective tissue)

Not built in this phase, but recorded so the structure anticipates it:

- **Product/Research → Marketing and Sales:** validated Findings are the grounded input both consume.
- **Marketing ↔ Sales:** separate but linked by a lead handoff (different jobs, different data, different future agents).
- **Operations → all:** supervises and coordinates the rest.

---

## 2. Product / Research — The First Department

Product/Research is built in full and serves as the reference implementation for every department that follows. It carries the shared anatomy (Goals, Tasks, Knowledge, KPIs from §1.3) plus three artifacts specific to this department: the **Company Profile**, **Findings**, and the **Research Engine**. The Research Engine is a **function of this department** — the department is the container; the engine is one thing it runs.

### 2.1 Company Profile

The canonical, editable source of truth describing what Zimplixio **can offer as a service**. It is written as **freeform prose** — the agent reads and interprets it (no tagged/structured capability list at this stage). It is **seeded from Zimplixio's real service capabilities** (the five service lines and how they're delivered), and the owner edits it as the offering sharpens.

Its job in the loop: it is the **fit lens**. A discovered need only becomes a valid Finding if the Company Profile shows Zimplixio can credibly serve it.

### 2.2 Findings

A Finding is the department's unit of output. It is **not a bare pain point** — it is a **candidate service opportunity**: a service US SMBs appear to need, that Zimplixio can credibly offer. Each Finding carries:

- the **need / niche** and the service that would address it;
- the **evidence** — the dots across sources that support it;
- a **fit rationale** tying it to a specific Zimplixio capability. No fit rationale → not a valid Finding.

**Finding Lifecycle**

```
candidate --> validated
          \-> rejected
```

- **candidate** — surfaced by the engine, awaiting review.
- **validated** — owner confirms it is a real need Zimplixio should offer as a service.
- **rejected** — owner dismisses it, with a reason (which feeds learning).

> **Decision — resolved.** Ship **two-state** (candidate / validated / rejected). A third "approved" state (real-but-parked vs. greenlit-to-offer) is trivially added later — one enum value and one transition — so two-state now does not lock it out. See §4.5.

### 2.3 The Research Engine — A Function of This Department

The engine is how Product/Research does its work on an ongoing basis. Its aim is not to collect pain points — it is to run the **service-to-product** motion: find a service US SMBs need, validate it, so Zimplixio can offer it now and productize it later. Research is a **continuous loop, not a one-time pass**; each run sharpens on the last run's feedback.

**The Two Grounding Inputs**

- **Company Profile** (§2.1) — grounds *fit*: can Zimplixio credibly serve this?
- **Guidance Summary** — a plain-English distillation of what the owner's past feedback has taught the engine to look for or avoid. Grounds *relevance*. Empty on the first run; grows with each cycle.

**The Loop**

```
   +-----------------------------------------------------+
   |                                                     |
   v                                                     |
[1] GROUND --> [2] GATHER --> [3] HYPOTHESIZE --> [4] TEST
                                                     |
                                                     v
       [7] LEARN <-- [6] REVIEW <-- [5] QUEUE
   |
   +--------------------> (feeds next run's [1] GROUND)
```

1. **Ground** — Load the Company Profile and the current Guidance Summary. Together they are the run's operating context: what Zimplixio can offer, and what the owner has taught the engine to look for.
2. **Gather** — Cast wide across the US-SMB signal field: industry and business news, SMB-focused podcasts, business books, trade and owner communities, association/government data (NFIB, SCORE, SBA), and **social and creator signal** — SMB owners airing needs directly on social media, and content creators now openly discussing SMB problems. This vector often surfaces a need before it reaches any report, and the engine scrapes it via Tavily alongside the rest. **The point is breadth** — no single source announces a need, so the engine reads across many.
3. **Hypothesize (connect the dots)** — The engine does not wait to be told what SMBs need; it **connects patterns across the gathered signal into a hypothesis**: a service SMBs appear to need that Zimplixio can offer. Each hypothesis becomes a candidate Finding (need + evidence + fit).
4. **Test** — The engine actively seeks **corroborating and disconfirming evidence** for each hypothesis across the material, assigning a confidence and dropping the unsupported. This is the "our job is to test that statement" step — a hypothesis is not a Finding until it survives a look for evidence against it.
5. **Queue** — Surviving candidates are deduplicated against existing Findings (in any state); only genuinely new ones enter the review queue.
6. **Review (human gate)** — The owner **validates or rejects** each candidate, **with a written reason**. The owner is the final test. Nothing advances, and nothing is offered to market, without explicit owner action.
7. **Learn** — The written reasons are distilled into an updated Guidance Summary, which feeds **[1] Ground** next run. The loop closes; the next run is better-aimed.

**Cadence**
- **Scheduled** recurring (e.g. weekly) via pg-boss — the department keeps working even when the owner is away.
- **On-demand** via a "Run now" trigger for immediate execution.

**The Learning Loop — functional requirement.** The "gets more accurate every run" behavior comes entirely from the Guidance Summary being rewritten from feedback and re-fed each run. Per charter, the v1 mechanism is an **in-context prose summary** — no scoring rubric, no vector memory, no model training. It must be **compacted, not appended**: a tight, rewritten summary of accumulated learning, not a growing log — otherwise it eventually crowds out the actual research context.

> **Deferred design task — Source Strategy.** *How* each medium is actually reached (podcast transcripts, what to do about copyrighted books, which specific shows/sources make the curated seed list, per-medium extraction and tiering) is a distinct, tactical design task **owned by the Research Engine build** — not settled here. It is deliberately kept out of this foundational document; it will be designed in its own pass once the loop skeleton runs against the easy sources first. See §7.

### 2.4 Beyond the MVP — From Service to Product

The MVP loop stops at a **validated service opportunity** — a need Zimplixio can go serve for clients *now*. That urgency is deliberate: the firm needs clients first, and real client interaction is what reveals how a one-off service becomes a repeatable **product** that serves many. Productization is therefore the department's **next maturity stage**, informed by delivery experience — not part of the first slice. The structure anticipates it; this phase does not build it.

### 2.5 What the Department Produces

Validated Findings are the output — evidence-backed service opportunities that (a) Sales and Marketing take to market to win clients now, and (b) feed the future productization stage. This is the structural fix for v1: downstream output flows from **research**, not assumptions.

---

## 3. From Function to Form — Why Architecture Precedes Patterns

With function settled, two things remain: the **architecture** (the shape of the system) and the **design patterns** (the reusable solutions used inside that shape). They are written in that order, on purpose.

- **Architecture is the constraint; patterns operate inside it.** You cannot choose the pattern for "how six departments share one shape" until architecture has decided whether a department is one generic entity or six parallel ones.
- **Architecture is the expensive-to-reverse layer.** Getting the department abstraction wrong means refactoring six departments — the exact v1 pain. A wrong pattern inside one module is a cheap, local fix. Lock the costly decisions first.
- **Patterns without architecture drift.** Standardize patterns before the structure exists and each module invents its own — the accretion that produced v1.

The caveat specific to this system: the single most important architectural decision *is itself a pattern choice* — how a department is modeled generically so #2 is clone-and-fill. So it is not a clean waterfall. Architecture comes first, and the **first pattern chosen — the department model — is load-bearing architecture**; everything else slots in after. That decision is the keystone of §4.

---

## 4. Architecture — The Shape of the System

**Clean rebuild, same repository.** V2 is built fresh in the existing repo (§0). The **stack tooling is kept** — Next.js App Router + TypeScript, Prisma + PostgreSQL, NextAuth, Tailwind, Railway — because each would win a fresh evaluation for an internal SaaS-style dashboard with CRUD plus background jobs. No new load-bearing framework is introduced. But every **schema decision** is re-derived from V2's needs; nothing is inherited from V1's shape.

**One deliberate simplification from V1 — single language.** V1 ran two repos and two languages: the Next.js app plus a separate Python pipeline, communicating through the database, with the worker cloning the Python repo at startup and spawning Python child processes. That cross-language, child-process arrangement was a real source of V1's operational complexity. V2's agent work is API orchestration and LLM calls — Tavily and Claude both have first-class TypeScript SDKs, and there is no heavy data/ML work that would justify Python. So **the Research Engine is built as TypeScript modules the worker calls directly**, not Python scripts it spawns. One language, one repo, one toolchain, and the Zod validation contract becomes native instead of a cross-language JSON handoff.

### 4.1 Architectural Goals (from the charter)

- **Clone-and-fill extensibility** — adding department #2 does not touch department #1.
- **Agent-ready** — every department can later host an agent without structural change.
- **Human-in-the-loop preserved** — nothing acts or publishes without explicit owner approval.
- **Single source of truth** — PostgreSQL holds all state; no parallel stores.
- **Maintainable and scalable** — the v1 failures this redesign exists to fix.

### 4.2 The Layered Shape

Five layers, top to bottom.

```
+-----------------------------------------------------------+
| PRESENTATION   Next.js App Router                         |
|   server components fetch -> props -> client components    |
+-----------------------------------------------------------+
| API / MUTATION   route handlers                           |
|   approve/reject, edit, Run-now, profile edits            |
+-----------------------------------------------------------+
| DOMAIN                                                    |
|   Department (generic): Goals . Tasks . Knowledge . KPIs   |
|   Product/Research artifacts: Company Profile . Findings   |
+-----------------------------------------------------------+
| JOBS / AGENTS   pg-boss + Worker (TypeScript)             |
|   Research Engine: Ground>Gather>Hypothesize>Test>Queue   |
+-----------------------------------------------------------+
| DATA   PostgreSQL (single source of truth) via Prisma      |
+-----------------------------------------------------------+
```

### 4.3 The Keystone Decision — Modeling a Department Generically

This is the load-bearing choice. Three approaches, with a recommendation. The goal it must serve: **adding a department is filling in a shape, never rebuilding one.**

**Option A — Generic Department + shared anatomy + per-department extensions — RECOMMENDED**
- One **Department** entity (id, key, name, status). The shared anatomy — Goals, Tasks, Knowledge, KPIs — are shared tables that reference a department. Department-specific artifacts (Company Profile, Findings) live in their own tables keyed to the department that owns them.
- Adding a department = one new Department row (+ optional new extension tables if it has special artifacts). The five reserved seats are just rows with seeded anatomy and no extensions yet.
- This is exactly the generic-vs-specific fault line: shared anatomy stays generic; Product/Research's specifics stay on the specific side and never leak into the base.
- *Type-safe, Prisma-native, clone-and-fill, and it matches the charter's whole thesis.*

**Option B — Config / metadata-driven generic record store**
- Departments defined in config; a generic record store holds everything as typed metadata.
- Maximally flexible, but sacrifices type safety and Prisma's strengths, and adds a metadata engine to maintain. Over-engineered for six known departments — violates "no over-building."

**Option C — Six parallel hardcoded department modules**
- Each department gets its own tables and pages, built independently.
- Fastest to ship the first one — and it is literally the v1 anti-pattern: no shared shape, and every cross-cutting change means editing six places. Rejected.

### 4.4 Where the Research Engine Runs

The engine is a **pg-boss job handled by the Worker**, written as **TypeScript modules the handler calls directly** — no separate repo, no cloned Python, no spawned child processes. It follows a clean output contract: each step is a deterministic function, the handler validates the assembled output with Zod (native, same language), and results are written to Postgres in a transaction.

```
[schedule | Run-now] --> pg-boss job --> Worker handler (TypeScript)
   -> read Company Profile + Guidance Summary (Postgres)
   -> Tavily: gather broad signal (news/podcasts/books/
                communities/gov data/social)
   -> Claude: hypothesize + test -> candidate Findings
   -> Zod-validate -> write Findings (status=candidate)
   -> owner reviews in UI: approve/reject + reason (API)
   -> distill Guidance Summary -> feeds next run
```

- **Scheduled** via pg-boss cron (e.g. weekly); **on-demand** via a Run-now API route that enqueues the same job.
- **The human gate is structural:** candidate Findings sit in the review queue and go no further until the owner acts.

> **Scaling note (not a change now).** pg-boss is right for the current shape — one linear agent pipeline, modest volume, reuses Postgres, no new infra. When the vision grows to **multiple department agents with a supervision layer**, a job queue is no longer the right tool for stateful, long-running, multi-step agent coordination — that is when a durable-execution / orchestration layer (Temporal, Inngest, or similar) earns its place. Adopting it now would over-engineer exactly what we are avoiding. **pg-boss now; that is the documented upgrade trigger for later.** Basic to complex.

### 4.5 Findings State — Data-Model Note

Ship **two-state (candidate / validated / rejected)**. It is trivially extensible: adding an "approved" state later is one enum value and one transition, not a migration of meaning. Choosing two-state now does not lock out three-state later.

---

## 5. Development & Deployment Model

This is as load-bearing as the domain model. V1's operational failure was that it was built as one undifferentiated stream, with no separation between what was being worked on and what was live. V2 fixes that deliberately.

### 5.1 Branch Model

- **`main`** always reflects production. Work never happens directly on it.
- **`develop`** is the integration branch where features come together and are validated before release.
- **`feature/*`** are short-lived branches off `develop`, one per unit of work, merged back into `develop` (not into `main`).
- Promotion path: `feature/*` → `develop` → `main`.

### 5.2 Environment Separation

- **Production** and a **staging/preview** environment are genuinely distinct — above all, **separate databases**, so development can never touch production data.
- `develop`/`main` map to staging/production respectively, giving a safe place to break things before anything reaches production. V1 had no such place.

### 5.3 Migration Discipline

- Prisma migrations are the one place a schema mistake becomes irreversible in production, so they get a defined flow: **authored and tested against staging first**, and only then applied to production.
- This matters more in V2 precisely because the schema is being rebuilt from scratch — the migration path is exercised heavily early.

---

## 6. Design Patterns — Reusable Solutions

The patterns applied throughout, each tied to the charter principle it serves. The first is the keystone from §4.3; the rest slot in around it.

1. **Generic Department + Extension (the keystone)** — *Solves:* one generic Department with shared-anatomy tables, plus per-department extension tables for specifics; new department = register + fill. *Serves:* "build one department at a time" and "never rebuild six."
2. **Agent Pipeline (discrete steps)** — *Solves:* the Research Engine as a sequence of single-responsibility TypeScript modules (Ground → Gather → Hypothesize → Test → Queue → Review → Learn), each deterministic, testable, and swappable. *Serves:* "basic → complex" and agent-readiness.
3. **Human-in-the-Loop Gate** — *Solves:* a consistent candidate → review queue → approve/reject-with-reason flow, reused across departments (Findings now; the rebuilt features later). *Serves:* "nothing goes live without explicit human action."
4. **Output Contract + Validation** — *Solves:* agent output is Zod-validated before it touches the database; malformed output never reaches Prisma. *Serves:* reliability and maintainability — the agent cannot corrupt state.
5. **Server-Fetch / Client-State Boundary** — *Solves:* server components fetch via Prisma and pass serialized props; client components own UI state; API routes handle mutations; Prisma is never called from the client. (A standard App Router pattern — correct on a greenfield build, and one of the few V1 got right.) *Serves:* maintainability — one clear data-flow boundary everywhere.
6. **Single Source of Truth** — *Solves:* PostgreSQL holds all state; any cache is derived and disposable, never authoritative. *Serves:* the charter's "PostgreSQL remains the single source of truth."
7. **Bounded Guidance Summary (compaction)** — *Solves:* the learning loop rewrites a tight summary each cycle rather than appending — keeping it bounded so it never crowds out research context. *Serves:* a learning loop that improves without growing unbounded.

---

## 7. Build Order — Basic to Complex

Each increment is usable before the next begins. This is the sequence Claude Code follows.

| # | Increment | Usable when… |
|---|---|---|
| 1 | Generic Department + shared anatomy; seed all six departments | The six seats are navigable with Goals/Tasks/Knowledge/KPIs. |
| 2 | Product/Research artifacts: Company Profile + Findings | Profile is editable; Findings can be recorded and reviewed by hand. |
| 3 | Research Engine job (Ground → Gather → Hypothesize → Test → Queue), scheduled + Run-now, against the *easy* sources first | The engine produces candidate Findings on schedule and on demand. |
| 4 | Review UI: approve/reject with written reason (human gate) | The owner can validate or reject each candidate. |
| 5 | Learning loop: distill + re-feed the Guidance Summary | Successive runs sharpen from accumulated feedback. |

**Deferred design tasks carried forward (not blocking the above):**
- **Source strategy** (§2.3) — per-medium extraction (podcast transcripts, the copyrighted-books question), the curated source seed list, and source tiering. A dedicated pass, owned by the Research Engine build, done once the loop runs against easy sources.
- **Navigation/interface model** — sidebar or a better approach — a presentation-layer choice that does not change the domain model, so it can be decided at presentation time without reworking §4.

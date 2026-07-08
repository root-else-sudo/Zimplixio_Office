# PROJECT CHARTER

## Zimplixio Office — CRM Department Redesign

---

### Document Control

| Field | Value |
|---|---|
| **Project Name** | CRM Department Redesign |
| **Document Type** | Project Charter |
| **Version** | 1.0 |
| **Date Issued** | 2026-07-02 |
| **Project Sponsor** | Joe Ugalde |
| **Project Owner** | Joe Ugalde |
| **Status** | Scope approved; architecture decided (Option A — see planning doc §4.3); Increments 1-2 complete. **This charter's scope/decision sections are a frozen historical record — for current live status, see `CLAUDE.md`.** |

---

## 1. Purpose

Reframe the Zimplixio Office CRM from a *feature-organized* application into a
**company organized by departments**, where each department is a real, structured
unit of the business. The long-term vision is an **autonomous, agent-run company**
that the owner supervises — a system capable of doing heavy lifting and making
decisions, with a human in the loop for review and approval.

This charter authorizes and bounds the **first phase** of that vision: establishing
the department structure and delivering the first department (Product/Research)
complete with a working, human-supervised research agent.

---

## 2. Business Case / Justification

The CRM was built for a *feature-organized* application, but Zimplixio's operating
model is evolving toward a department-based, increasingly automated company. Three
problems justify this project:

1. **No organizational home for work.** Features (Posts, Projects, Opportunities)
   exist in isolation with no clear "which part of the business owns this" mapping.
2. **No foundation for agents.** The end-state — agents running departments —
   requires a predictable structure for agents to plug into. None exists today.
3. **Content/output built on assumptions, not research.** Prior output (e.g. post
   generation) was built on *assumed* SMB pain points. The correct sequence is
   research → strategy → output. Product/Research must exist first.

Delivering the department structure plus a research agent addresses all three and
establishes the pattern every future department and agent will follow.

---

## 3. Project Objectives

1. Define a **six-department organizational structure** for the CRM, with each
   department reserved as a navigable, record-backed unit.
2. Establish a **shared department anatomy** (Goals + Tasks) designed to extend to
   Knowledge + Metrics.
3. Deliver **Product/Research** as the first fully-built department and the
   reference implementation for all others.
4. Deliver a **human-in-the-loop Research Agent** that actively surfaces candidate
   niche/pain-point Findings, grounded in Zimplixio's capabilities, and improves
   from owner feedback each run.
5. Do all of the above **incrementally** (basic → complex), keeping each increment
   usable and agent-ready.

---

## 4. Guiding Principles

- **Define the whole org chart now; build one department at a time.** Naming a
  department reserves its seat; it does not obligate immediate build-out.
- **Basic → complex.** No over-building early. Each increment proves the pattern
  before the next is added.
- **Human-in-the-loop by default.** Agents do the heavy lifting; the owner reviews,
  validates, and approves. Nothing goes live without explicit human action.
- **Structure is agent-ready.** Even where v1 has no agent, the structure is
  designed so an agent can plug in later.

---

## 5. Scope

### 5.1 The Org Chart (Department Roster)

The CRM defines **six departments**. All six exist as structure (navigation +
records) up front; they are built out one at a time.

| Department | Purpose | Notes |
|---|---|---|
| **Product / Research** | Find viable niches / pain points Zimplixio can serve. | **First department built.** Feeds Marketing & Sales. |
| **Engineering** | Build the products / solutions. | Home for existing Projects / Tasks (Gantt). |
| **Marketing** | Create demand — content, brand, prospect engagement. | Home for existing Posts. Linked to Sales via lead handoff. |
| **Sales** | Convert demand into income — outreach, closing. | Home for existing Opportunities. Linked to Marketing via lead handoff. |
| **Finance** | Manage expenses, costs, and runway. | Mostly net-new. |
| **Operations** | Oversee the entire system — strategy, coordination, cross-department supervision. | **Owner's supervisor seat.** People/HR + Legal fold in here for now. |

**Structural decisions:**
- Marketing and Sales are **separate but linked** by a lead-handoff relationship
  (different jobs, different data, different future agents).
- People/HR and Legal are **not standalone departments yet**; they live under
  Operations until they earn their own seat.

### 5.2 Department Anatomy (shared shape)

- **v1:** **Goals** (objectives the department pursues) **+ Tasks** (concrete work
  items laddering up to goals).
- **Planned evolution (soon):** **+ Knowledge** (per-department context/sources)
  **+ Metrics** (KPIs). Schema and layout designed so these slot in cleanly.

### 5.3 First Slice — Product / Research (in scope, built in full)

- **Chassis:** Goals + Tasks + **Findings** (first-class record: title,
  description, evidence/sources, status lifecycle `candidate → validated/approved
  → rejected`).
- **Company Profile:** canonical, editable source of truth describing what
  Zimplixio does and its **capabilities**; grounds the agent's niche-fit reasoning.
- **Research Agent:**
  - **Method:** Tavily (search + `extract`) over tiered sources (NFIB, Alignable,
    SCORE, Reddit r/smallbusiness, etc.) + Claude to synthesize structured Findings.
  - **Cadence:** scheduled (e.g. weekly) via pg-boss **and** on-demand "Run now".
  - **Output:** candidate Findings in a review queue.
  - **Review:** owner approves / validates / rejects each, with a written reason.
  - **Learning loop (v1):** feedback distilled into a **plain-English guidance
    summary** fed to the agent before each run.

### 5.4 Out of Scope (this phase)

- The full autonomous multi-agent organization (multiple coordinating agents).
- Build-out of Engineering, Marketing, Sales, Finance, Operations beyond their
  reserved structural seats.
- Knowledge and Metrics layers on departments (planned "soon," not first slice).
- A paid third-party signals-collection service (start with Tavily; reassess later).
- Structured/editable scoring rubric, vector-memory, or fine-tuning learning loops
  (v1 uses the prose-summary loop).
- Model training of any kind.

---

## 6. Deliverables

| # | Deliverable | Description |
|---|---|---|
| D1 | Department structure | Six departments defined as navigable, record-backed units. |
| D2 | Shared department anatomy | Goals + Tasks, extensible to Knowledge + Metrics. |
| D3 | Product/Research department | First fully-built department; reference implementation. |
| D4 | Findings artifact | First-class record with review lifecycle. |
| D5 | Company Profile | Editable capabilities-based source of truth. |
| D6 | Research Agent | Scheduled + on-demand agent producing candidate Findings. |
| D7 | Feedback learning loop | Prose-summary loop feeding owner feedback into each run. |

---

## 7. Milestones (high level)

| Milestone | Description | Status |
|---|---|---|
| M0 | Scope approved (this charter) | ✅ Complete |
| M1 | Architecture & design pattern approved | ✅ Complete — Option A (generic Department + shared anatomy), planning doc §4.3 |
| M2 | Department structure + shared anatomy live | ✅ Complete (Increment 1, 2026-07-06) |
| M3 | Product/Research chassis (Goals + Tasks + Findings + Company Profile) | ✅ Complete (Increment 1 + 2, 2026-07-08) |
| M4 | Research Agent (scheduled + Run-now) producing Findings | ⏳ Pending |
| M5 | Feedback learning loop operational | ⏳ Pending |

> See `CLAUDE.md`'s build-order table for the live/current status going forward — this table reflects state as of 2026-07-08 and won't be updated again per-increment.

---

## 8. Stakeholders & Roles

| Stakeholder | Role | Responsibility |
|---|---|---|
| Joe Ugalde | Sponsor / Owner / Reviewer | Sets direction, reviews & approves scope/design, validates Findings, supervises the agent. |
| Claude Code | Implementation partner | Architecture, design, and implementation under owner review. |
| The Research Agent | Automated worker (delivered by this project) | Produces candidate Findings for human review; does not act autonomously without approval. |

---

## 9. Assumptions

- Tavily and Anthropic (Claude) APIs remain available and sufficient for research
  and synthesis in v1.
- pg-boss and the existing Worker service can host the scheduled agent job.
- PostgreSQL remains the single source of truth (no parallel state stores).
- The owner is available to review Findings regularly enough for the learning loop
  to improve results.

---

## 10. Constraints

- **Incremental delivery** — no over-building; each increment must be usable.
- **Existing stack** — build within Next.js App Router + TypeScript + Prisma +
  pg-boss + NextAuth; no new load-bearing frameworks introduced casually.
- **Human-in-the-loop** — the agent may not publish or act on Findings without
  explicit approval.
- **Single owner** — one person is sponsor, reviewer, and supervisor; workflows
  must not assume a larger team.

---

## 11. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Scope creep from the autonomous-agent vision | Over-building before foundation is proven | Charter fixes v1 to one scoped agent; roster defined but not built out. |
| Research quality depends on source coverage | Low-value Findings | Tiered, authoritative sources; feedback loop tightens relevance over time. |
| Agent surfaces noise / irrelevant niches | Wasted review time | Company Profile grounding + prose-summary feedback loop; human approval gate. |
| Learning loop too simplistic to improve results | Agent stays generic | Prose summary is v1; structured rubric is a defined upgrade path if needed. |
| Tavily gaps vs. a dedicated signals service | Missed signals | Learn Tavily's limits from real use before committing to paid tooling. |

---

## 12. Success Criteria

- All six departments exist as navigable units with a consistent anatomy.
- Product/Research is fully usable: Goals, Tasks, Findings, and Company Profile.
- The Research Agent runs on schedule and on demand, producing candidate Findings
  grounded in Zimplixio's capabilities.
- The owner can approve/validate/reject Findings with written feedback.
- Findings become measurably more relevant across successive runs as feedback
  accumulates.
- The Product/Research build serves cleanly as the template for the next department.

---

## 13. Decision Log

| # | Decision | Rationale |
|---|---|---|
| 1 | Structure first, agents later — but the first department ships with one scoped agent. | End-state is autonomous; foundation first, but Product/Research needs active work to be valuable. |
| 2 | Six departments; roster fixed up front, built one at a time. | Defining the org chart is cheap; building it out is disciplined. |
| 3 | Marketing and Sales separate, linked by a lead handoff. | Different jobs, data, and future agents. |
| 4 | People/HR + Legal fold into Operations for now. | Real functions but empty today; avoid empty departments. |
| 5 | Anatomy = Goals + Tasks in v1, evolving to + Knowledge + Metrics. | Minimal usable core, designed for clean extension. |
| 6 | Product/Research is the first slice and reference implementation. | "No company without a product/service to offer"; feeds Marketing & Sales. |
| 7 | Findings are first-class with a candidate→validated→rejected lifecycle. | The department's output must be tangible and reviewable. |
| 8 | Company Profile is the agent's source of truth, capturing capabilities. | Agent must ground niche-fit reasoning in Zimplixio's real capabilities. |
| 9 | Agent cadence = scheduled (pg-boss) + Run-now. | Active work happening even when the owner is away, plus on-demand control. |
| 10 | Research uses Tavily + Claude; no paid signals service yet. | Already in stack and budgeted; avoid premature optimization. |
| 11 | Learning loop = in-context prose summary (v1). | Simplest mechanism delivering "gets more accurate every run"; transparent; no training. |

---

## 14. Approval / Sign-off

| Role | Name | Approval | Date |
|---|---|---|---|
| Project Sponsor | Joe Ugalde | ☑ Approved (in practice, via the v2 planning docs + directed implementation work) | 2026-07-06 |

---

## 15. Next Phase

Architecture & design pattern for this scope — how departments and the agent are
structured in the codebase, where the agent job lives, and how the pattern
generalizes to the other five departments. *(Three approaches drafted; selection
pending.)*

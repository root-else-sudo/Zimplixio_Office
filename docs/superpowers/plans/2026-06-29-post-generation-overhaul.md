# Post Generation Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the LinkedIn post generation pipeline so every run produces fresh, operationally-specific content targeting owners and ops directors at talent-repellent businesses (trucking, field service, distribution, construction, etc.) whose pain points map directly to Zimplixio's three core services.

**Architecture:** Extract the rotation and pattern-selection logic from `posts_generate.py` into pure helper functions so they are testable and deterministic. Add cross-run state (Tavily query index, outcome pattern index, recent hooks) to `market_context.json` so the pipeline never repeats itself across runs. Replace all content-shaping constants (queries, system prompt, outcome patterns) with operationally-specific versions. Add `days=14` recency filter to Tavily calls so research results change daily.

**Tech Stack:** Python 3.14, pytest, Tavily Python SDK, Anthropic Python SDK, R2/local JSON storage via `r2_storage` utility

---

## File Map

| Action | Path |
|---|---|
| Modify | `Zimplixio_Marketing/execution/posts_generate.py` |
| Modify | `Zimplixio_Marketing/execution/context_search.py` |
| Create | `Zimplixio_Marketing/tests/__init__.py` |
| Create | `Zimplixio_Marketing/tests/test_posts_generate.py` |

---

## Task 1: Create test file with failing tests for the three pure helpers

These tests verify the three functions we will extract in Task 2. Write them first — they will all fail because the functions do not exist yet.

**Files:**
- Create: `Zimplixio_Marketing/tests/__init__.py`
- Create: `Zimplixio_Marketing/tests/test_posts_generate.py`

- [ ] **Step 1: Create the tests package init**

```bash
touch /Users/josephugaldeberrocal/Documents/Zimplixio_Marketing/tests/__init__.py
```

- [ ] **Step 2: Write the test file**

Create `Zimplixio_Marketing/tests/test_posts_generate.py`:

```python
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'execution'))

from posts_generate import (
    pick_research_query_indices,
    pick_outcome_pattern_by_index,
    extract_hook,
    build_system_prompt,
    OUTCOME_PATTERNS,
    TAVILY_RESEARCH_QUERIES,
)


class TestPickResearchQueryIndices:
    def test_starts_at_zero_when_run_count_zero(self):
        result = pick_research_query_indices(0, 10)
        assert result == [0, 1]

    def test_advances_by_run_count(self):
        result = pick_research_query_indices(4, 10)
        assert result == [4, 5]

    def test_wraps_around_at_end_of_list(self):
        result = pick_research_query_indices(9, 10)
        assert result == [9, 0]

    def test_wraps_both_when_near_end(self):
        result = pick_research_query_indices(8, 10)
        assert result == [8, 9]

    def test_works_with_real_query_list_length(self):
        n = len(TAVILY_RESEARCH_QUERIES)
        result = pick_research_query_indices(n - 1, n)
        assert result[0] == n - 1
        assert result[1] == 0


class TestPickOutcomePatternByIndex:
    def test_picks_first_pattern_when_index_zero(self):
        context = {}
        pattern = pick_outcome_pattern_by_index(context)
        assert pattern == OUTCOME_PATTERNS[0]

    def test_increments_index_in_context(self):
        context = {}
        pick_outcome_pattern_by_index(context)
        assert context['outcome_pattern_index'] == 1

    def test_picks_second_pattern_when_index_one(self):
        context = {'outcome_pattern_index': 1}
        pattern = pick_outcome_pattern_by_index(context)
        assert pattern == OUTCOME_PATTERNS[1]

    def test_wraps_around_after_last_pattern(self):
        n = len(OUTCOME_PATTERNS)
        context = {'outcome_pattern_index': n}
        pattern = pick_outcome_pattern_by_index(context)
        assert pattern == OUTCOME_PATTERNS[0]
        assert context['outcome_pattern_index'] == n + 1

    def test_each_call_advances_index(self):
        context = {}
        for i in range(len(OUTCOME_PATTERNS)):
            pattern = pick_outcome_pattern_by_index(context)
            assert pattern == OUTCOME_PATTERNS[i]


class TestExtractHook:
    def test_returns_first_non_empty_line(self):
        post = "\n\nYour dispatch runs on a spreadsheet.\n\nHere is more content."
        assert extract_hook(post) == "Your dispatch runs on a spreadsheet."

    def test_strips_whitespace(self):
        post = "   First line with spaces.   \nSecond line."
        assert extract_hook(post) == "First line with spaces."

    def test_truncates_at_150_chars(self):
        long_line = "A" * 200
        post = f"{long_line}\nSecond line."
        result = extract_hook(post)
        assert len(result) == 150

    def test_returns_empty_string_for_blank_post(self):
        assert extract_hook("") == ""
        assert extract_hook("   \n\n   ") == ""


class TestBuildSystemPrompt:
    def test_returns_base_when_no_recent_hooks(self):
        result = build_system_prompt([])
        assert 'AVOID REPEATING' not in result

    def test_injects_avoid_section_when_hooks_present(self):
        hooks = ["Your dispatch runs on a spreadsheet.", "Nobody knows the numbers until month end."]
        result = build_system_prompt(hooks)
        assert 'AVOID REPEATING' in result
        assert hooks[0] in result
        assert hooks[1] in result

    def test_uses_only_last_five_hooks(self):
        hooks = [f"Hook number {i}" for i in range(10)]
        result = build_system_prompt(hooks)
        assert "Hook number 9" in result
        assert "Hook number 4" not in result

    def test_base_content_always_present(self):
        result = build_system_prompt(["some hook"])
        assert "Zimplixio" in result
        assert "HOOK" in result
```

- [ ] **Step 3: Run tests and confirm they all fail**

```bash
cd /Users/josephugaldeberrocal/Documents/Zimplixio_Marketing && python -m pytest tests/test_posts_generate.py -v 2>&1 | head -50
```

Expected: `ImportError` or `ModuleNotFoundError` — the functions do not exist yet.

- [ ] **Step 4: Commit the failing tests**

```bash
cd /Users/josephugaldeberrocal/Documents/Zimplixio_Marketing
git add tests/__init__.py tests/test_posts_generate.py
git commit -m "test: add failing tests for post generation helper functions"
```

---

## Task 2: Extract pure helper functions and make the tests pass

Extract three new pure functions from the logic currently embedded in `posts_generate.py`, then make the tests pass.

**Files:**
- Modify: `Zimplixio_Marketing/execution/posts_generate.py`

- [ ] **Step 1: Add the three helper functions after the `slugify` function (line 253)**

Open `execution/posts_generate.py` and add these four functions immediately after the `slugify` function (after line 253, before `def main()`):

```python
def pick_research_query_indices(tavily_run_count: int, num_queries: int) -> list[int]:
    return [(tavily_run_count + i) % num_queries for i in range(2)]


def pick_outcome_pattern_by_index(context: dict) -> dict:
    idx = context.get('outcome_pattern_index', 0)
    pattern = OUTCOME_PATTERNS[idx % len(OUTCOME_PATTERNS)]
    context['outcome_pattern_index'] = idx + 1
    return pattern


def extract_hook(post_text: str) -> str:
    for line in post_text.split('\n'):
        line = line.strip()
        if line:
            return line[:150]
    return ''


def build_system_prompt(recent_hooks: list[str]) -> str:
    if not recent_hooks:
        return SYSTEM_PROMPT_BASE
    hooks_list = '\n'.join(f'- {h}' for h in recent_hooks[-5:])
    return (
        SYSTEM_PROMPT_BASE
        + f'\n\n--- AVOID REPEATING ---\n'
        + f'Do not reuse these opening hooks or angles from recent posts:\n{hooks_list}'
    )
```

- [ ] **Step 2: Rename the module-level `SYSTEM_PROMPT` constant to `SYSTEM_PROMPT_BASE`**

In `execution/posts_generate.py`, change:
```python
SYSTEM_PROMPT = """You write LinkedIn posts for Zimplixio...
```
to:
```python
SYSTEM_PROMPT_BASE = """You write LinkedIn posts for Zimplixio...
```

The content stays the same for now — we rewrite it in Task 6.

- [ ] **Step 3: Update the `generate()` function to accept the system prompt as a parameter**

Replace:
```python
def generate(client: anthropic.Anthropic, prompt: str) -> str:
    message = client.messages.create(
        model='claude-sonnet-4-6',
        max_tokens=600,
        system=SYSTEM_PROMPT,
        messages=[{'role': 'user', 'content': prompt}]
    )
    return message.content[0].text.strip()
```

With:
```python
def generate(client: anthropic.Anthropic, prompt: str, system: str) -> str:
    message = client.messages.create(
        model='claude-sonnet-4-6',
        max_tokens=600,
        system=system,
        messages=[{'role': 'user', 'content': prompt}]
    )
    return message.content[0].text.strip()
```

- [ ] **Step 4: Run the tests and confirm they now pass**

```bash
cd /Users/josephugaldeberrocal/Documents/Zimplixio_Marketing && python -m pytest tests/test_posts_generate.py -v 2>&1 | head -60
```

Expected: all tests pass. If any fail, read the error message and fix the corresponding function.

- [ ] **Step 5: Commit**

```bash
cd /Users/josephugaldeberrocal/Documents/Zimplixio_Marketing
git add execution/posts_generate.py
git commit -m "refactor: extract pure helper functions for query rotation, pattern selection, hook extraction"
```

---

## Task 3: Wire context read/write into main() — fix rotation bug and pattern selector

Replace the broken `len(drafts)` rotation and keyword-scoring pattern selector with the new pure helpers. Add context save at the end of `main()` so the counters persist across runs.

**Files:**
- Modify: `Zimplixio_Marketing/execution/posts_generate.py`

- [ ] **Step 1: Add `load_context()` and `save_context()` functions after `load_market_context()`**

After the existing `load_market_context()` function (line ~131), add:

```python
def load_context() -> dict:
    return r2_storage.get_json(
        'market_context.json',
        local_fallback=CONTEXT_FILE,
        default={
            'last_updated': '',
            'sources': [],
            'insights': [],
            'search_run_count': 0,
            'tavily_run_count': 0,
            'outcome_pattern_index': 0,
            'recent_hooks': [],
        },
    )


def save_context(data: dict):
    r2_storage.put_json('market_context.json', data, local_fallback=CONTEXT_FILE)
```

- [ ] **Step 2: Replace the top of `main()` to load full context**

Replace:
```python
    market_insights = load_market_context()
    print(f"  Loaded {len(market_insights)} market insights")
```

With:
```python
    context = load_context()
    market_insights = context.get('insights', [])
    recent_hooks: list[str] = context.get('recent_hooks', [])
    system_prompt = build_system_prompt(recent_hooks)
    print(f"  Loaded {len(market_insights)} market insights, {len(recent_hooks)} recent hooks")
```

- [ ] **Step 3: Fix the Tavily rotation bug in `main()` (Source 2 block)**

Replace:
```python
    # ── Source 2: Tavily market research posts (2) ────────────────────────────
    if tavily:
        run_count = len(drafts)
        for i in range(2):
            query_idx = (run_count + i) % len(TAVILY_RESEARCH_QUERIES)
            query = TAVILY_RESEARCH_QUERIES[query_idx]
            print(f"  [research] {query[:60]}")
            try:
                response = tavily.search(query=query, search_depth='advanced', max_results=4)
```

With:
```python
    # ── Source 2: Tavily market research posts (2) ────────────────────────────
    if tavily:
        tavily_run_count = context.get('tavily_run_count', 0)
        query_indices = pick_research_query_indices(tavily_run_count, len(TAVILY_RESEARCH_QUERIES))
        context['tavily_run_count'] = tavily_run_count + 2
        for query_idx in query_indices:
            query = TAVILY_RESEARCH_QUERIES[query_idx]
            print(f"  [research] {query[:60]}")
            try:
                response = tavily.search(query=query, search_depth='advanced', max_results=4, days=14)
```

- [ ] **Step 4: Fix the owned-post pattern selector in `main()` (Source 3 block)**

Replace:
```python
    # ── Source 3: Zimplixio-owned outcome post (1) ────────────────────────────
    recent_signals = [d.get('source_subject', '') for d in drafts]
    pattern = pick_outcome_pattern(recent_signals)
```

With:
```python
    # ── Source 3: Zimplixio-owned outcome post (1) ────────────────────────────
    pattern = pick_outcome_pattern_by_index(context)
```

- [ ] **Step 5: Update all `generate()` calls to pass `system_prompt`**

There are three `generate()` calls in main(). Update each one:

Email source (line ~290):
```python
            post_text = generate(client, build_prompt_email(email, insight), system_prompt)
```

Research source (line ~315):
```python
                post_text = generate(client, build_prompt_research(query, results, insight), system_prompt)
```

Owned source (line ~337):
```python
        post_text = generate(client, build_prompt_owned(pattern, insight), system_prompt)
```

- [ ] **Step 6: Save context at the end of `main()`, before the print statement**

Replace:
```python
    os.makedirs('tmp', exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(drafts, f, indent=2, ensure_ascii=False)

    print(f"\nDone. {len(drafts)} posts generated ({len(errors)} errors). Output: {OUTPUT_FILE}")
```

With:
```python
    os.makedirs('tmp', exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(drafts, f, indent=2, ensure_ascii=False)

    save_context(context)
    print(f"\nDone. {len(drafts)} posts generated ({len(errors)} errors). Output: {OUTPUT_FILE}")
```

- [ ] **Step 7: Remove the now-unused `pick_outcome_pattern()` function**

Delete the old `pick_outcome_pattern(recent_signals: list) -> dict:` function (lines 170–178).

- [ ] **Step 8: Run tests to confirm nothing broke**

```bash
cd /Users/josephugaldeberrocal/Documents/Zimplixio_Marketing && python -m pytest tests/test_posts_generate.py -v
```

Expected: all tests still pass.

- [ ] **Step 9: Commit**

```bash
cd /Users/josephugaldeberrocal/Documents/Zimplixio_Marketing
git add execution/posts_generate.py
git commit -m "fix: wire persistent context into main() — fixes rotation bug and pattern selector"
```

---

## Task 4: Add hook extraction and cross-run angle memory

After each post is generated in `main()`, extract its opening hook and append it to `context['recent_hooks']`. This list is saved to `market_context.json` and injected into the system prompt on the next run.

**Files:**
- Modify: `Zimplixio_Marketing/execution/posts_generate.py`

- [ ] **Step 1: Add hook capture after every successful `generate()` call**

In all three source blocks (email, research, owned), after the line that sets `post_text`, add:

```python
            recent_hooks.append(extract_hook(post_text))
```

The three locations are:

**Email block** — after `post_text = generate(...)`:
```python
            post_text = generate(client, build_prompt_email(email, insight), system_prompt)
            recent_hooks.append(extract_hook(post_text))
            drafts.append({
```

**Research block** — after `post_text = generate(...)`:
```python
                post_text = generate(client, build_prompt_research(query, results, insight), system_prompt)
                recent_hooks.append(extract_hook(post_text))
                drafts.append({
```

**Owned block** — after `post_text = generate(...)`:
```python
        post_text = generate(client, build_prompt_owned(pattern, insight), system_prompt)
        recent_hooks.append(extract_hook(post_text))
        drafts.append({
```

- [ ] **Step 2: Trim `recent_hooks` to the last 10 before saving**

Just before `save_context(context)`, add:

```python
    context['recent_hooks'] = recent_hooks[-10:]
```

So the full block before the save becomes:
```python
    os.makedirs('tmp', exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(drafts, f, indent=2, ensure_ascii=False)

    context['recent_hooks'] = recent_hooks[-10:]
    save_context(context)
    print(f"\nDone. {len(drafts)} posts generated ({len(errors)} errors). Output: {OUTPUT_FILE}")
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/josephugaldeberrocal/Documents/Zimplixio_Marketing && python -m pytest tests/test_posts_generate.py -v
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/josephugaldeberrocal/Documents/Zimplixio_Marketing
git add execution/posts_generate.py
git commit -m "feat: add cross-run hook memory to prevent angle repetition"
```

---

## Task 5: Replace TAVILY_RESEARCH_QUERIES with operational pain queries

Replace the generic "SMB AI statistics" queries with operationally-specific, industry-pain queries. These are concrete enough that Tavily's daily-fresh results will differ run to run.

**Files:**
- Modify: `Zimplixio_Marketing/execution/posts_generate.py`

- [ ] **Step 1: Replace the `TAVILY_RESEARCH_QUERIES` list (lines 28–37)**

Replace:
```python
# Rotating Tavily queries for market research posts
TAVILY_RESEARCH_QUERIES = [
    'small business AI automation productivity gains 2025',
    'SMB data management workflow efficiency statistics',
    'small business technology adoption challenges USA 2025',
    'SMB ERP integration benefits operational visibility',
    'agentic AI small business use cases ROI',
    'small business manual process automation cost savings',
    'SMB cloud migration benefits growing business',
    'small business digital transformation success stories 2025',
]
```

With:
```python
# Rotating Tavily queries — operational pain by industry, recency enforced via days=14
TAVILY_RESEARCH_QUERIES = [
    'trucking fleet dispatch scheduling software problems small business',
    'HVAC field service company scheduling errors lost jobs revenue',
    'food distribution inventory tracking manual process failures operations',
    'construction subcontractor data management scheduling spreadsheet problems',
    'small business payroll errors manual time tracking cost productivity',
    'pest control field service mobile app adoption challenges',
    'waste management route optimization technology gap small fleet',
    'service company quoting estimating manual pricing errors lost revenue',
    'small business developer abandoned incomplete custom software project',
    'operations director manual reporting disconnected systems data silos',
    'delivery company driver dispatch scheduling technology problems',
    'field service company paper work orders digital transformation barriers',
]
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/josephugaldeberrocal/Documents/Zimplixio_Marketing && python -m pytest tests/test_posts_generate.py -v
```

Expected: `test_works_with_real_query_list_length` still passes (it uses `len(TAVILY_RESEARCH_QUERIES)` dynamically).

- [ ] **Step 3: Commit**

```bash
cd /Users/josephugaldeberrocal/Documents/Zimplixio_Marketing
git add execution/posts_generate.py
git commit -m "feat: replace Tavily queries with operational pain queries targeting service/field industries"
```

---

## Task 6: Rewrite SYSTEM_PROMPT_BASE

Replace the current system prompt (ERP-biased, generic SMB, emojis allowed) with one that produces story-first, pain-led, plain-language posts targeting operationally-complex businesses.

**Files:**
- Modify: `Zimplixio_Marketing/execution/posts_generate.py`

- [ ] **Step 1: Replace `SYSTEM_PROMPT_BASE` (lines 72–127)**

Replace the entire `SYSTEM_PROMPT_BASE = """..."""` block with:

```python
SYSTEM_PROMPT_BASE = """You write LinkedIn posts for Zimplixio, a technology contractor that helps operationally complex small businesses fix the systems that are slowing them down.

The businesses Zimplixio serves run real operations: delivery fleets, field service crews, distribution centers, construction sites, service routes. They cannot attract software engineers. They make decisions on spreadsheets, phone calls, and gut feeling. They know something is broken but do not know it can be fixed.

Zimplixio's three core services:
- AI and agentic automation — replacing manual, repetitive workflows with software that runs on its own
- Data engineering and automation — connecting systems and building dashboards so owners can see what is actually happening in real time
- Custom software and integrations — building apps and connecting tools when off-the-shelf software does not fit the operation

Every post follows this structure:

1. HOOK (1–2 lines): Open with a specific operational pain that a business owner or ops manager would recognize as their exact situation. Lead with the pain, not the industry. No statistics in the hook. No buzzwords. Make them stop scrolling.

2. BODY (3–4 short paragraphs): One idea per paragraph. One to two sentences each. Be concrete — reference real operational details: routes, crews, timesheets, work orders, invoices, quotes, job tickets. Describe what changed without naming Zimplixio or sounding like an ad.

3. OUTCOME (1–2 sentences): What the business can now do that it could not do before. A real capability or relief, not a revenue number.

4. CLOSE (1 line): A question or direct statement that makes the reader feel seen and understood.

Voice rules:
- Short sentences. No sentence longer than 20 words.
- Plain language. Write like you talk to a peer who runs a business.
- Never use: leverage, synergy, scalability, digital transformation, robust, seamless, holistic, revolutionize, game-changer, unlock, harness, elevate, empower, cutting-edge, enterprise-grade, ecosystem, paradigm
- Do not name Zimplixio in the post body
- Do not open with "I" or with a statistic
- No emojis
- No hashtags
- No URLs in the post body
- 150 to 200 words total

The reader is the owner or the operations director of a 20–200 person business in an industry that does not attract software engineers. They feel stuck. They know something is broken. They do not know it can be fixed."""
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/josephugaldeberrocal/Documents/Zimplixio_Marketing && python -m pytest tests/test_posts_generate.py -v
```

Expected: `test_base_content_always_present` checks for `"Zimplixio"` and `"HOOK"` — both are in the new prompt, so this passes.

- [ ] **Step 3: Commit**

```bash
cd /Users/josephugaldeberrocal/Documents/Zimplixio_Marketing
git add execution/posts_generate.py
git commit -m "feat: rewrite system prompt — story-first, pain-led, no jargon, ops-industry target"
```

---

## Task 7: Replace OUTCOME_PATTERNS with ops-heavy scenarios

Replace the six ERP-biased patterns with six patterns covering the actual operational scenarios that resonate with the target industries.

**Files:**
- Modify: `Zimplixio_Marketing/execution/posts_generate.py`

- [ ] **Step 1: Replace the `OUTCOME_PATTERNS` list (lines 39–70)**

Replace:
```python
OUTCOME_PATTERNS = [
    {
        'type': 'Spreadsheet → system',
        ...
    },
    ...
]
```

With:
```python
OUTCOME_PATTERNS = [
    {
        'type': 'Dispatch on spreadsheets',
        'angle': 'A delivery or field service business managing schedules on a shared spreadsheet. Someone always overwrites someone else. Jobs go out with errors. Crews show up to the wrong location. They replaced the spreadsheet with a simple dispatch tool. Same team, same routes — no more morning chaos.',
        'trigger_keywords': ['dispatch', 'route', 'schedule', 'driver', 'delivery', 'field', 'crew'],
    },
    {
        'type': 'Paper-based field operations',
        'angle': 'Technicians filling out paper forms in the field. Back at the office, someone types the same data into a system. Errors, delays, lost forms. They went digital — mobile forms, instant sync, no re-entry. The data is in the system before the tech drives back.',
        'trigger_keywords': ['field', 'technician', 'paper', 'form', 'mobile', 'service', 'inspection'],
    },
    {
        'type': 'No reporting visibility',
        'angle': 'A business running 50 people with no dashboard. The owner checks in by calling managers. Nobody knows the real numbers until the books close at month end. They built a simple data pipeline connecting three systems into one view. Now the owner sees yesterday\'s numbers this morning.',
        'trigger_keywords': ['reporting', 'data', 'visibility', 'dashboard', 'numbers', 'analytics'],
    },
    {
        'type': 'Manual payroll and time tracking',
        'angle': 'Employees calling in their hours. A manager writing it down, transferring it to a spreadsheet, sending it to payroll. Every week, the same process. One wrong entry and the check is wrong. They automated the handoff. Timesheets go straight to payroll without anyone touching them in between.',
        'trigger_keywords': ['payroll', 'hours', 'timesheet', 'overtime', 'manual', 'wage', 'labor'],
    },
    {
        'type': 'Disconnected quoting and billing',
        'angle': 'A service business building quotes in Word. Copying from old quotes, changing numbers by hand. When pricing changes, old quotes sit in inboxes uncorrected. They built a quoting tool connected to their actual price list. Quotes go out in minutes and the numbers are always right.',
        'trigger_keywords': ['quote', 'estimate', 'pricing', 'proposal', 'invoice', 'billing', 'contract'],
    },
    {
        'type': 'Failed software project rescue',
        'angle': 'They hired a developer. Paid a deposit. Got a half-built app and then silence. Now they have software nobody can finish and a business problem still unsolved. A new team came in to pick up where the other left off — not to rebuild from scratch, but to finish the job.',
        'trigger_keywords': ['contractor', 'developer', 'incomplete', 'abandoned', 'project', 'rescue', 'debt'],
    },
]
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/josephugaldeberrocal/Documents/Zimplixio_Marketing && python -m pytest tests/test_posts_generate.py -v
```

Expected: all tests pass. The pattern tests use `OUTCOME_PATTERNS` dynamically so they work regardless of pattern content.

- [ ] **Step 3: Commit**

```bash
cd /Users/josephugaldeberrocal/Documents/Zimplixio_Marketing
git add execution/posts_generate.py
git commit -m "feat: replace outcome patterns with ops-industry scenarios (dispatch, field ops, payroll, quoting, rescue)"
```

---

## Task 8: Update context_search.py — operational queries + recency filter

Update the background research queries to match the new target industries. Add `days=30` so insights are always from the last month rather than evergreen reports from years ago.

**Files:**
- Modify: `Zimplixio_Marketing/execution/context_search.py`

- [ ] **Step 1: Replace `SEARCH_QUERIES` (lines 22–44)**

Replace:
```python
# Rotating search queries — picked round-robin each run
SEARCH_QUERIES = [
    'SMB small business AI automation adoption statistics 2025',
    'small business technology investment trends USA 2025',
    'SMB data management challenges statistics report',
    'small business workflow automation ROI results',
    'SMB AI readiness gap enterprise vs small business 2025',
    'small business manual processes cost productivity loss',
    'SMB cloud migration benefits statistics',
    'small business digital transformation challenges 2025',
    'AI agents agentic automation small business use cases',
    'SMB data quality revenue impact statistics',
    'small business technology overwhelm adoption barriers',
    'SMB custom software ERP integration benefits ROI',
    'Federal Reserve small business credit survey operational challenges 2025',
    'SBA small business AI technology adoption trends 2025',
    'HubSpot small business sales marketing technology report 2025',
    'small business cash flow operational pressure technology report',
    'SMB spreadsheet manual data errors cost productivity',
    'small business SaaS adoption growth statistics USA',
    'agentic AI workflow automation small business productivity gains',
    'SMB tech debt incomplete software projects contractor failure',
]
```

With:
```python
# Rotating search queries — picked round-robin each run
SEARCH_QUERIES = [
    # Industry-specific operational pain
    'trucking logistics small fleet operations technology challenges',
    'HVAC field service company operational management problems statistics',
    'waste management route optimization technology adoption gap',
    'construction company field data management challenges subcontractor',
    'food distribution small business inventory software operational problems',
    'pest control scheduling dispatch software challenges small business',
    'field service company mobile workforce management barriers',
    'service business quoting estimating manual process errors cost',
    'small business developer abandoned incomplete custom software',
    'delivery company driver scheduling dispatch technology problems',
    # Pain statistics with real numbers
    'small business manual processes labor cost productivity statistics',
    'SMB data visibility reporting gap operational decisions statistics',
    'small business payroll time tracking errors cost statistics',
    'field service paper forms digital conversion ROI statistics',
    'small business spreadsheet operational risk statistics report',
    'SMB custom software ROI operational efficiency case study',
    'agentic AI workflow automation small business productivity statistics',
    'small business data pipeline reporting automation benefits ROI',
    'SMB technology adoption barriers talent shortage statistics',
    'small business tech debt operational systems integration cost',
]
```

- [ ] **Step 2: Add `days=30` to the Tavily search call (lines 141–146)**

Replace:
```python
        response = tavily.search(
            query=query,
            search_depth='advanced',
            max_results=5,
            include_answer=False,
        )
```

With:
```python
        response = tavily.search(
            query=query,
            search_depth='advanced',
            max_results=5,
            include_answer=False,
            days=30,
        )
```

- [ ] **Step 3: Update the `extract_insights` prompt to focus on operational pain**

The existing prompt asks Claude to extract "challenges, technology adoption, AI use, automation" — we need it to also prioritize operational specifics for the target industries. Replace the prompt string inside `extract_insights()`:

Replace:
```python
    prompt = f"""You are extracting SMB market insights for Zimplixio, a technology services company for small and medium businesses in the USA.

Search query that found this content: "{query}"

From the search results below, extract 3-5 specific, credible insights or statistics about SMB challenges, technology adoption, AI use, automation, data management, or operational efficiency. Prioritize insights with real numbers or percentages. Skip vague or purely promotional content.

For each insight, identify which Zimplixio service it is most relevant to:
{ZIMPLIXIO_SERVICES}
```

With:
```python
    prompt = f"""You are extracting SMB market insights for Zimplixio, a technology contractor that helps operationally complex small businesses — trucking, field service, distribution, construction, pest control, and similar industries — replace manual processes with software that works.

Search query that found this content: "{query}"

From the search results below, extract 3-5 specific, credible insights or statistics about: operational pain in small businesses, manual process costs, scheduling and dispatch problems, data visibility gaps, payroll or time-tracking errors, failed software projects, or technology adoption barriers in non-glamorous industries. Prioritize insights with real numbers or percentages. Skip generic AI trend content or corporate enterprise content — focus on small business operational reality.

For each insight, identify which Zimplixio service it is most relevant to:
{ZIMPLIXIO_SERVICES}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/josephugaldeberrocal/Documents/Zimplixio_Marketing
git add execution/context_search.py
git commit -m "feat: update context_search queries and insight extraction for ops-industry target, add days=30"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task that covers it |
|---|---|
| Fix rotation bug — use persistent counter not `len(drafts)` | Task 3 |
| Fix outcome pattern selector — round-robin not keyword score | Task 2 + Task 3 |
| Cross-run angle memory — track last N hooks | Task 4 |
| Add `days=14` recency filter to Tavily in posts_generate.py | Task 3 |
| Replace TAVILY_RESEARCH_QUERIES with operational pain queries | Task 5 |
| Rewrite SYSTEM_PROMPT — story-first, no jargon, ops-industry target | Task 6 |
| Replace OUTCOME_PATTERNS with ops-heavy scenarios | Task 7 |
| Update context_search.py queries + `days=30` | Task 8 |
| TDD — tests written before implementation | Task 1 (tests), Task 2 (impl) |

**Placeholder scan:** None found.

**Type consistency check:**
- `pick_research_query_indices(tavily_run_count: int, num_queries: int) -> list[int]` — defined Task 2, used in Task 3 as `pick_research_query_indices(tavily_run_count, len(TAVILY_RESEARCH_QUERIES))` ✓
- `pick_outcome_pattern_by_index(context: dict) -> dict` — defined Task 2, used in Task 3 ✓
- `extract_hook(post_text: str) -> str` — defined Task 2, used in Task 4 ✓
- `build_system_prompt(recent_hooks: list[str]) -> str` — defined Task 2, used in Task 3 ✓
- `generate(client, prompt, system)` — third param added Task 2, all call sites updated Task 3 ✓
- `context['recent_hooks']` — initialized Task 3, appended Task 4, trimmed and saved Task 4 ✓

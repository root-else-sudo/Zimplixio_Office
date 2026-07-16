import { z } from 'zod'
import { toJsonSchema } from '../ai/json-schema'

// ─── Hypothesize ──────────────────────────────────────────────────────────

export const ProbeHypothesisSchema = z.object({
  need: z.string().min(1).max(300)
    .describe('The candidate need or pain point for this specific company, stated plainly in one concise sentence (under 200 characters).'),
  proposedService: z.string().min(1).max(300)
    .describe('The Zimplixio service/offering that would address this need, in one concise sentence (under 200 characters).'),
  basedOnSignal: z.array(z.string().min(1).max(300)).min(1).max(6)
    .describe('Short quotes or paraphrases of the specific gathered signal items this is based on.'),
})
export type ProbeHypothesis = z.infer<typeof ProbeHypothesisSchema>

export const ProbeHypothesizeOutputSchema = z.object({
  hypotheses: z.array(ProbeHypothesisSchema).max(10),
})
export type ProbeHypothesizeOutput = z.infer<typeof ProbeHypothesizeOutputSchema>

export const PROBE_HYPOTHESIZE_TOOL = {
  name: 'propose_probe_hypotheses',
  description:
    'Propose candidate need+service hypotheses for one specific named company, grounded in the gathered signal. Return an empty list if nothing credible was found — do not force it.',
  input_schema: toJsonSchema(ProbeHypothesizeOutputSchema),
}

// ─── Test ──────────────────────────────────────────────────────────────────

export const ProbeTestedHypothesisSchema = z.object({
  title: z.string().min(1).max(150)
    .describe('Short title — the specific need + service as one natural phrase.'),
  evidence: z.string().min(1).max(2000)
    .describe('Prose describing the corroborating dots connected across sources about this specific company. Not a restatement of the hypothesis.'),
  fitRationale: z.string().min(1).max(1000)
    .describe('Must name something specific from the Company Profile. No fit rationale means this hypothesis is invalid.'),
  confidence: z.enum(['LOW', 'MEDIUM', 'HIGH'])
    .describe('HIGH: multiple independent, specific, corroborating sources about this company, no meaningful disconfirming signal. MEDIUM: some real support but thin/single-sourced/partially contradicted. LOW: little more than a guess, unsupported, or contradicted.'),
  disconfirmingEvidence: z.string().max(1000).optional()
    .describe('Evidence found against this hypothesis, if any — even for MEDIUM/HIGH.'),
})
export type ProbeTestedHypothesis = z.infer<typeof ProbeTestedHypothesisSchema>

export const ProbeTestOutputSchema = z.object({
  // One entry per hypothesis received, including LOW — no filtering here,
  // every hypothesis gets persisted and shown (design doc §3).
  testedHypotheses: z.array(ProbeTestedHypothesisSchema).max(10),
})
export type ProbeTestOutput = z.infer<typeof ProbeTestOutputSchema>

export const PROBE_TEST_TOOL = {
  name: 'submit_probe_tested_hypotheses',
  description:
    'Return one tested entry for every hypothesis provided, in the same order, with a confidence rating — do not omit any.',
  input_schema: toJsonSchema(ProbeTestOutputSchema),
}

// ─── Review (signal-quality gate before Hypothesize) ───────────────────────

export const ProbeSignalReviewItemSchema = z.object({
  index: z.number().int().min(0)
    .describe('The 0-based index of the signal item this verdict is for, matching the order it was given in.'),
  include: z.boolean()
    .describe('true if this item is genuinely about the named company and not a duplicate of an earlier item; false to exclude it from the reasoning stage.'),
  reason: z.string().min(1).max(300)
    .describe('One concise sentence explaining the verdict — required for both include and exclude, so every call can be audited.'),
  cleanedContent: z.string().max(6000).optional()
    .describe('ONLY set when include=true AND the item mixes genuinely company-specific content with clearly irrelevant blocks (e.g. a job board\'s platform-wide statistics unrelated to this one company, generic nav/footer text). Return the content with ONLY the irrelevant blocks removed — do not summarize, paraphrase, or rewrite what you keep, and do not remove anything you are not certain is irrelevant. Omit this field entirely when the item is already clean, or when include=false.'),
  domainWideIssue: z.boolean().optional()
    .describe('ONLY set true when include=false AND the reason this item is excluded is a property of the DOMAIN ITSELF, not a coincidence specific to this one company — e.g. a generic review-platform homepage with no company-specific content ever, or a job-board search-results page that structurally mixes many companies\' listings together. Do NOT set this for a same-named-but-different-entity mismatch (a neighborhood, a different business that happens to share this company\'s name) — that is specific to this company\'s name, not a fact about the domain, and would wrongly block that domain for every other company researched in the future. When in doubt, leave unset.'),
})
export type ProbeSignalReviewItem = z.infer<typeof ProbeSignalReviewItemSchema>

export const ProbeSignalReviewOutputSchema = z.object({
  // One entry per item received, in the same order — no filtering here,
  // every item gets a verdict so a bad call can be audited (mirrors the
  // Test stage's "do not silently drop any" discipline).
  reviewed: z.array(ProbeSignalReviewItemSchema),
})
export type ProbeSignalReviewOutput = z.infer<typeof ProbeSignalReviewOutputSchema>

export const PROBE_REVIEW_TOOL = {
  name: 'submit_probe_signal_review',
  description:
    'Return one verdict for every gathered signal item, in the same order, judging whether it is genuinely about the named company and not a duplicate of an earlier item — do not omit any.',
  input_schema: toJsonSchema(ProbeSignalReviewOutputSchema),
}

// ─── Review Guidance distillation (the Review step's own learning loop) ────

export const ProbeReviewDistillOutputSchema = z.object({
  guidance: z.string().max(2000)
    .describe('The rewritten Review Guidance — a compacted plain-English paragraph or two of general noise patterns, not a growing log. Replaces the previous guidance entirely.'),
})
export type ProbeReviewDistillOutput = z.infer<typeof ProbeReviewDistillOutputSchema>

export const PROBE_REVIEW_DISTILL_TOOL = {
  name: 'submit_probe_review_guidance',
  description:
    "Return the rewritten Review Guidance that replaces the previous one, incorporating this run's exclusion patterns.",
  input_schema: toJsonSchema(ProbeReviewDistillOutputSchema),
}

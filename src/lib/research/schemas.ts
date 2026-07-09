import { z } from 'zod'
import { toJsonSchema } from '../ai/json-schema'

// ─── Hypothesize ──────────────────────────────────────────────────────────

export const HypothesisSchema = z.object({
  need: z.string().min(1).max(300)
    .describe('The candidate small-business pain point or need, stated plainly in one concise sentence (under 200 characters).'),
  proposedService: z.string().min(1).max(300)
    .describe('The Zimplixio service/offering that would address this need, in one concise sentence (under 200 characters).'),
  basedOnSignal: z.array(z.string().min(1).max(300)).min(1).max(6)
    .describe('Short quotes or paraphrases of the specific gathered signal items this is based on.'),
})
export type Hypothesis = z.infer<typeof HypothesisSchema>

export const HypothesizeOutputSchema = z.object({
  hypotheses: z.array(HypothesisSchema).max(10),
})
export type HypothesizeOutput = z.infer<typeof HypothesizeOutputSchema>

export const HYPOTHESIZE_TOOL = {
  name: 'propose_hypotheses',
  description:
    'Propose candidate need+service hypotheses grounded in the gathered signal. Return an empty list if nothing credible was found — do not force it.',
  input_schema: toJsonSchema(HypothesizeOutputSchema),
}

// ─── Test ──────────────────────────────────────────────────────────────────

export const TestedHypothesisSchema = z.object({
  title: z.string().min(1).max(150)
    .describe('Short title — the niche + service as one natural phrase.'),
  evidence: z.string().min(1).max(2000)
    .describe('Prose describing the corroborating dots connected across sources. Not a restatement of the hypothesis.'),
  fitRationale: z.string().min(1).max(1000)
    .describe('Must name something specific from the Company Profile. No fit rationale means this hypothesis is invalid.'),
  confidence: z.enum(['LOW', 'MEDIUM', 'HIGH'])
    .describe('HIGH: multiple independent, specific, corroborating sources, no meaningful disconfirming signal. MEDIUM: some real support but thin/single-sourced/partially contradicted. LOW: little more than a guess, unsupported, or contradicted.'),
  disconfirmingEvidence: z.string().max(1000).optional()
    .describe('Evidence found against this hypothesis, if any — even for MEDIUM/HIGH.'),
})
export type TestedHypothesis = z.infer<typeof TestedHypothesisSchema>

export const TestOutputSchema = z.object({
  // One entry per hypothesis received, including LOW — dropping/capping
  // happens deterministically in engine.ts, not left to the model.
  testedHypotheses: z.array(TestedHypothesisSchema).max(10),
})
export type TestOutput = z.infer<typeof TestOutputSchema>

export const TEST_TOOL = {
  name: 'submit_tested_findings',
  description:
    'Return one tested entry for every hypothesis provided, in the same order, with a confidence rating — do not omit any, even low-confidence ones.',
  input_schema: toJsonSchema(TestOutputSchema),
}

// ─── Distill (the learning loop) ────────────────────────────────────────────

export const DistillOutputSchema = z.object({
  summary: z.string().max(2000)
    .describe('The rewritten Guidance Summary — a compacted plain-English paragraph or two, not a growing log. Replaces the previous summary entirely.'),
})
export type DistillOutput = z.infer<typeof DistillOutputSchema>

export const DISTILL_TOOL = {
  name: 'submit_guidance_summary',
  description:
    'Return the rewritten Guidance Summary that replaces the previous one, incorporating the new feedback.',
  input_schema: toJsonSchema(DistillOutputSchema),
}

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

import { z } from 'zod'

// A Finding is not a bare pain point — no fit rationale means it's not a
// valid Finding (planning §2.2), so all three content fields are required.
export const FindingSchema = z
  .object({
    title: z.string().min(1, 'Title is required'),
    evidence: z.string().min(1, 'Evidence is required'),
    fitRationale: z.string().min(1, 'Fit rationale is required'),
    status: z.enum(['CANDIDATE', 'VALIDATED', 'REJECTED']).default('CANDIDATE'),
    rejectionReason: z.string().optional(),
  })
  .refine((data) => data.status !== 'REJECTED' || !!data.rejectionReason?.trim(), {
    message: 'A written reason is required when rejecting a Finding',
    path: ['rejectionReason'],
  })

export const FINDING_STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  CANDIDATE: { bg: 'var(--copper-100)', color: 'var(--copper-500)', label: 'Candidate' },
  VALIDATED: { bg: 'var(--green-50)', color: 'var(--green-600)', label: 'Validated' },
  REJECTED: { bg: '#F3F4F6', color: 'var(--gray-600)', label: 'Rejected' },
}

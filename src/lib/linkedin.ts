// LinkedIn publisher — placeholder until LinkedIn page and OAuth credentials are set up.
// To activate: add LINKEDIN_ACCESS_TOKEN and LINKEDIN_AUTHOR_ID to .env
// and replace the stub below with the actual API call.

import { serverEnv } from './env'
import { logger } from './logger'

export async function publishToLinkedIn(content: string): Promise<{ ok: boolean; message: string }> {
  const token = serverEnv.LINKEDIN_ACCESS_TOKEN
  const authorId = serverEnv.LINKEDIN_AUTHOR_ID

  if (!token || !authorId) {
    logger.info('LinkedIn publishing not configured — skipping')
    return { ok: false, message: 'LinkedIn publishing not configured' }
  }

  // ── Activate when LinkedIn page is ready ──────────────────────────────────
  // const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
  //   method: 'POST',
  //   headers: {
  //     Authorization: `Bearer ${token}`,
  //     'Content-Type': 'application/json',
  //     'X-Restli-Protocol-Version': '2.0.0',
  //   },
  //   body: JSON.stringify({
  //     author: `urn:li:organization:${authorId}`,
  //     lifecycleState: 'PUBLISHED',
  //     specificContent: {
  //       'com.linkedin.ugc.ShareContent': {
  //         shareCommentary: { text: content },
  //         shareMediaCategory: 'NONE',
  //       },
  //     },
  //     visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  //   }),
  // })
  // if (!res.ok) {
  //   const err = await res.text()
  //   logger.error({ err }, 'linkedin post failed')
  //   return { ok: false, message: err }
  // }
  // return { ok: true, message: 'Published to LinkedIn' }

  return { ok: false, message: 'LinkedIn publishing not configured' }
}

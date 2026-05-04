// Sends a single WhatsApp test message via Twilio and prints the full response
// (or error). Useful when notifications "silently" don't arrive — Twilio will
// usually accept the request even when the WhatsApp sandbox has expired the
// recipient's session, so the worker logs nothing while the message never
// lands.
//
//   npm run test:whatsapp
import './load-env'
import { sendWhatsApp } from '@/lib/twilio'
import { serverEnv } from '@/lib/env'
import { logger } from '@/lib/logger'

async function main() {
  logger.info(
    {
      from: serverEnv.TWILIO_WHATSAPP_FROM,
      to: serverEnv.WHATSAPP_NOTIFY_TO,
    },
    'sending test message'
  )

  try {
    const message = await sendWhatsApp(
      `Test from Zimplixio Office — ${new Date().toISOString()}`
    )
    logger.info(
      {
        sid: message.sid,
        status: message.status,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage,
        to: message.to,
        from: message.from,
      },
      'twilio accepted the message'
    )
    logger.info(
      'Check delivery status at https://console.twilio.com/us1/monitor/logs/sms?frameUrl=/console/sms/logs'
    )
  } catch (err) {
    logger.error({ err }, 'twilio rejected the message')
    if (err && typeof err === 'object' && 'code' in err) {
      const e = err as Record<string, unknown>
      logger.error(
        {
          twilioCode: e.code,
          twilioStatus: e.status,
          moreInfo: e.moreInfo,
        },
        'twilio error details'
      )
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, 'script crashed')
    process.exit(1)
  })

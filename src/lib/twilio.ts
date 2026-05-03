import twilio from 'twilio'

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
)

export async function sendWhatsApp(message: string) {
  return client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM!,
    to: process.env.WHATSAPP_NOTIFY_TO!,
    body: message,
  })
}

export async function createTotpFactor(userId: string, userName: string) {
  const factor = await client.verify.v2
    .services(process.env.TWILIO_VERIFY_SERVICE_SID!)
    .entities(userId)
    .newFactors.create({
      friendlyName: userName,
      factorType: 'totp',
    })
  return factor
}

export async function verifyTotpSetup(userId: string, factorSid: string, code: string) {
  const factor = await client.verify.v2
    .services(process.env.TWILIO_VERIFY_SERVICE_SID!)
    .entities(userId)
    .factors(factorSid)
    .update({ authPayload: code })
  return factor.status === 'verified'
}

export async function verifyTotpCode(userId: string, factorSid: string, code: string) {
  const challenge = await client.verify.v2
    .services(process.env.TWILIO_VERIFY_SERVICE_SID!)
    .entities(userId)
    .challenges.create({
      factorSid,
      authPayload: code,
    })
  return challenge.status === 'approved'
}

import twilio from 'twilio'
import { serverEnv } from './env'

const client = twilio(serverEnv.TWILIO_ACCOUNT_SID, serverEnv.TWILIO_AUTH_TOKEN)

export async function sendWhatsApp(message: string) {
  return client.messages.create({
    from: serverEnv.TWILIO_WHATSAPP_FROM,
    to: serverEnv.WHATSAPP_NOTIFY_TO,
    body: message,
  })
}

export async function createTotpFactor(userId: string, userName: string) {
  const factor = await client.verify.v2
    .services(serverEnv.TWILIO_VERIFY_SERVICE_SID)
    .entities(userId)
    .newFactors.create({
      friendlyName: userName,
      factorType: 'totp',
    })
  return factor
}

export async function verifyTotpSetup(userId: string, factorSid: string, code: string) {
  const factor = await client.verify.v2
    .services(serverEnv.TWILIO_VERIFY_SERVICE_SID)
    .entities(userId)
    .factors(factorSid)
    .update({ authPayload: code })
  return factor.status === 'verified'
}

export async function verifyTotpCode(userId: string, factorSid: string, code: string) {
  const challenge = await client.verify.v2
    .services(serverEnv.TWILIO_VERIFY_SERVICE_SID)
    .entities(userId)
    .challenges.create({
      factorSid,
      authPayload: code,
    })
  return challenge.status === 'approved'
}

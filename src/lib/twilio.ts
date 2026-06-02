import twilio from 'twilio'
import { serverEnv } from './env'

let _client: ReturnType<typeof twilio> | null = null
function getClient() {
  if (!_client) _client = twilio(serverEnv.TWILIO_ACCOUNT_SID, serverEnv.TWILIO_AUTH_TOKEN)
  return _client
}

export async function sendSMS(message: string) {
  if (!serverEnv.TWILIO_SMS_FROM || !serverEnv.SMS_NOTIFY_TO) {
    throw new Error('SMS not configured: TWILIO_SMS_FROM and SMS_NOTIFY_TO are required')
  }
  return getClient().messages.create({
    from: serverEnv.TWILIO_SMS_FROM,
    to: serverEnv.SMS_NOTIFY_TO,
    body: message,
  })
}

export async function createTotpFactor(userId: string, userName: string) {
  const factor = await getClient().verify.v2
    .services(serverEnv.TWILIO_VERIFY_SERVICE_SID)
    .entities(userId)
    .newFactors.create({
      friendlyName: userName,
      factorType: 'totp',
    })
  return factor
}

export async function verifyTotpSetup(userId: string, factorSid: string, code: string) {
  const factor = await getClient().verify.v2
    .services(serverEnv.TWILIO_VERIFY_SERVICE_SID)
    .entities(userId)
    .factors(factorSid)
    .update({ authPayload: code })
  return factor.status === 'verified'
}

export async function verifyTotpCode(userId: string, factorSid: string, code: string) {
  const challenge = await getClient().verify.v2
    .services(serverEnv.TWILIO_VERIFY_SERVICE_SID)
    .entities(userId)
    .challenges.create({
      factorSid,
      authPayload: code,
    })
  return challenge.status === 'approved'
}

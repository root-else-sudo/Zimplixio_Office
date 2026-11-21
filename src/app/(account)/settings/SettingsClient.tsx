'use client'

export default function SettingsClient({ mfaEnabled }: { mfaEnabled: boolean }) {
  return (
    <div className="settings-page">
      <div>
        <p className="eyebrow">Settings</p>
        <h1 className="settings-title">Account</h1>
      </div>

      <div className="soft-card settings-card">
        <div>
          <h2 className="settings-card-title">Two-factor authentication</h2>
          <p className="settings-card-text">
            Adds a 6-digit code from an authenticator app to every sign-in, so a password alone can&apos;t access your account.
          </p>
        </div>

        <p className={mfaEnabled ? 'settings-status settings-status-on' : 'settings-status'}>
          {mfaEnabled ? 'Enabled — required for every account' : 'Not enabled'}
        </p>
      </div>
    </div>
  )
}

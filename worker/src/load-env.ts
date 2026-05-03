// Loaded as the very first import in worker/src/index.ts.
// Reads .env and force-overrides existing process.env values, because parent
// shells (notably Claude Code) sometimes export empty placeholders that would
// otherwise mask the real config.
//
// On Railway in production there is no .env file — Railway-injected env vars
// flow straight into process.env unchanged. `dotenv.config` is a no-op when
// the file is missing.
import dotenv from 'dotenv'

dotenv.config({ override: true, quiet: true })

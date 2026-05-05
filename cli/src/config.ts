// config.ts — centralised env/config for the CLI agent
// Loads .env from multiple candidate locations (Major/, cli/, cwd).
import * as dotenv from 'dotenv'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __srcDir = fileURLToPath(new URL('.', import.meta.url))
// __srcDir = .../Major/cli/src/
// cli/ = __srcDir + '..'
// Major/ = __srcDir + '../..'
// project root = __srcDir + '../../..'

const ENV_CANDIDATES = [
  resolve(__srcDir, '../.env'),         // Major/cli/.env
  resolve(__srcDir, '../../.env'),      // Major/.env  ← primary
  resolve(__srcDir, '../../../.env'),   // multi-agent root .env (fallback)
  resolve(process.cwd(), '.env'),       // wherever you run from
]

for (const path of ENV_CANDIDATES) {
  dotenv.config({ path })
}

export const config = {
  openaiApiKey: process.env['OPENAI_API_KEY'] ?? '',
  anthropicApiKey: process.env['ANTHROPIC_API_KEY'] ?? '',
  defaultModel: process.env['AGENT_MODEL'] ?? 'gpt-4o-mini',
  defaultProvider: (process.env['AGENT_PROVIDER'] ?? 'openai') as 'openai' | 'anthropic',
  maxTokens: parseInt(process.env['AGENT_MAX_TOKENS'] ?? '4096', 10),
  temperature: parseFloat(process.env['AGENT_TEMPERATURE'] ?? '0.2'),
  historyDir: resolve(
    process.env['USERPROFILE'] ?? process.env['HOME'] ?? '.',
    '.agent-cli',
    'history',
  ),
  permissionsFile: resolve(
    process.env['USERPROFILE'] ?? process.env['HOME'] ?? '.',
    '.agent-cli',
    'permissions.json',
  ),
} as const

export type Provider = typeof config.defaultProvider

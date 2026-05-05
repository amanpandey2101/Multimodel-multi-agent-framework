// context/GitContext.ts — capture git status, branch, and recent commits for system prompt
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const MAX_STATUS_CHARS = 2000

async function run(cmd: string, cwd: string): Promise<string> {
  try {
    const { stdout } = await execAsync(cmd, { cwd, timeout: 5000 })
    return stdout.trim()
  } catch {
    return ''
  }
}

async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync('git rev-parse --is-inside-work-tree', { cwd, timeout: 3000 })
    return stdout.trim() === 'true'
  } catch {
    return false
  }
}

export async function getGitContext(cwd: string): Promise<string | null> {
  if (!(await isGitRepo(cwd))) return null

  const [branch, status, log, userName] = await Promise.all([
    run('git rev-parse --abbrev-ref HEAD', cwd),
    run('git status --short', cwd),
    run('git log --oneline -n 5', cwd),
    run('git config user.name', cwd),
  ])

  const truncatedStatus =
    status.length > MAX_STATUS_CHARS
      ? status.slice(0, MAX_STATUS_CHARS) + '\n... (truncated — run `git status` for full output)'
      : status

  const parts = [
    `Git branch: ${branch || 'unknown'}`,
    userName ? `Git user: ${userName}` : null,
    `Git status:\n${truncatedStatus || '(clean)'}`,
    log ? `Recent commits:\n${log}` : null,
  ].filter(Boolean)

  return parts.join('\n\n')
}

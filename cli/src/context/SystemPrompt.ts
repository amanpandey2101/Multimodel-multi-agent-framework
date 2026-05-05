// context/SystemPrompt.ts — assembles the full system prompt
// Combines static persona + CLAUDE.md + git context + directory tree.
// Memoized — built once per session for performance.
import { getGitContext } from './GitContext'
import { getDirTree } from './DirTree'
import { getClaudeMd } from './ClaudeMd'

const BASE_PROMPT = `You are an expert software engineering assistant — a local coding agent running in the user's terminal.

You have access to the local filesystem and can read files, edit code, run commands, and search the codebase.

## Core principles
- EXTREMELY CONCISE: Be as brief as possible. Minimize token usage.
- Prefer action over explanation. Omit all pleasantries and filler words.
- For code explanations, give a 1-2 sentence summary unless a detailed breakdown is explicitly requested.
- Always read the relevant files before making edits.
- Prefer targeted edits (edit_file) over full rewrites (write_file).
- Run tests after making changes when a test command is known.
- If unsure, ask a clarifying question before taking action.
- Never run destructive commands without explicit user confirmation.

## Working with the codebase
- Use grep to search before assuming file contents.
- Use list_dir to understand project structure.
- Read small targeted sections of files using offset/limit in read_file.
- Make sure edits are syntactically valid — prefer running the code after editing.

## Communication style
- Use markdown formatting in responses.
- When showing code changes, show a before/after diff mentally.
- Keep responses focused — no unnecessary preamble.
`

let cachedPrompt: string | null = null
let cachedCwd: string | null = null

export async function buildSystemPrompt(cwd: string, forceRefresh = false): Promise<string> {
  if (cachedPrompt && cachedCwd === cwd && !forceRefresh) {
    return cachedPrompt
  }

  const [claudeMd, gitContext, dirTree] = await Promise.all([
    getClaudeMd(cwd).catch(() => null),
    getGitContext(cwd).catch(() => null),
    getDirTree(cwd).catch(() => null),
  ])

  const sections: string[] = [BASE_PROMPT]

  if (claudeMd) {
    sections.push(`---\n${claudeMd}`)
  }

  sections.push(`---\n## Environment\nCurrent directory: ${cwd}\nPlatform: ${process.platform}\nDate: ${new Date().toISOString().slice(0, 10)}`)

  if (dirTree) {
    sections.push(`---\n## Project Structure\n\`\`\`\n${dirTree}\n\`\`\``)
  }

  if (gitContext) {
    sections.push(`---\n## Git Context\n${gitContext}`)
  }

  cachedPrompt = sections.join('\n\n')
  cachedCwd = cwd

  return cachedPrompt
}

export function clearSystemPromptCache(): void {
  cachedPrompt = null
  cachedCwd = null
}

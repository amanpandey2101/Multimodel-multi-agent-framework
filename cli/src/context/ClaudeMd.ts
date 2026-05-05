// context/ClaudeMd.ts — read CLAUDE.md / AGENT.md project memory files
// Walks up from cwd until it finds a CLAUDE.md or AGENT.md, like Claude Code.
import { readFile, access } from 'fs/promises'
import { join, dirname } from 'path'

const MEMORY_FILES = ['CLAUDE.md', 'AGENT.md', '.agent.md', 'AGENTS.md']

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

export async function getClaudeMd(startDir: string): Promise<string | null> {
  let current = startDir
  const root = dirname(current.split(':')[0] ?? current) // stop at fs root

  for (let depth = 0; depth < 10; depth++) {
    for (const name of MEMORY_FILES) {
      const candidate = join(current, name)
      if (await fileExists(candidate)) {
        try {
          const content = await readFile(candidate, 'utf-8')
          if (content.trim()) {
            return `# Project Instructions (from ${name})\n\n${content.trim()}`
          }
        } catch {
          // skip unreadable files
        }
      }
    }

    const parent = dirname(current)
    if (parent === current) break // reached root
    current = parent
  }

  return null
}

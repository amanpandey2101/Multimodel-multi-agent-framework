// context/DirTree.ts — compact project directory tree for system prompt
import { readdir, stat } from 'fs/promises'
import { join, relative } from 'path'

const EXCLUDE = new Set(['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', '.venv', 'coverage', '.turbo'])
const MAX_ENTRIES = 80
const MAX_DEPTH = 3

async function buildCompactTree(
  dir: string,
  depth: number,
  prefix: string,
  lines: string[],
  count: { n: number },
): Promise<void> {
  if (depth > MAX_DEPTH || count.n >= MAX_ENTRIES) return

  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1
    if (!a.isDirectory() && b.isDirectory()) return 1
    return a.name.localeCompare(b.name)
  })

  for (let i = 0; i < entries.length; i++) {
    if (count.n >= MAX_ENTRIES) {
      lines.push(`${prefix}…`)
      break
    }

    const entry = entries[i]!
    const isLast = i === entries.length - 1
    const conn = isLast ? '└─ ' : '├─ '
    const nextPrefix = isLast ? prefix + '   ' : prefix + '│  '

    if (entry.isDirectory()) {
      if (EXCLUDE.has(entry.name)) continue
      lines.push(`${prefix}${conn}${entry.name}/`)
      count.n++
      await buildCompactTree(join(dir, entry.name), depth + 1, nextPrefix, lines, count)
    } else {
      lines.push(`${prefix}${conn}${entry.name}`)
      count.n++
    }
  }
}

export async function getDirTree(cwd: string): Promise<string> {
  const rel = relative(process.cwd(), cwd) || '.'
  const lines: string[] = [`${rel}/`]
  await buildCompactTree(cwd, 1, '', lines, { n: 0 })
  return lines.join('\n')
}

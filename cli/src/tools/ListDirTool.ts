// tools/ListDirTool.ts — list directory contents as a compact tree
import { readdir, stat } from 'fs/promises'
import { join, resolve, relative } from 'path'
import type { RegisteredTool } from '../agent/ToolRegistry'

const EXCLUDE_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', '.venv', 'coverage'])
const MAX_DEPTH = 4
const MAX_ENTRIES = 200

async function buildTree(
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

  // Sort: directories first, then files
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1
    if (!a.isDirectory() && b.isDirectory()) return 1
    return a.name.localeCompare(b.name)
  })

  for (let i = 0; i < entries.length; i++) {
    if (count.n >= MAX_ENTRIES) {
      lines.push(`${prefix}… (more entries)`)
      break
    }

    const entry = entries[i]!
    const isLast = i === entries.length - 1
    const connector = isLast ? '└── ' : '├── '
    const childPrefix = isLast ? prefix + '    ' : prefix + '│   '

    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) {
        lines.push(`${prefix}${connector}${entry.name}/ (excluded)`)
        count.n++
        continue
      }
      lines.push(`${prefix}${connector}${entry.name}/`)
      count.n++
      await buildTree(join(dir, entry.name), depth + 1, childPrefix, lines, count)
    } else {
      let size = ''
      try {
        const info = await stat(join(dir, entry.name))
        const kb = Math.round(info.size / 1024)
        size = kb > 0 ? ` (${kb}KB)` : ''
      } catch {
        // ignore
      }
      lines.push(`${prefix}${connector}${entry.name}${size}`)
      count.n++
    }
  }
}

export const ListDirTool: RegisteredTool = {
  definition: {
    name: 'list_dir',
    description: 'List the contents of a directory as a tree. Shows files and subdirectories up to 4 levels deep.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to list. Defaults to current working directory.' },
        depth: { type: 'number', description: 'Max depth to recurse (1–4). Default 3.' },
      },
      required: [],
    },
  },

  async handler(args, _signal) {
    const rawPath = typeof args['path'] === 'string' ? args['path'] : '.'
    const absPath = resolve(process.cwd(), rawPath)
    const relPath = relative(process.cwd(), absPath) || '.'

    const lines: string[] = [`${relPath}/`]
    const count = { n: 0 }

    try {
      await buildTree(absPath, 1, '', lines, count)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { output: `Cannot list "${relPath}": ${msg}`, isError: true }
    }

    return {
      output: lines.join('\n'),
      isError: false,
    }
  },
}

// tools/GrepTool.ts — regex search across files using Node.js (ripgrep when available)
import { readFile, readdir, stat } from 'fs/promises'
import { join, resolve, relative, extname } from 'path'
import type { RegisteredTool } from '../agent/ToolRegistry'

const EXCLUDE_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', '.venv'])
const MAX_RESULTS = 250

async function* walk(dir: string): AsyncGenerator<string> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(full)
    } else if (entry.isFile()) {
      yield full
    }
  }
}

function matchesGlob(filename: string, glob: string): boolean {
  if (!glob) return true
  if (glob.startsWith('*.')) {
    return filename.endsWith(glob.slice(1))
  }
  return filename.includes(glob.replace('*', ''))
}

export const GrepTool: RegisteredTool = {
  definition: {
    name: 'grep',
    description: 'Search for a regex pattern across files in a directory. Returns matching file paths and line contents.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regular expression pattern to search for.' },
        path: { type: 'string', description: 'Directory or file to search in. Defaults to current directory.' },
        glob: { type: 'string', description: 'File glob filter (e.g. "*.ts", "*.py"). Optional.' },
        case_insensitive: { type: 'boolean', description: 'Whether to search case-insensitively. Default false.' },
        max_results: { type: 'number', description: `Max results to return. Defaults to ${MAX_RESULTS}.` },
      },
      required: ['pattern'],
    },
  },

  async handler(args, signal) {
    const rawPattern = args['pattern']
    if (typeof rawPattern !== 'string' || !rawPattern) {
      return { output: 'pattern is required.', isError: true }
    }

    const flags = args['case_insensitive'] === true ? 'i' : ''
    let regex: RegExp
    try {
      regex = new RegExp(rawPattern, flags)
    } catch {
      return { output: `Invalid regex: ${rawPattern}`, isError: true }
    }

    const searchPath = typeof args['path'] === 'string' ? resolve(process.cwd(), args['path']) : process.cwd()
    const glob = typeof args['glob'] === 'string' ? args['glob'] : ''
    const maxResults = typeof args['max_results'] === 'number' ? args['max_results'] : MAX_RESULTS

    const results: string[] = []

    try {
      const info = await stat(searchPath)
      const filesToSearch: string[] = info.isFile() ? [searchPath] : []

      if (!info.isFile()) {
        for await (const file of walk(searchPath)) {
          if (signal?.aborted) break
          if (glob && !matchesGlob(file, glob)) continue
          filesToSearch.push(file)
        }
      }

      for (const file of filesToSearch) {
        if (signal?.aborted) break
        if (results.length >= maxResults) break

        let text: string
        try {
          text = await readFile(file, 'utf-8')
        } catch {
          continue // Skip binary or unreadable files
        }

        const lines = text.split('\n')
        const relFile = relative(process.cwd(), file)

        for (let i = 0; i < lines.length; i++) {
          if (results.length >= maxResults) break
          if (regex.test(lines[i]!)) {
            results.push(`${relFile}:${i + 1}: ${lines[i]}`)
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { output: `Grep error: ${msg}`, isError: true }
    }

    if (results.length === 0) {
      return { output: 'No matches found.', isError: false }
    }

    const truncated = results.length >= maxResults
    const header = `Found ${results.length} match${results.length === 1 ? '' : 'es'}${truncated ? ` (showing first ${maxResults})` : ''}:`
    return { output: `${header}\n${results.join('\n')}`, isError: false }
  },
}

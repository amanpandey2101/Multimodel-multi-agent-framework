// tools/EditFileTool.ts — exact string replacement in a file (like Claude Code's FileEditTool)
// Uses old_string/new_string pattern — the LLM specifies exact text to find and replace.
import { readFile, writeFile } from 'fs/promises'
import { resolve, relative } from 'path'
import type { RegisteredTool } from '../agent/ToolRegistry'

export const EditFileTool: RegisteredTool = {
  definition: {
    name: 'edit_file',
    description: `Edit a file by replacing an exact string match. 
IMPORTANT: old_string must be an exact, unique substring of the file — including leading whitespace.
For creating new files, use write_file instead.
Prefer small, focused edits over replacing large sections.`,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file to edit.' },
        old_string: { type: 'string', description: 'Exact text to find and replace. Must be unique in the file.' },
        new_string: { type: 'string', description: 'Text to replace old_string with.' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },

  requiresApproval: () => true,

  async handler(args, _signal) {
    const rawPath = args['path']
    const oldString = args['old_string']
    const newString = args['new_string']

    if (typeof rawPath !== 'string' || !rawPath) return { output: 'path is required.', isError: true }
    if (typeof oldString !== 'string') return { output: 'old_string must be a string.', isError: true }
    if (typeof newString !== 'string') return { output: 'new_string must be a string.', isError: true }

    const absPath = resolve(process.cwd(), rawPath)
    const relPath = relative(process.cwd(), absPath)

    let content: string
    try {
      content = await readFile(absPath, 'utf-8')
    } catch {
      return { output: `Cannot read "${relPath}" — does it exist?`, isError: true }
    }

    // Count occurrences to enforce uniqueness
    const occurrences = content.split(oldString).length - 1
    if (occurrences === 0) {
      return {
        output: `old_string not found in "${relPath}". Check the exact text, including whitespace.`,
        isError: true,
      }
    }
    if (occurrences > 1) {
      return {
        output: `old_string found ${occurrences} times in "${relPath}". Make it more specific to target a unique match.`,
        isError: true,
      }
    }

    const updated = content.replace(oldString, newString)

    try {
      await writeFile(absPath, updated, 'utf-8')
      const added = newString.split('\n').length - oldString.split('\n').length
      const sign = added >= 0 ? '+' : ''
      return {
        output: `Edited "${relPath}" (${sign}${added} lines net)`,
        isError: false,
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { output: `Failed to write "${relPath}": ${msg}`, isError: true }
    }
  },
}

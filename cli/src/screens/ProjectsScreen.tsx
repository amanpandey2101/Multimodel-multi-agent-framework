import React, { useEffect, useState, useCallback } from 'react'
import { Box, Text, useInput } from 'ink'
import { Spinner } from '../components/Spinner'
import * as api from '../api'
import type { Project, Screen } from '../types'

type Props = {
  onNavigate: (s: Screen) => void
  onError: (msg: string) => void
}

export function ProjectsScreen({ onNavigate, onError }: Props): React.ReactNode {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [cursor, setCursor] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.listProjects()
      // sort by newest
      data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setProjects(data)
      setCursor(0)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Fetch failed')
    } finally {
      setLoading(false)
    }
  }, [onError])

  useEffect(() => {
    void load()
  }, [load])

  useInput((_input, key) => {
    if (loading) return
    if (key.upArrow || _input === 'k') {
      setCursor(c => Math.max(0, c - 1))
    }
    if (key.downArrow || _input === 'j') {
      setCursor(c => Math.min(projects.length - 1, c + 1))
    }
    if (key.return && projects[cursor]) {
      const proj = projects[cursor]!
      onNavigate({ type: 'pipelines', projectId: proj.id, projectName: proj.name })
    }
    if ((_input === 'n' || _input === 'N')) {
      // no project creation yet, could add screen later
      onError('New project creation CLI not implemented, use dashboard')
    }
    if (_input === 'q') {
      process.exit(0)
    }
    if (_input === '?') {
      onNavigate({ type: 'help' })
    }
    // 'c' opens the local coding agent chat
    if (_input === 'c' || _input === 'C') {
      onNavigate({ type: 'chat' })
    }
  })

  // Pagination for long lists
  const maxVisible = 10
  const startIdx = Math.max(0, Math.min(cursor - Math.floor(maxVisible / 2), projects.length - maxVisible))
  const visibleProjects = projects.slice(startIdx, startIdx + maxVisible)

  if (loading && projects.length === 0) {
    return (
      <Box paddingX={2} paddingY={1}>
        <Spinner label="Loading projects…" />
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box marginBottom={1} paddingX={1} borderStyle="round" borderColor="magenta">
        <Text bold color="magenta">◈ </Text>
        <Text>Press </Text>
        <Text bold color="cyan">c</Text>
        <Text> to open the local coding agent (Claude Code style)</Text>
      </Box>

      <Text bold color="magenta">Projects</Text>
      
      <Box marginTop={1} flexDirection="column">
        {projects.length === 0 ? (
          <Text dimColor>No projects found. Create one in the web dashboard.</Text>
        ) : (
          visibleProjects.map((p, i) => {
            const actualIdx = startIdx + i
            const selected = actualIdx === cursor
            return (
              <Box key={p.id} flexDirection="row">
                <Text color={selected ? 'magenta' : undefined}>
                  {selected ? '❯ ' : '  '}
                </Text>
                <Text bold={selected} color={selected ? 'white' : 'gray'}>
                  {p.name.padEnd(20)}
                </Text>
                <Text dimColor>
                  {p.pipeline_count > 0 ? `${p.pipeline_count} pipelines` : 'No pipelines'}
                </Text>
              </Box>
            )
          })
        )}
      </Box>
      
      {projects.length > maxVisible && (
        <Box marginTop={1}>
          <Text dimColor>
            Showing {startIdx + 1}-{Math.min(startIdx + maxVisible, projects.length)} of {projects.length}
          </Text>
        </Box>
      )}
    </Box>
  )
}

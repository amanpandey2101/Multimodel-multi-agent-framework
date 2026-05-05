import React, { useEffect, useState, useCallback } from 'react'
import { Box, Text, useInput } from 'ink'
import { Spinner } from '../components/Spinner'
import { PipelineStatusBadge } from '../components/PipelineStages'
import * as api from '../api'
import type { Pipeline, Screen } from '../types'

type Props = {
  projectId: string
  projectName: string
  onNavigate: (s: Screen) => void
  onError: (msg: string) => void
}

export function PipelinesScreen({ projectId, projectName, onNavigate, onError }: Props): React.ReactNode {
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [loading, setLoading] = useState(true)
  const [cursor, setCursor] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.listPipelines(projectId)
      data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setPipelines(data)
      setCursor(0)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Fetch failed')
    } finally {
      setLoading(false)
    }
  }, [projectId, onError])

  useEffect(() => {
    void load()
  }, [load])

  useInput((_input, key) => {
    if (loading) return
    if (key.upArrow || _input === 'k') {
      setCursor(c => Math.max(0, c - 1))
    }
    if (key.downArrow || _input === 'j') {
      setCursor(c => Math.min(pipelines.length - 1, c + 1))
    }
    if (key.return && pipelines[cursor]) {
      const pip = pipelines[cursor]!
      onNavigate({ type: 'watch', pipelineId: pip.id })
    }
    if (_input === 'n' || _input === 'N') {
      onNavigate({ type: 'new-pipeline', projectId, projectName })
    }
    if (key.escape || _input === 'b') {
      onNavigate({ type: 'projects' })
    }
    if (_input === 'q') {
      process.exit(0)
    }
  })

  const maxVisible = 10
  const startIdx = Math.max(0, Math.min(cursor - Math.floor(maxVisible / 2), pipelines.length - maxVisible))
  const visible = pipelines.slice(startIdx, startIdx + maxVisible)

  if (loading && pipelines.length === 0) {
    return (
      <Box paddingX={2} paddingY={1}>
        <Spinner label={`Loading pipelines for ${projectName}…`} />
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold>
        <Text color="magenta">{projectName} </Text>
        <Text dimColor>› Pipelines</Text>
      </Text>
      
      <Box marginTop={1} flexDirection="column">
        {pipelines.length === 0 ? (
          <Text dimColor>No pipelines found. Press 'n' to create one.</Text>
        ) : (
          visible.map((p, i) => {
            const actualIdx = startIdx + i
            const selected = actualIdx === cursor
            // Truncate requirement slightly
            const req = p.requirement.length > 40 ? p.requirement.slice(0, 37) + '...' : p.requirement
            
            return (
              <Box key={p.id} flexDirection="row">
                <Text color={selected ? 'magenta' : undefined}>
                  {selected ? '❯ ' : '  '}
                </Text>
                
                <Box width={15}>
                  <PipelineStatusBadge status={p.status} />
                </Box>
                
                <Box width={45}>
                  <Text bold={selected} color={selected ? 'white' : 'gray'}>
                    {req}
                  </Text>
                </Box>
                
                <Text dimColor>
                  {p.llm_provider}
                </Text>
              </Box>
            )
          })
        )}
      </Box>
      
      {pipelines.length > maxVisible && (
        <Box marginTop={1}>
          <Text dimColor>
            Showing {startIdx + 1}-{Math.min(startIdx + maxVisible, pipelines.length)} of {pipelines.length}
          </Text>
        </Box>
      )}
    </Box>
  )
}

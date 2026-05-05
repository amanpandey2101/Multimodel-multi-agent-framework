// PipelineStages — visual pipeline stage flow, mirrors claude-source's
// agent progress components: typed props, functional, Box/Text layout.
import React from 'react'
import { Box, Text } from 'ink'
import type { PipelineStage, PipelineStatus } from '../types'

const STAGE_LABELS: Record<string, string> = {
  requirements:   'Requirements',
  architecture:   'Architecture',
  task_breakdown: 'Tasks',
  implementation: 'Code',
  review:         'Review',
  deployment:     'Deploy',
}

const STATUS_ICON: Record<PipelineStatus, string> = {
  pending:   '○',
  running:   '◉',
  completed: '●',
  failed:    '✕',
  cancelled: '⊘',
}

const STATUS_COLOR: Record<PipelineStatus, string> = {
  pending:   'dim',
  running:   'blue',
  completed: 'green',
  failed:    'red',
  cancelled: 'yellow',
}

type Props = {
  stages: PipelineStage[]
  overallStatus: PipelineStatus
}

export function PipelineStages({ stages, overallStatus }: Props): React.ReactNode {
  const stageMap = new Map(stages.map(s => [s.stage_name, s]))
  const keys = Object.keys(STAGE_LABELS)

  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        <Text bold color="magenta">Pipeline </Text>
        <PipelineStatusBadge status={overallStatus} />
      </Box>
      <Box marginTop={1} flexDirection="row" flexWrap="wrap">
        {keys.map((key, i) => {
          const stage = stageMap.get(key)
          const status: PipelineStatus = stage?.status ?? 'pending'
          const icon = STATUS_ICON[status]
          const col = STATUS_COLOR[status]
          const label = STAGE_LABELS[key] ?? key

          return (
            <Box key={key} flexDirection="row">
              <Text color={col}>{icon} </Text>
              <Text color={status === 'running' ? 'blue' : undefined} dimColor={status === 'pending'}>
                {label}
              </Text>
              {i < keys.length - 1 && <Text dimColor>  →  </Text>}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

type BadgeProps = {
  status: PipelineStatus
}

export function PipelineStatusBadge({ status }: BadgeProps): React.ReactNode {
  const icon = STATUS_ICON[status]
  const col = STATUS_COLOR[status]
  return <Text color={col}>{icon} {status}</Text>
}

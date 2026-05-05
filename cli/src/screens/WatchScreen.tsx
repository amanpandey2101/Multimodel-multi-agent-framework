import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Box, Text, useInput } from 'ink'
import { createClient, type RealtimeChannel } from '@supabase/supabase-js'
import { Spinner } from '../components/Spinner'
import { PipelineStages } from '../components/PipelineStages'
import * as api from '../api'
import type { Pipeline, Screen } from '../types'

type Props = {
  pipelineId: string
  onNavigate: (s: Screen) => void
  onError: (msg: string) => void
}

export function WatchScreen({ pipelineId, onNavigate, onError }: Props): React.ReactNode {
  const [pipeline, setPipeline] = useState<Pipeline | null>(null)
  const [loading, setLoading] = useState(true)
  const [logMessages, setLogMessages] = useState<{ id: string, msg: string, time: string, is_error: boolean }[]>([])
  
  // Keep track of channel to clean up
  const channelRef = useRef<RealtimeChannel | null>(null)

  const loadInitial = useCallback(async () => {
    try {
      const data = await api.getPipeline(pipelineId)
      setPipeline(data)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load pipeline')
    } finally {
      setLoading(false)
    }
  }, [pipelineId, onError])

  useEffect(() => {
    void loadInitial()
    
    // Set up Supabase Realtime
    const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
    const key = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
    
    if (url && key) {
      const supabase = createClient(url, key)
      const channel = supabase.channel(`pipeline_${pipelineId}`)
      
      channel.on('broadcast', { event: 'stage_update' }, (payload) => {
        setPipeline(payload.payload.pipeline as Pipeline)
      })
      
      channel.on('broadcast', { event: 'log' }, (payload) => {
        const log = payload.payload;
        setLogMessages(prev => {
          const newLogs = [...prev, {
            id: Math.random().toString(),
            msg: log.message,
            time: new Date().toLocaleTimeString(),
            is_error: log.level === 'error'
          }]
          // Keep last 10 logs
          if (newLogs.length > 10) return newLogs.slice(newLogs.length - 10)
          return newLogs
        })
      })
      
      channel.subscribe()
      channelRef.current = channel
    } else {
      // Fallback polling if no supabase creds (though should have them in .env)
      const interval = setInterval(() => {
        void loadInitial()
      }, 5000)
      return () => clearInterval(interval)
    }
    
    return () => {
      if (channelRef.current) {
        void channelRef.current.unsubscribe()
      }
    }
  }, [loadInitial, pipelineId])

  useInput((_input, key) => {
    if (key.escape || _input === 'q') {
      if (pipeline) {
        onNavigate({ type: 'pipelines', projectId: pipeline.project_id, projectName: 'Project' })
      } else {
         onNavigate({ type: 'projects' })
      }
    }
    
    if (_input === 'c' && pipeline && (pipeline.status === 'pending' || pipeline.status === 'running')) {
      void api.cancelPipeline(pipelineId)
    }
  })

  if (loading || !pipeline) {
    return (
      <Box paddingX={2} paddingY={1}>
        <Spinner label="Loading pipeline…" />
      </Box>
    )
  }

  const isComplete = pipeline.status === 'completed' || pipeline.status === 'failed' || pipeline.status === 'cancelled'

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text dimColor>Pipeline {pipelineId}</Text>
      
      <PipelineStages stages={pipeline.stages} overallStatus={pipeline.status} />
      
      {/* Logs section */}
      <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} width="100%">
        <Text bold dimColor>Activity Log</Text>
        
        <Box marginTop={1} flexDirection="column" height={10}>
          {logMessages.length === 0 ? (
            <Text dimColor italic>Waiting for logs...</Text>
          ) : (
            logMessages.map(log => (
              <Text key={log.id}>
                <Text dimColor>{log.time} </Text>
                <Text color={log.is_error ? 'red' : undefined}>{log.msg}</Text>
              </Text>
            ))
          )}
        </Box>
      </Box>
      
      <Box marginTop={1}>
        {!isComplete ? (
          <Text dimColor>
            q/Esc: back · c: cancel active runs
          </Text>
        ) : (
          <Text dimColor>
            q/Esc: back (pipeline finished)
          </Text>
        )}
      </Box>
    </Box>
  )
}

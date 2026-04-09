import React, { useState, useCallback } from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import { Spinner } from '../components/Spinner.js'
import * as api from '../api.js'
import type { Screen } from '../types.js'

type Props = {
  projectId: string
  projectName: string
  onNavigate: (s: Screen) => void
  onError: (msg: string) => void
}

type Field = 'requirement' | 'provider' | 'mode'

export function NewPipelineScreen({ projectId, projectName, onNavigate, onError }: Props): React.ReactNode {
  const [requirement, setRequirement] = useState('')
  const [provider, setProvider] = useState('openai')
  const [mode, setMode] = useState<'planning' | 'fast'>('planning')
  
  const [focus, setFocus] = useState<Field>('requirement')
  const [loading, setLoading] = useState(false)

  const submit = useCallback(async () => {
    if (!requirement.trim()) return
    setLoading(true)
    try {
      const pip = await api.createPipeline({
        project_id: projectId,
        requirement,
        llm_provider: provider,
        mode
      })
      onNavigate({ type: 'watch', pipelineId: pip.id })
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Creation failed')
      setLoading(false)
    }
  }, [projectId, requirement, provider, mode, onNavigate, onError])

  useInput((_input, key) => {
    if (loading) return
    if (key.escape) {
      onNavigate({ type: 'pipelines', projectId, projectName })
      return
    }
    
    if (key.tab) {
      setFocus(f => {
        if (f === 'requirement') return 'provider'
        if (f === 'provider') return 'mode'
        return 'requirement'
      })
    }
    
    // Toggle options when focused
    if (focus === 'provider' && (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow)) {
      setProvider(p => p === 'openai' ? 'anthropic' : (p === 'anthropic' ? 'gemini' : 'openai'))
    }
    if (focus === 'mode' && (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow)) {
      setMode(m => m === 'planning' ? 'fast' : 'planning')
    }
    
    if (key.return && focus === 'mode') {
      void submit()
    }
  })

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold>
        <Text color="magenta">{projectName} </Text>
        <Text dimColor>› New Pipeline</Text>
      </Text>
      
      <Box marginTop={1} borderStyle="round" borderColor="magenta" paddingX={2} paddingY={1} width={60} flexDirection="column">
        
        {/* Requirement */ }
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>Requirement</Text>
          <Box borderStyle="single" borderColor={focus === 'requirement' ? 'magenta' : 'gray'} paddingX={1}>
            <TextInput
              value={requirement}
              onChange={setRequirement}
              onSubmit={() => setFocus('provider')}
              focus={focus === 'requirement' && !loading}
              placeholder="e.g. Build a snake game in React"
            />
          </Box>
        </Box>
        
        {/* Provider */ }
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>LLM Provider (Arrow keys to change)</Text>
          <Box borderStyle="single" borderColor={focus === 'provider' ? 'magenta' : 'gray'} paddingX={1}>
            <Text color={focus === 'provider' ? 'white' : 'gray'}>
              {provider === 'openai' ? '◉ OpenAI' : '○ OpenAI'}  {' '}
              {provider === 'anthropic' ? '◉ Anthropic' : '○ Anthropic'}  {' '}
              {provider === 'gemini' ? '◉ Gemini' : '○ Gemini'}
            </Text>
          </Box>
        </Box>
        
        {/* Mode */ }
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>Mode (Arrow keys to change)</Text>
          <Box borderStyle="single" borderColor={focus === 'mode' ? 'magenta' : 'gray'} paddingX={1}>
            <Text color={focus === 'mode' ? 'white' : 'gray'}>
              {mode === 'planning' ? '◉ Planning (Interactive)' : '○ Planning (Interactive)'}  {' '}
              {mode === 'fast' ? '◉ Fast (Autonomous)' : '○ Fast (Autonomous)'}
            </Text>
          </Box>
        </Box>
        
        <Box marginTop={1}>
          {loading 
            ? <Spinner label="Starting pipeline…" />
            : <Text dimColor>Tab: next field · Enter in Mode: submit · Esc: cancel</Text>
          }
        </Box>
      </Box>
    </Box>
  )
}

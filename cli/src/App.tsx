import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import { LoginScreen } from './screens/LoginScreen'
import { ProjectsScreen } from './screens/ProjectsScreen'
import { PipelinesScreen } from './screens/PipelinesScreen'
import { NewPipelineScreen } from './screens/NewPipelineScreen'
import { WatchScreen } from './screens/WatchScreen'
import { ChatScreen } from './screens/ChatScreen'
import { StatusLine } from './components/StatusLine'
import * as api from './api'
import type { Screen } from './types'

export function App(): React.ReactNode {
  const [screen, setScreen] = useState<Screen>({ type: 'splash' })
  const [userEmail, setUserEmail] = useState<string>()
  const [error, setError] = useState<string | null>(null)

  // Auto-login if EMAIL/PASSWORD exist in env, else show login
  useEffect(() => {
    const autoLogin = async () => {
      const e = process.env['MULTI_AGENT_EMAIL']
      const p = process.env['MULTI_AGENT_PASSWORD']
      if (e && p) {
        try {
          await api.login(e, p)
          setUserEmail(e)
          setScreen({ type: 'projects' })
        } catch (err) {
          setScreen({ type: 'login' })
          setError(`Auto-login failed: ${err instanceof Error ? err.message : String(err)}`)
        }
      } else {
        setScreen({ type: 'login' })
      }
    }
    
    // Check backend health before we try logging in
    void api.checkHealth().then(ok => {
      if (!ok) {
        setError("Cannot reach backend server. Some features may be disabled.")
        setScreen({ type: 'login' })
      } else {
        void autoLogin()
      }
    })
  }, [])

  const handleNavigate = (s: Screen) => {
    setError(null)
    setScreen(s)
  }

  const renderScreen = () => {
    switch (screen.type) {
      case 'splash':
        return (
          <Box paddingX={2} paddingY={1}>
            <Text>Loading AgentiX Platform...</Text>
          </Box>
        )
      case 'login':
        return (
          <LoginScreen
            onSuccess={email => {
              setUserEmail(email)
              setError(null)
              setScreen({ type: 'projects' })
            }}
            onChat={() => handleNavigate({ type: 'chat' })}
            onError={setError}
          />
        )
      case 'projects':
        return <ProjectsScreen onNavigate={handleNavigate} onError={setError} />
      case 'pipelines':
        return <PipelinesScreen projectId={screen.projectId} projectName={screen.projectName} onNavigate={handleNavigate} onError={setError} />
      case 'new-pipeline':
        return <NewPipelineScreen projectId={screen.projectId} projectName={screen.projectName} onNavigate={handleNavigate} onError={setError} />
      case 'watch':
        return <WatchScreen pipelineId={screen.pipelineId} onNavigate={handleNavigate} onError={setError} />
      case 'chat':
        return <ChatScreen onNavigate={handleNavigate} />
      case 'help':
        return (
          <Box flexDirection="column" paddingX={2} paddingY={1}>
            <Text bold color="magenta">AgentiX Platform CLI</Text>
            <Text dimColor>Version 1.0.0</Text>
            <Box marginTop={1} flexDirection="column">
              <Text>The CLI allows you to start and monitor engineering pipelines.</Text>
              <Text>Most commands use standard VIM bindings (j/k) or Arrow Keys.</Text>
            </Box>
            <Box marginTop={1}>
              <Text dimColor>Esc to go back</Text>
            </Box>
          </Box>
        )
    }
  }

  return (
    <Box flexDirection="column" minHeight={15}>
      {/* Main Content Area */ }
      <Box flexGrow={1}>
        {renderScreen()}
      </Box>

      {/* Bottom Status Bar */ }
      <StatusLine screen={screen} userEmail={userEmail} error={error} />
    </Box>
  )
}

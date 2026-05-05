import React from 'react'
import { render } from 'ink'
import { App } from './App'

// Simple entry point — clear screen and render App
console.clear()
const { waitUntilExit } = render(<App />)

waitUntilExit().catch(console.error)

import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './auth/AuthProvider.jsx'
import LoginGate from './auth/LoginGate.jsx'
import { GraphProvider } from './widgets/graph/GraphContext.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <LoginGate>
      <GraphProvider>
        <App />
      </GraphProvider>
    </LoginGate>
  </AuthProvider>,
)

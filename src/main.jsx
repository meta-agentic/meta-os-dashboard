import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './auth/AuthProvider.jsx'
import LoginGate from './auth/LoginGate.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <LoginGate>
      <App />
    </LoginGate>
  </AuthProvider>,
)

import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../layouts/AppShell'
import { CommandCenter } from '../pages/CommandCenter'
import { DecisionDetail } from '../pages/DecisionDetail'
import { Incident } from '../pages/Incident'
import { WhatIf } from '../pages/WhatIf'

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/command" replace />} />
        <Route path="/command" element={<CommandCenter />} />
        <Route path="/decisions" element={<DecisionDetail />} />
        <Route path="/decisions/:decisionId" element={<DecisionDetail />} />
        <Route path="/incident" element={<Incident />} />
        <Route path="/what-if" element={<WhatIf />} />
        <Route path="*" element={<Navigate to="/command" replace />} />
      </Routes>
    </AppShell>
  )
}

import type { ReactNode } from 'react'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">D</span>
          <div>
            <div className="brand-name">DHRUV</div>
            <div className="brand-subtitle">Polar Operations</div>
          </div>
        </div>
        <div className="topbar-meta">
          <span>SEASON 48</span>
          <span className="topbar-divider" />
          <span className="status-dot" />
          <span>LOCAL</span>
        </div>
      </header>
      <main className="main-content">{children}</main>
      <footer className="comms-strip">
        <span>Communications</span>
        <span className="comms-state">Link available</span>
        <span className="comms-time">Demo clock: 09:15</span>
      </footer>
    </div>
  )
}

import type { ReactNode } from 'react'
import { Command, Bell, AlertTriangle, SlidersHorizontal, Radio, Settings2, Menu } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useState } from 'react'

const navItems = [
  { label: 'COMMAND', path: '/command', icon: Command },
  { label: 'DECISIONS', path: '/decisions/DEC-0481', icon: Bell, count: 2 },
  { label: 'INCIDENT', path: '/incident', icon: AlertTriangle },
  { label: 'WHAT-IF', path: '/what-if', icon: SlidersHorizontal },
]

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileNav, setMobileNav] = useState(false)

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">D</div>
          <div><strong>DHRUV</strong><span>POLAR OPERATIONS</span></div>
        </div>
        <div className="top-context">
          <span className="season">SEASON 48</span>
          <span className="top-separator" />
          <Radio size={15} />
          <span className="online-text">ONLINE</span>
          <button className="icon-button mobile-menu" onClick={() => setMobileNav(v => !v)} aria-label="Toggle navigation"><Menu size={19} /></button>
        </div>
      </header>

      <div className="workbench">
        <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
          <nav>
            <p className="nav-label">OPERATIONS</p>
            {navItems.map(({ label, path, icon: Icon, count }) => (
              <NavLink key={label} to={path} onClick={() => setMobileNav(false)} className={({ isActive }) => `nav-item ${isActive ? 'nav-active' : ''}`}>
                <Icon size={16} /><span>{label}</span>{count && <b>{count}</b>}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="sync-box">
              <div className="sync-heading"><Radio size={14} /> LINK STATUS</div>
              <strong>ONLINE</strong>
              <span>LOCAL STATE · SYNCED</span>
              <div className="sync-line"><i /></div>
              <span className="muted">Last sync <b className="mono">09:12</b></span>
            </div>
            <button className="nav-item"><Settings2 size={16} /><span>SYSTEM CONFIG</span></button>
          </div>
        </aside>
        <main className="content">{children}</main>
      </div>

      <footer className="comms-strip">
        <span className="comms-title"><Radio size={13} /> COMMUNICATIONS</span>
        <span className="comms-state"><i /> LINK AVAILABLE</span>
        <span className="comms-clock mono">DEMO CLOCK 09:15</span>
        <span className="comms-right">PENDING EVENTS <b className="mono">3</b> <span className="top-separator" /> LOCAL EVENTS <b className="mono">12</b></span>
      </footer>
    </div>
  )
}

import { useState } from 'react'
import {
  AlertTriangle,
  ChevronRight,
  Clock3,
  Database,
  Fuel,
  Info,
  MapPin,
  Users,
} from 'lucide-react'
import { decisions, events, type Status } from '../data/demo'

function Badge({
  children,
  tone = 'slate',
}: {
  children: React.ReactNode
  tone?: 'red' | 'amber' | 'green' | 'blue' | 'slate'
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

function SectionTitle({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string
  title: string
  action?: string
}) {
  return (
    <div className="section-title">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>

      {action && (
        <button className="text-action">
          {action}
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  )
}

function Station({
  name,
  status,
  resource,
  days,
  window,
  freshness,
  incident,
}: {
  name: string
  status: Status
  resource: string
  days: string
  window: string
  freshness: string
  incident: string
}) {
  const risk = status === 'AT RISK'

  return (
    <article className="station-row">
      <div className="station-name">
        <span
          className={`status-mark ${
            risk ? 'mark-amber' : 'mark-green'
          }`}
        />

        <div>
          <strong>{name}</strong>
          <span className="muted mono">POLAR NODE</span>
        </div>
      </div>

      <div>
        <span className="label">READINESS</span>
        <Badge tone={risk ? 'amber' : 'green'}>{status}</Badge>
      </div>

      <div>
        <span className="label">CRITICAL RESOURCE</span>
        <strong className="resource">
          <Fuel size={14} />
          {resource}
        </strong>
      </div>

      <div>
        <span className="label">REMAINING</span>
        <strong className="mono value">{days}</strong>
        <span className="muted"> days</span>
      </div>

      <div>
        <span className="label">NEXT WINDOW</span>
        <strong className="mono">{window}</strong>
      </div>

      <div>
        <span className="label">FRESHNESS</span>
        <span
          className={`freshness ${
            risk ? 'fresh-amber' : 'fresh-green'
          }`}
        >
          {freshness}
        </span>
      </div>

      <div className="station-incident">
        <span className="label">INCIDENTS</span>
        <span className="muted">{incident}</span>
      </div>
    </article>
  )
}

function Schematic() {
  return (
    <div
      className="schematic"
      aria-label="Operational network schematic"
    >
      <div className="map-grid" />

      <svg
        className="network-lines"
        viewBox="0 0 600 290"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {/* Goa HQ → Maitri → Bharati */}
        <path
          className="route route-primary"
          d="M70 226 C170 188 228 144 296 108 S422 74 520 54"
        />

        {/* Goa HQ → Bharati */}
        <path
          className="route"
          d="M70 226 C180 244 222 240 300 212 S420 158 520 54"
        />

        {/* Maitri → Field Team */}
        <path
          className="route route-alert"
          d="M296 108 C325 142 358 169 405 180"
        />
      </svg>

      <div className="node node-goa">
        <MapPin size={15} />
        <span>GOA HQ</span>
        <small>ORIGIN</small>
      </div>

      <div className="node node-maitri node-alert">
        <span className="node-pulse" />
        <MapPin size={15} />
        <span>MAITRI</span>
        <small>AT RISK · FUEL</small>
      </div>

      <div className="node node-bharati">
        <MapPin size={15} />
        <span>BHARATI</span>
        <small>STABLE</small>
      </div>

      <div className="node node-ft">
        <Users size={15} />
        <span>FT-3</span>
        <small>FIELD TEAM</small>
      </div>

      <div className="map-legend">
        <span>
          <i className="legend-dot dot-online" />
          LINK AVAILABLE
        </span>

        <span>
          <i className="legend-dot dot-alert" />
          OPERATIONAL ALERT
        </span>
      </div>
    </div>
  )
}

export function CommandCenter() {
  const [selectedDecision, setSelectedDecision] = useState(0)
  const [clock, setClock] = useState('09:15')

  const advanceClock = (amount: number) => {
    setClock(
      amount === 1
        ? '10:15'
        : amount === 6
          ? '15:15'
          : '15 NOV · 15:15',
    )
  }

  return (
    <>
      {/* PAGE HEADER */}
      <div className="page-header">
        <div>
          <p className="eyebrow">OPERATIONAL OVERVIEW / S48</p>

          <h1>Command center</h1>

          <p className="page-subtitle">
            Expedition readiness · Antarctic sector / Indian research
            programme
          </p>
        </div>

        <div className="header-meta">
          <span className="label">NEXT REACHABLE RESUPPLY</span>

          <strong className="mono">20 NOV 2027</strong>

          <span className="muted">
            Window confidence{' '}
            <b className="confidence">82%</b>
          </span>
        </div>
      </div>

      {/* ACTION REQUIRED */}
      <div className="alert-banner">
        <AlertTriangle size={18} />

        <div>
          <strong>1 ACTION REQUIRED</strong>

          <span>
            Maitri fuel reserve crosses the safe margin before the
            next reachable resupply window.
          </span>
        </div>

        <button onClick={() => setSelectedDecision(0)}>
          REVIEW DECISION
          <ChevronRight size={15} />
        </button>
      </div>

      {/* MAIN DASHBOARD */}
      <div className="dashboard-grid">
        {/* DECISION QUEUE */}
        <section className="panel queue-panel">
          <SectionTitle
            eyebrow="OPERATOR ATTENTION"
            title="Decision queue"
            action="VIEW ALL"
          />

          {decisions.map((item, index) => (
            <button
              className={`decision-card ${
                selectedDecision === index
                  ? 'decision-selected'
                  : ''
              }`}
              key={item.id}
              onClick={() => setSelectedDecision(index)}
            >
              <div className="decision-card-top">
                <Badge
                  tone={
                    item.status === 'AT RISK'
                      ? 'amber'
                      : 'green'
                  }
                >
                  {item.status}
                </Badge>

                <span className="mono muted">{item.id}</span>
              </div>

              <div className="decision-station">
                <strong>{item.station}</strong>
                <span>·</span>
                <span>{item.resource}</span>
              </div>

              <p>{item.consequence}</p>

              <div className="decision-meta">
                <span>
                  <Clock3 size={13} />
                  ACT BY <b>{item.act}</b>
                </span>

                <span
                  className={`freshness ${
                    index === 0
                      ? 'fresh-amber'
                      : 'fresh-green'
                  }`}
                >
                  {item.freshness}
                </span>
              </div>

              <span className="review-link">
                REVIEW DECISION
                <ChevronRight size={14} />
              </span>
            </button>
          ))}
        </section>

        {/* STATION OVERVIEW */}
        <section className="panel overview-panel">
          <SectionTitle
            eyebrow="NETWORK STATUS"
            title="Station overview"
            action="SCHEMATIC"
          />

          <div className="station-list">
            <Station
              name="MAITRI"
              status="AT RISK"
              resource="FUEL"
              days="8.4"
              window="20 NOV 2027"
              freshness="AGING · 14h"
              incident="1 active"
            />

            <Station
              name="BHARATI"
              status="STABLE"
              resource="CARGO"
              days="18.2"
              window="20 NOV 2027"
              freshness="FRESH · 2h"
              incident="None"
            />
          </div>

          <Schematic />
        </section>

        {/* EVENT STREAM */}
        <section className="panel timeline-panel">
          <SectionTitle
            eyebrow="EVENT STREAM"
            title="Latest events"
            action="OPEN LOG"
          />

          {events.map(
            ([time, type, source, detail]) => (
              <div
                className="event-item"
                key={time}
              >
                <span className="event-time mono">
                  {time}
                </span>

                <span className="event-dot" />

                <div>
                  <strong>{type}</strong>

                  <span className="muted">
                    {source} · {detail}
                  </span>
                </div>
              </div>
            ),
          )}

          <div className="timeline-footer">
            <Database size={14} />

            LOCAL EVENT LOG

            <span className="mono">
              12 EVENTS
            </span>
          </div>
        </section>
      </div>

      {/* DEMO CLOCK */}
      <div className="bottom-strip">
        <div>
          <span className="label">DEMO CLOCK</span>

          <strong className="mono clock">
            {clock}
          </strong>
        </div>

        <div className="clock-controls">
          <button
            onClick={() => advanceClock(1)}
          >
            +1H
          </button>

          <button
            onClick={() => advanceClock(6)}
          >
            +6H
          </button>

          <button
            onClick={() => advanceClock(30)}
          >
            +30H
          </button>

          <button
            onClick={() => setClock('09:15')}
          >
            RESET
          </button>
        </div>

        <div className="strip-note">
          <Info size={14} />
          DEMO DATA · ENGINE OUTPUT SIMULATED
        </div>
      </div>
    </>
  )
}
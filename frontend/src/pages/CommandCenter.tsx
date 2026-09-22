export function CommandCenter() {
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">COMMAND CENTER</p>
          <h1>Expedition readiness</h1>
        </div>
        <div className="page-heading-meta">Next resupply window: 20 Nov 2027</div>
      </div>

      <div className="placeholder-grid">
        <section className="panel decision-panel">
          <div className="panel-header">
            <h2>Decision queue</h2>
            <span className="panel-count">0</span>
          </div>
          <p className="muted">Engine output will appear here.</p>
        </section>

        <section className="panel station-panel">
          <div className="panel-header">
            <h2>Stations</h2>
          </div>
          <div className="station-placeholder">
            <div>
              <strong>Maitri</strong>
              <span>Awaiting evaluation</span>
            </div>
            <div>
              <strong>Bharati</strong>
              <span>Awaiting evaluation</span>
            </div>
          </div>
        </section>

        <section className="panel side-panel">
          <div className="panel-header">
            <h2>Timeline</h2>
          </div>
          <p className="muted">Event stream will appear here.</p>
        </section>
      </div>
    </section>
  )
}

export default function AdminLoading() {
  return (
    <section
      className="skad-route-loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="skad-loading-track">
        <span />
      </div>

      <div className="skad-loading-heading">
        <div className="skad-loading-title" />
        <div className="skad-loading-subtitle" />
      </div>

      <div className="skad-loading-grid" aria-hidden="true">
        {[0, 1, 2, 3].map(item => (
          <div className="skad-loading-card" key={item}>
            <span />
            <strong />
          </div>
        ))}
      </div>

      <div className="skad-loading-content" aria-hidden="true">
        {[0, 1, 2, 3, 4].map(item => (
          <div className="skad-loading-row" key={item} />
        ))}
      </div>

      <p className="skad-loading-label">
        Loading workspace…
      </p>
    </section>
  );
}

export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="stat-grid" style={{ marginBottom: "1.5rem" }}>
        {[0, 1, 2].map((i) => (
          <div className="stat skeleton-block" key={i} style={{ height: "72px" }} />
        ))}
      </div>
      <div className="card">
        <div className="skeleton-line" style={{ width: "40%", height: "1.1rem" }} />
        <div className="skeleton-line" style={{ width: "90%" }} />
        <div className="skeleton-line" style={{ width: "75%" }} />
        <div className="skeleton-line" style={{ width: "82%" }} />
      </div>
    </div>
  );
}

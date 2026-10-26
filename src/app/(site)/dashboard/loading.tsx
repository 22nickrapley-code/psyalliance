// A quiet placeholder in the page's own shape while the next screen loads,
// so navigation never shows an empty main area.
export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-live="polite" aria-label="Loading">
      <div className="skeleton" style={{ width: 120, height: 12, marginBottom: 14 }} />
      <div className="skeleton" style={{ width: "min(520px, 80%)", height: 42, marginBottom: 12 }} />
      <div className="skeleton" style={{ width: "min(420px, 65%)", height: 14, marginBottom: 34 }} />
      <div className="split">
        <div className="card">
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ display: "flex", gap: 14, alignItems: "center", padding: "14px 0", borderTop: i ? "1px solid #e6ebe5" : 0 }}>
              <div className="skeleton" style={{ width: 38, height: 38, borderRadius: "50%", flex: "0 0 38px" }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ width: "60%", height: 13, marginBottom: 8 }} />
                <div className="skeleton" style={{ width: "40%", height: 11 }} />
              </div>
            </div>
          ))}
        </div>
        <div className="card tint">
          <div className="skeleton" style={{ width: "50%", height: 16, marginBottom: 16 }} />
          <div className="skeleton" style={{ width: "100%", height: 11, marginBottom: 10 }} />
          <div className="skeleton" style={{ width: "85%", height: 11, marginBottom: 10 }} />
          <div className="skeleton" style={{ width: "70%", height: 11 }} />
        </div>
      </div>
    </div>
  );
}

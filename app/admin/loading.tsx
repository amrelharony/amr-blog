// Admin route loading skeleton (also provides the page-level Suspense
// boundary that useSearchParams relies on in /admin/write).
export default function AdminLoading() {
  return (
    <div aria-busy="true">
      <div className="adm-h" style={{ opacity: 0.5 }}>
        Loading…
      </div>
      <div className="adm-grid" style={{ marginTop: 16 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="adm-stat" style={{ opacity: 0.4 }}>
            <div className="adm-stat-num">···</div>
            <div className="adm-stat-label">loading</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Segment-level fallback for /admin: enables partial prefetching of the
// dynamic dashboard (layout + this shell) so tab switches feel instant, and
// covers any admin child segment without its own loading.tsx.
export default function AdminLoading() {
  return (
    <div aria-busy="true">
      <div className="adm-skel" style={{ height: 24, width: 180, marginBottom: 8 }} />
      <div className="adm-skel" style={{ height: 12, width: 280, marginBottom: 20 }} />
      <div className="adm-grid" style={{ marginBottom: 20 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="adm-skel" style={{ height: 92 }} />
        ))}
      </div>
      <div className="adm-skel" style={{ height: 220 }} />
    </div>
  );
}

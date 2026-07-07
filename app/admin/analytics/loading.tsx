// Mirrors the analytics page layout (headline stats, then stacked cards) so
// the skeleton→content swap doesn't jump.
export default function AnalyticsLoading() {
  return (
    <div aria-busy="true">
      <div className="adm-skel" style={{ height: 24, width: 160, marginBottom: 8 }} />
      <div className="adm-skel" style={{ height: 12, width: 300, marginBottom: 20 }} />
      <div className="adm-grid" style={{ marginBottom: 20 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="adm-skel" style={{ height: 92 }} />
        ))}
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="adm-skel" style={{ height: 160, marginBottom: 16 }} />
      ))}
    </div>
  );
}

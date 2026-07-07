// Mirrors the activity page layout (filter card, then list rows) so the
// skeleton→content swap doesn't jump.
export default function ActivityLoading() {
  return (
    <div aria-busy="true">
      <div className="adm-skel" style={{ height: 24, width: 140, marginBottom: 8 }} />
      <div className="adm-skel" style={{ height: 12, width: 320, marginBottom: 20 }} />
      <div className="adm-skel" style={{ height: 140, marginBottom: 16 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
          <div key={i} className="adm-skel" style={{ height: 46 }} />
        ))}
      </div>
    </div>
  );
}

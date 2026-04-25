// Call Queue Rail — vertical strip of waiting customers visible to the agent
const QueueRail = ({ queue, onToggle }) => {
  const sorted = [...queue].sort((a, b) => b.waitTime - a.waitTime);
  const longestWait = sorted[0]?.waitTime || 0;
  const avgWait = Math.round(queue.reduce((a, q) => a + q.waitTime, 0) / Math.max(queue.length, 1));

  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2,"0")}`;
  };

  const priorityMeta = {
    vip:    { color: "var(--ai-glow)", label: "VIP",   bg: "var(--ai-glow-soft)", border: "var(--ai-glow-edge)" },
    high:   { color: "var(--warning)", label: "Muhim", bg: "rgba(245, 158, 11, 0.10)", border: "rgba(245, 158, 11, 0.32)" },
    normal: { color: "var(--text-muted)", label: "Oddiy", bg: "var(--surface-2)", border: "var(--border-subtle)" },
  };

  const waitTone = (s) => s > 120 ? "danger" : s > 60 ? "warning" : "neutral";

  return (
    <aside style={{
      width: 280, flexShrink: 0,
      background: "var(--surface-1)",
      borderLeft: "1px solid var(--border-subtle)",
      display: "flex", flexDirection: "column",
      maxHeight: "100%", overflow: "hidden",
    }}>
      <div style={{
        padding: "14px 16px",
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="users" size={15} style={{ color: "var(--text-secondary)" }}/>
          <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Navbat</h2>
          <Badge tone="blue" size="sm">{queue.length}</Badge>
        </div>
        {onToggle && (
          <button onClick={onToggle} title="Yopish" style={{
            background: "transparent", border: "none", color: "var(--text-muted)",
            cursor: "pointer", padding: 2, display: "inline-flex",
          }}>
            <Icon name="chevron-right" size={14}/>
          </button>
        )}
      </div>

      <div style={{
        padding: "10px 16px",
        background: "var(--surface-2)",
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex", gap: 14, alignItems: "center",
      }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Eng uzun</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600, color: longestWait > 120 ? "var(--danger)" : "var(--text-primary)" }}>
            {fmt(longestWait)}
          </div>
        </div>
        <div style={{ width: 1, height: 22, background: "var(--border-default)" }}/>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>O'rtacha</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
            {fmt(avgWait)}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
        {sorted.map((q, i) => {
          const p = priorityMeta[q.priority] || priorityMeta.normal;
          const tone = waitTone(q.waitTime);
          const waitColor = tone === "danger" ? "var(--danger)" : tone === "warning" ? "var(--warning)" : "var(--text-secondary)";
          const isNext = i === 0;
          return (
            <div key={q.id} style={{
              padding: 10, marginBottom: 8, marginTop: isNext ? 8 : 0,
              background: isNext ? p.bg : "var(--surface-1)",
              border: `1px solid ${isNext ? p.border : "var(--border-subtle)"}`,
              borderRadius: "var(--r-md)",
              position: "relative",
            }}>
              {isNext && (
                <div style={{
                  position: "absolute", top: -7, left: 8,
                  padding: "1px 8px",
                  background: "var(--sqb-blue-600)", color: "white",
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                  borderRadius: 99, textTransform: "uppercase",
                }}>Keyingi</div>
              )}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                <div style={{
                  width: 6, height: 6, borderRadius: 99, background: p.color,
                  marginTop: 6, flexShrink: 0,
                }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                    {q.maskedPhone}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 1 }}>
                    {q.region} · {p.label}
                  </div>
                </div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 4,
                  fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
                  color: waitColor,
                }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: 99, background: waitColor,
                    animation: tone !== "neutral" ? "pulse 1.6s ease-in-out infinite" : "none",
                  }}/>
                  {fmt(q.waitTime)}
                </div>
              </div>
            </div>
          );
        })}
        {queue.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
            Navbat bo'sh
          </div>
        )}
      </div>
    </aside>
  );
};

window.QueueRail = QueueRail;

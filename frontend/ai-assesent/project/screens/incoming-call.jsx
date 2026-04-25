// IncomingCall — accept / skip-with-reason screen shown right when a call arrives.
// Operator sees masked customer info + an AI-suggested topic, then either accepts
// (proceed to dashboard) or skips with a reason (loops back to queue).

const IncomingCall = ({ onAccept, onSkip }) => {
  const queue = window.CALL_QUEUE || [];
  const reasons = window.SKIP_REASONS || [];
  const incoming = queue[0] || {
    maskedPhone: "+998 90 ••• 23 45", region: "Toshkent",
    waitTime: 12, topic: "Premium Plus karta", priority: "vip",
  };

  const [skipOpen, setSkipOpen] = React.useState(false);
  const [chosen, setChosen] = React.useState(null);
  const [note, setNote] = React.useState("");

  const priColor = incoming.priority === "vip"
    ? "var(--sqb-blue-600)"
    : incoming.priority === "high" ? "var(--warning)" : "var(--text-secondary)";

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, position: "relative",
    }}>
      {/* Soft AI glow backdrop */}
      <div style={{
        position: "absolute", inset: -40, pointerEvents: "none",
        background: "radial-gradient(circle at 50% 30%, var(--ai-glow-soft), transparent 55%)",
      }}/>

      <div style={{
        position: "relative", width: "100%", maxWidth: 520,
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--r-xl)",
        boxShadow: "var(--shadow-modal)",
        overflow: "hidden",
        animation: "slide-in-top 320ms var(--ease-spring) both",
      }}>
        {/* Header — incoming pulse */}
        <div style={{
          padding: "20px 24px 18px",
          background: "linear-gradient(135deg, var(--sqb-blue-700), var(--sqb-blue-500))",
          color: "white", position: "relative",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              width: 10, height: 10, borderRadius: "50%",
              background: "var(--success)",
              animation: "pulse-soft 1.4s ease-in-out infinite",
              display: "inline-block",
            }}/>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.85 }}>
              Yangi qo'ng'iroq · {incoming.waitTime}s navbatda
            </div>
            <div style={{ flex: 1 }}/>
            <Badge tone="blue" size="sm" style={{ background: "rgba(255,255,255,0.16)", color: "white" }}>
              {incoming.priority === "vip" ? "VIP" : incoming.priority === "high" ? "Yuqori" : "Oddiy"}
            </Badge>
          </div>
          <h1 style={{ margin: "10px 0 0", fontSize: 26, fontWeight: 600, letterSpacing: "-0.01em" }}>
            {incoming.maskedPhone}
          </h1>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>
            {incoming.region}
          </div>
        </div>

        {/* Last contact */}
        <div style={{ padding: "14px 24px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: "var(--r-md)",
            background: "var(--surface-2)", border: "1px solid var(--border-subtle)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            color: "var(--text-secondary)",
          }}>
            <Icon name="phone" size={14}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Oxirgi qo'ng'iroq
            </div>
            <div style={{ fontSize: 14, fontWeight: 550, color: "var(--text-primary)", marginTop: 2 }}>
              14 kun oldin · 03:42
            </div>
          </div>
        </div>

        {/* Actions */}
        {!skipOpen ? (
          <div style={{ padding: 20, display: "flex", gap: 10 }}>
            <button onClick={() => setSkipOpen(true)} style={{
              flex: "0 0 auto", padding: "12px 18px",
              background: "transparent", color: "var(--text-secondary)",
              border: "1px solid var(--border-default)", borderRadius: "var(--r-md)",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 8,
            }}>
              <Icon name="x" size={14}/>
              O'tkazib yuborish
            </button>
            <button onClick={onAccept} style={{
              flex: 1, padding: "12px 18px",
              background: "var(--success)", color: "white",
              border: "none", borderRadius: "var(--r-md)",
              fontSize: 14, fontWeight: 600, cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: "0 4px 16px rgba(34, 197, 94, 0.32)",
              animation: "pulse-soft 1.6s ease-in-out infinite",
            }}>
              <Icon name="phone" size={15}/>
              Qabul qilish
            </button>
          </div>
        ) : (
          <div style={{ padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10 }}>
              O'tkazib yuborish sababi
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {reasons.map(r => (
                <button key={r} onClick={() => setChosen(r)} style={{
                  textAlign: "left", padding: "10px 12px",
                  background: chosen === r ? "var(--sqb-blue-50)" : "var(--surface-2)",
                  border: `1px solid ${chosen === r ? "var(--sqb-blue-500)" : "var(--border-subtle)"}`,
                  borderRadius: "var(--r-md)",
                  fontSize: 13, color: "var(--text-primary)", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <span style={{
                    width: 14, height: 14, borderRadius: "50%",
                    border: `2px solid ${chosen === r ? "var(--sqb-blue-600)" : "var(--border-default)"}`,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {chosen === r && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--sqb-blue-600)" }}/>}
                  </span>
                  {r}
                </button>
              ))}
            </div>
            <textarea value={note} onChange={e => setNote(e.target.value)}
              placeholder="Qo'shimcha izoh (ixtiyoriy)…"
              style={{
                width: "100%", marginTop: 10, padding: "10px 12px",
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)", borderRadius: "var(--r-md)",
                fontSize: 13, color: "var(--text-primary)", fontFamily: "inherit",
                resize: "none", minHeight: 64, outline: "none",
              }}/>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={() => { setSkipOpen(false); setChosen(null); setNote(""); }} style={{
                flex: "0 0 auto", padding: "10px 14px",
                background: "transparent", color: "var(--text-secondary)",
                border: "1px solid var(--border-default)", borderRadius: "var(--r-md)",
                fontSize: 13, fontWeight: 550, cursor: "pointer",
              }}>
                Orqaga
              </button>
              <button disabled={!chosen} onClick={() => onSkip && onSkip({ reason: chosen, note })} style={{
                flex: 1, padding: "10px 14px",
                background: chosen ? "var(--sqb-blue-600)" : "var(--surface-3)",
                color: chosen ? "white" : "var(--text-muted)",
                border: "none", borderRadius: "var(--r-md)",
                fontSize: 13, fontWeight: 600, cursor: chosen ? "pointer" : "not-allowed",
              }}>
                Tasdiqlash va keyingisiga o'tish
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

window.IncomingCall = IncomingCall;

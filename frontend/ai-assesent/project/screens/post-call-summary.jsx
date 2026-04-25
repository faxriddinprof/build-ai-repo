// Post-Call Summary Modal
const PostCallSummary = ({ open, onClose, onNewCall }) => {
  const TL = window.DEMO_TIMELINE;
  const s = TL.summary;
  const [copied, setCopied] = useState(null);

  if (!open) return null;

  const copy = (key, text) => {
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 1200);
  };

  const sections = [
  { key: "natija", label: "Natija", icon: "check", body: s.natija },
  { key: "etiroz", label: "Asosiy e'tirozlar", icon: "alert", body:
    <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
        {s.eтirozlar.map((x, i) => <li key={i} style={{ fontSize: 13.5, lineHeight: 1.5 }}>{x}</li>)}
      </ul>,
    copyText: s.eтirozlar.join("\n• ") },
  { key: "bartaraf", label: "E'tirozlarni bartaraf etish", icon: "sparkles", body: s.eтirozlarBartaraf, ai: true },
  { key: "next", label: "Keyingi qadam", icon: "trending-up", body: s.keyingiQadam }];


  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(10, 22, 40, 0.55)",
      zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20,
      animation: "fade-in 200ms ease-out both", opacity: "0"
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "100%", maxWidth: 720, maxHeight: "92vh",
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--r-xl)",
        boxShadow: "var(--shadow-modal)",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
        animation: "slide-in-top 320ms var(--ease-spring) both"
      }}>
        {/* Hero header with sentiment journey */}
        <div style={{
          padding: "20px 24px",
          background: "linear-gradient(135deg, var(--sqb-blue-700), var(--sqb-blue-500))",
          color: "white", position: "relative", overflow: "hidden"
        }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 90% 0%, var(--ai-glow-soft), transparent 60%)", pointerEvents: "none" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.8 }}>
                Yakuniy hisobot
              </div>
              <h2 style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>
                Qo'ng'iroq yakunlandi
              </h2>
              <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>
                {TL.intakeData.name} · Davomiyligi {s.callDuration}
              </div>
            </div>
            <button onClick={onClose} style={{
              background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)",
              color: "white", borderRadius: "var(--r-md)", padding: 8,
              cursor: "pointer", display: "inline-flex"
            }}>
              <Icon name="x" size={16} />
            </button>
          </div>

          {/* Sentiment journey */}
          <div style={{
            marginTop: 16, padding: "10px 14px",
            background: "rgba(255,255,255,0.1)", borderRadius: "var(--r-md)",
            border: "1px solid rgba(255,255,255,0.15)",
            display: "flex", alignItems: "center", gap: 12, position: "relative"
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.85 }}>
              Sentiment yo'li
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
              {s.sentimentJourney.map((sent, i) => {
                const c = sent === "positive" ? "#86EFAC" : sent === "negative" ? "#FCA5A5" : "#FDE68A";
                const lbl = sent === "positive" ? "Ijobiy" : sent === "negative" ? "Salbiy" : "Neytral";
                return (
                  <React.Fragment key={i}>
                    <span style={{
                      padding: "3px 10px", background: "rgba(255,255,255,0.15)",
                      border: `1px solid ${c}`, color: c,
                      borderRadius: 99, fontSize: 11, fontWeight: 600
                    }}>{lbl}</span>
                    {i < s.sentimentJourney.length - 1 && <Icon name="chevron-right" size={12} style={{ opacity: 0.5 }} />}
                  </React.Fragment>);

              })}
            </div>
            <Badge tone="success" size="md">
              <Icon name="check" size={11} />
              <span style={{ marginLeft: 4 }}>Compliance {s.complianceHolati.passed}/{s.complianceHolati.total}</span>
            </Badge>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          {sections.map((sec) =>
          <div key={sec.key} style={{
            border: `1px solid ${sec.ai ? "var(--ai-glow-edge)" : "var(--border-subtle)"}`,
            borderRadius: "var(--r-lg)",
            overflow: "hidden",
            background: sec.ai ? "var(--ai-glow-soft)" : "var(--surface-1)"
          }}>
              <div style={{
              padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between",
              borderBottom: `1px solid ${sec.ai ? "var(--ai-glow-edge)" : "var(--border-subtle)"}`
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon name={sec.icon} size={14} style={{ color: sec.ai ? "var(--ai-glow)" : "var(--text-secondary)" }} />
                  <span style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                  color: sec.ai ? "var(--ai-glow)" : "var(--text-secondary)"
                }}>{sec.label}</span>
                </div>
                <button onClick={() => copy(sec.key, sec.copyText || sec.body)} style={{
                background: "transparent", border: "none", color: "var(--text-muted)",
                fontSize: 11, fontWeight: 550, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 8px",
                borderRadius: 4
              }}>
                  <Icon name={copied === sec.key ? "check" : "copy"} size={12} />
                  {copied === sec.key ? "Olindi" : "Nusxa"}
                </button>
              </div>
              <div style={{ padding: 14, fontSize: 14, lineHeight: 1.55, color: "var(--text-primary)", background: "var(--surface-1)" }}>
                {typeof sec.body === "string" ? sec.body : sec.body}
              </div>
            </div>
          )}
        </div>

        <footer style={{
          padding: "14px 24px", borderTop: "1px solid var(--border-subtle)",
          display: "flex", gap: 10, justifyContent: "flex-end",
          background: "var(--surface-2)"
        }}>
          <Button variant="secondary" onClick={onClose}>Yopish</Button>
          <Button variant="primary" icon="phone" onClick={onNewCall}>Yangi qo'ng'iroq</Button>
        </footer>
      </div>
    </div>);

};

window.PostCallSummary = PostCallSummary;
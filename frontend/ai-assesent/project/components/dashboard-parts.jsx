// Agent Dashboard — composite components
// TranscriptBubble, SuggestionCard, IntakeCard, ComplianceChip

/* ===== Transcript Bubble ===== */
const TranscriptBubble = ({ speaker, text, time, streaming }) => {
  const isOp = speaker === "Operator";
  return (
    <div style={{
      display: "flex",
      justifyContent: isOp ? "flex-end" : "flex-start",
      animation: "slide-in-top 240ms var(--ease-smooth) both",
      marginBottom: 12,
    }}>
      <div style={{ maxWidth: "82%", display: "flex", flexDirection: "column", alignItems: isOp ? "flex-end" : "flex-start", gap: 4 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 11, color: "var(--text-muted)",
          letterSpacing: "0.02em", textTransform: "uppercase", fontWeight: 600,
        }}>
          {!isOp && <span>{speaker}</span>}
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500, opacity: 0.7 }}>{time}</span>
          {isOp && <span>{speaker}</span>}
        </div>
        <div style={{
          padding: "10px 14px",
          borderRadius: isOp ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
          background: isOp ? "var(--transcript-op-bg)" : "var(--transcript-mij-bg)",
          color:      isOp ? "var(--transcript-op-text)" : "var(--transcript-mij-text)",
          fontFamily: "var(--font-mono)",
          fontSize: 13.5,
          lineHeight: 1.55,
          letterSpacing: "-0.005em",
          textWrap: "pretty",
        }}>
          {text}
          {streaming && <span style={{
            display: "inline-block", width: 7, height: 14,
            verticalAlign: "-2px", marginLeft: 3,
            background: isOp ? "rgba(255,255,255,0.85)" : "var(--text-primary)",
            animation: "blink 1s step-start infinite",
          }}/>}
        </div>
      </div>
    </div>
  );
};

/* ===== AI Suggestion Card =====
   variants: empty (listening), streaming, settled */
const SuggestionCard = ({ variant = "settled", trigger, bullets = [], glow, onCopy, age }) => {
  // age in seconds since arrival — drives glow fade
  const isFresh = (age || 0) < 2;

  if (variant === "empty") {
    return (
      <Card variant="default" padding={20} style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 14, minHeight: 200,
        borderStyle: "dashed",
        borderColor: "var(--border-default)",
        background: "var(--surface-2)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 28 }}>
          {[0,1,2,3,4].map(i => (
            <span key={i} style={{
              width: 4, background: "var(--ai-glow)", borderRadius: 2,
              height: "100%",
              opacity: 0.6,
              animation: `equalizer ${0.9 + i * 0.1}s ease-in-out infinite`,
              animationDelay: `${i * 0.12}s`,
            }}/>
          ))}
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 550, color: "var(--text-secondary)" }}>
            AI tinglamoqda…
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
            Tavsiyalar mijoz e'tirozidan keyin paydo bo'ladi
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div style={{
      animation: isFresh ? "slide-in-top 320ms var(--ease-spring) both, ai-glow-fade 2.4s ease-out forwards" : undefined,
    }}>
      <Card variant={isFresh ? "glass" : "default"} padding={0} glow={isFresh} style={{
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "10px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid var(--border-subtle)",
          background: isFresh ? "var(--ai-glow-soft)" : "transparent",
          transition: "background 1.5s ease",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LiveDot color="var(--ai-glow)" size={6}/>
            <span style={{
              fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "var(--ai-glow)",
            }}>AI Tavsiya</span>
          </div>
          {trigger && (
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 11,
              color: "var(--text-secondary)",
              background: "var(--surface-3)",
              padding: "2px 8px", borderRadius: 4,
            }}>«{trigger}»</span>
          )}
        </div>
        {/* Body */}
        <div style={{ padding: "12px 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {bullets.map((b, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "8px 10px",
              background: "var(--surface-2)",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--border-subtle)",
            }}>
              <span style={{
                flexShrink: 0, marginTop: 2,
                width: 18, height: 18, borderRadius: 4,
                background: "var(--sqb-blue-50)",
                color: "var(--sqb-blue-600)",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700,
              }}>{i + 1}</span>
              <span style={{
                flex: 1, fontSize: 13.5, lineHeight: 1.5,
                color: "var(--text-primary)", textWrap: "pretty",
              }}>{b}</span>
              <button onClick={() => onCopy && onCopy(b)} style={{
                background: "transparent", border: "none",
                color: "var(--text-muted)", padding: 4,
                borderRadius: 6, display: "inline-flex",
                cursor: "pointer", flexShrink: 0,
              }}
                title="Nusxa olish"
                onMouseEnter={e => { e.currentTarget.style.color = "var(--sqb-blue-600)"; e.currentTarget.style.background = "var(--sqb-blue-50)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
              >
                <Icon name="copy" size={14}/>
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

/* ===== Intake Confirmation Card (floating glass) ===== */
const IntakeCard = ({ data, onConfirm, onEdit, onDismiss }) => {
  return (
    <div style={{
      animation: "slide-in-top 360ms var(--ease-spring) both",
      width: 360,
      background: "var(--surface-1)",
      border: "1px solid var(--ai-glow-edge)",
      borderRadius: "var(--r-lg)",
      boxShadow: "var(--shadow-ai-glow)",
      overflow: "hidden",
    }}>
        <div style={{
          padding: "10px 14px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid var(--ai-glow-edge)",
          background: "var(--ai-glow-soft)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="sparkles" size={14} style={{ color: "var(--ai-glow)" }}/>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ai-glow)" }}>
              Avtomatik to'ldirildi
            </span>
          </div>
          <button onClick={onDismiss} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 2 }}>
            <Icon name="x" size={14}/>
          </button>
        </div>
        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, background: "var(--surface-1)" }}>
          {[
            { label: "Ism", value: data.name, icon: "user" },
            { label: "Pasport", value: data.passport, icon: "key" },
            { label: "Hudud", value: data.region, icon: "shield" },
          ].map(row => (
            <div key={row.label} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-muted)", minWidth: 80 }}>
                <Icon name={row.icon} size={13}/>
                {row.label}
              </span>
              <span style={{ flex: 1, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 550, color: "var(--text-primary)" }}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
        <div style={{
          padding: "10px 14px",
          borderTop: "1px solid var(--border-subtle)",
          display: "flex", gap: 8,
        }}>
          <Button variant="primary" size="sm" icon="check" onClick={onConfirm} style={{ flex: 1 }}>
            Tasdiqlash
          </Button>
          <Button variant="secondary" size="sm" icon="edit" onClick={onEdit}>
            Tahrirlash
          </Button>
        </div>
    </div>
  );
};

/* ===== Compliance Chip ===== */
const ComplianceChip = ({ status, label, flash }) => {
  // status: "done" | "pending" | "missed"
  const styles = {
    done: {
      bg: "var(--success-bg)", color: "var(--success)", border: "transparent",
      icon: <Icon name="check" size={13}/>,
    },
    pending: {
      bg: "var(--surface-2)", color: "var(--text-secondary)", border: "var(--border-default)",
      icon: <span style={{
        width: 12, height: 12, border: "1.5px solid currentColor",
        borderRadius: 3, display: "inline-block",
      }}/>,
    },
    missed: {
      bg: "var(--danger-bg)", color: "var(--danger)", border: "transparent",
      icon: <Icon name="x" size={13}/>,
    },
  };
  const s = styles[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 7,
      padding: "6px 11px", borderRadius: "var(--r-full)",
      background: s.bg, color: s.color,
      border: `1px solid ${s.border}`,
      fontSize: 12.5, fontWeight: 550,
      whiteSpace: "nowrap",
      transition: "all 320ms var(--ease-smooth)",
      animation: flash ? "pulse-dot 0.8s ease-in-out 3" : undefined,
    }}>
      {s.icon}
      {label}
    </span>
  );
};

/* ===== Mini live waveform (for supervisor cards) ===== */
const MiniWaveform = ({ width = 60, bars = 14, color = "var(--sqb-blue-600)" }) => {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, height: 18, width }}>
      {Array.from({ length: bars }).map((_, i) => (
        <span key={i} style={{
          flex: 1, background: color, borderRadius: 1,
          height: "100%",
          opacity: 0.7,
          animation: `equalizer ${0.7 + (i % 3) * 0.15}s ease-in-out infinite`,
          animationDelay: `${i * 0.06}s`,
          transformOrigin: "center",
        }}/>
      ))}
    </div>
  );
};

Object.assign(window, { TranscriptBubble, SuggestionCard, IntakeCard, ComplianceChip, MiniWaveform });

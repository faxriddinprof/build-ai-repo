// Shared primitives: Logo, Button, Badge, Card, LiveDot, Avatar
const { useState, useEffect, useRef, useMemo, useCallback } = React;

/* ===== SQB Logo lockup =====
   Real SQB brand mark (PNG) + "SQB" wordmark */
const SqbLogo = ({ size = 28, mono = false, color, showWordmark = true }) => {
  const wordmarkColor = color || (mono ? "currentColor" : "var(--text-primary)");
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <img
        src="assets/sqb-logo.png"
        width={size} height={size}
        alt="SQB"
        style={{ display: "block", filter: mono ? "grayscale(1) brightness(0.5)" : "none" }}
      />
      {showWordmark && (
        <span style={{
          fontFamily: "var(--font-sans)",
          fontWeight: 700,
          fontSize: size * 0.6,
          letterSpacing: "0.02em",
          color: wordmarkColor,
        }}>SQB</span>
      )}
    </span>
  );
};

/* ===== Button ===== */
const Button = ({ variant = "primary", size = "md", icon, children, onClick, disabled, style, type = "button", fullWidth }) => {
  const sizes = {
    sm: { padding: "6px 12px", fontSize: 13, height: 32, gap: 6 },
    md: { padding: "9px 16px", fontSize: 14, height: 40, gap: 8 },
    lg: { padding: "12px 22px", fontSize: 15, height: 48, gap: 10 },
  };
  const variants = {
    primary: {
      background: "var(--sqb-blue-600)",
      color: "var(--text-on-blue)",
      border: "1px solid var(--sqb-blue-700)",
      boxShadow: "0 1px 0 rgba(255,255,255,0.1) inset, 0 1px 2px rgba(11,61,145,0.2)",
    },
    secondary: {
      background: "var(--surface-1)",
      color: "var(--text-primary)",
      border: "1px solid var(--border-default)",
      boxShadow: "var(--shadow-card)",
    },
    ghost: {
      background: "transparent",
      color: "var(--text-secondary)",
      border: "1px solid transparent",
    },
    danger: {
      background: "var(--danger)",
      color: "#fff",
      border: "1px solid #B91C1C",
      boxShadow: "0 1px 2px rgba(220,38,38,0.25)",
    },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        ...sizes[size],
        ...variants[variant],
        borderRadius: "var(--r-md)",
        fontWeight: 550,
        opacity: disabled ? 0.5 : 1,
        transition: "transform 120ms var(--ease-smooth), box-shadow 120ms var(--ease-smooth), filter 120ms",
        width: fullWidth ? "100%" : undefined,
        ...style,
      }}
      onMouseDown={e => !disabled && (e.currentTarget.style.transform = "scale(0.98)")}
      onMouseUp={e => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
    >
      {icon && <Icon name={icon} size={size === "sm" ? 14 : 16} />}
      {children}
    </button>
  );
};

/* ===== Live pulsing dot ===== */
const LiveDot = ({ color = "var(--ai-glow)", size = 8 }) => (
  <span style={{
    display: "inline-block",
    width: size,
    height: size,
    borderRadius: "50%",
    background: color,
    boxShadow: `0 0 0 ${size * 0.6}px ${color}33`,
    animation: "pulse-dot 1.4s ease-in-out infinite",
  }}/>
);

/* ===== Badge / Chip ===== */
const Badge = ({ tone = "neutral", icon, children, glow, size = "md" }) => {
  const tones = {
    neutral: { bg: "var(--surface-3)", color: "var(--text-secondary)", border: "var(--border-subtle)" },
    success: { bg: "var(--success-bg)", color: "var(--success)", border: "transparent" },
    warning: { bg: "var(--warning-bg)", color: "var(--warning)", border: "transparent" },
    danger:  { bg: "var(--danger-bg)",  color: "var(--danger)",  border: "transparent" },
    ai:      { bg: "var(--ai-glow-soft)", color: "var(--ai-glow)", border: "var(--ai-glow-edge)" },
    blue:    { bg: "var(--sqb-blue-50)", color: "var(--sqb-blue-700)", border: "var(--sqb-blue-100)" },
  };
  const t = tones[tone];
  const sizes = {
    sm: { fontSize: 11, padding: "3px 8px", gap: 4, height: 22 },
    md: { fontSize: 12, padding: "4px 10px", gap: 5, height: 26 },
    lg: { fontSize: 13, padding: "6px 12px", gap: 6, height: 30 },
  };
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      ...sizes[size],
      background: t.bg,
      color: t.color,
      border: `1px solid ${t.border}`,
      borderRadius: "var(--r-full)",
      fontWeight: 550,
      letterSpacing: "0.005em",
      whiteSpace: "nowrap",
      ...(glow ? { boxShadow: "0 0 16px var(--ai-glow-soft)" } : {}),
    }}>
      {icon}
      {children}
    </span>
  );
};

/* ===== Sentiment badge with animated dot ===== */
const SentimentBadge = ({ sentiment }) => {
  // sentiment: "positive" | "neutral" | "negative"
  const map = {
    positive: { tone: "success", label: "Ijobiy", color: "var(--success)" },
    neutral:  { tone: "warning", label: "Neytral", color: "var(--warning)" },
    negative: { tone: "danger",  label: "Salbiy",  color: "var(--danger)" },
  };
  const m = map[sentiment] || map.neutral;
  return (
    <Badge tone={m.tone} size="lg" icon={<LiveDot color={m.color} size={7}/>}>
      <span style={{ marginLeft: 4 }}>{m.label}</span>
    </Badge>
  );
};

/* ===== Card wrapper ===== */
const Card = ({ variant = "default", glow, children, style, padding = 20, onClick }) => {
  const variants = {
    default: {
      background: "var(--surface-1)",
      border: "1px solid var(--border-subtle)",
      boxShadow: "var(--shadow-card)",
    },
    glass: {
      background: "var(--surface-glass)",
      border: "1px solid var(--ai-glow-edge)",
      backdropFilter: "blur(14px)",
      WebkitBackdropFilter: "blur(14px)",
      boxShadow: "var(--shadow-ai-glow)",
    },
    flat: {
      background: "var(--surface-2)",
      border: "1px solid var(--border-subtle)",
    },
  };
  return (
    <div
      onClick={onClick}
      style={{
        ...variants[variant],
        borderRadius: "var(--r-lg)",
        padding,
        ...(glow ? { boxShadow: "var(--shadow-ai-glow)" } : {}),
        ...(onClick ? { cursor: "pointer" } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/* ===== Avatar ===== */
const Avatar = ({ name, size = 32, color }) => {
  const initials = useMemo(() => {
    if (!name) return "?";
    const parts = name.split(" ").filter(Boolean);
    return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
  }, [name]);
  // deterministic color from name
  const colors = ["#0B3D91", "#1E5BD8", "#7C3AED", "#0891B2", "#059669", "#CA8A04", "#DC2626"];
  const hash = useMemo(() => {
    let h = 0;
    for (let i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return h;
  }, [name]);
  const bg = color || colors[hash % colors.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: bg, color: "white",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.4, fontWeight: 600,
      flexShrink: 0,
      letterSpacing: "0.01em",
    }}>{initials}</div>
  );
};

/* ===== Input ===== */
const Input = ({ label, type = "text", icon, value, onChange, placeholder, helper, error, autoComplete }) => {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && <label style={{
        fontSize: 13, fontWeight: 550, color: "var(--text-secondary)",
      }}>{label}</label>}
      <div style={{
        position: "relative",
        display: "flex", alignItems: "center",
        background: "var(--surface-1)",
        border: `1px solid ${error ? "var(--danger)" : focused ? "var(--sqb-blue-600)" : "var(--border-default)"}`,
        borderRadius: "var(--r-md)",
        boxShadow: focused ? "0 0 0 3px var(--sqb-blue-50)" : "none",
        transition: "all 120ms var(--ease-smooth)",
        height: 44,
      }}>
        {icon && <span style={{ paddingLeft: 12, color: "var(--text-muted)", display: "inline-flex" }}><Icon name={icon} size={16}/></span>}
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            padding: "0 12px",
            fontSize: 14,
            background: "transparent",
            color: "var(--text-primary)",
            height: "100%",
          }}
        />
      </div>
      {helper && !error && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{helper}</span>}
      {error && <span style={{ fontSize: 12, color: "var(--danger)" }}>{error}</span>}
    </div>
  );
};

Object.assign(window, { SqbLogo, Button, LiveDot, Badge, SentimentBadge, Card, Avatar, Input });

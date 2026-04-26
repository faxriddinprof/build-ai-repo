// CallButton — the hero element
// sizes: hero (240), md (140), sm (40)
// states: idle, ringing, connecting, active, ended

const CallButton = ({ size = "hero", state = "idle", onClick }) => {
  const sizes = {
    hero: 240,
    md: 140,
    sm: 56,
  };
  const px = sizes[size] || size;
  const iconSize = px * 0.28;

  const isActive = state === "active";
  const isRinging = state === "ringing" || state === "connecting";

  // Equalizer bars for active state
  const bars = Array.from({ length: 9 });

  return (
    <button
      onClick={onClick}
      style={{
        position: "relative",
        width: px,
        height: px,
        borderRadius: "50%",
        border: "none",
        cursor: "pointer",
        background: isActive
          ? "linear-gradient(135deg, var(--sqb-blue-600), var(--sqb-blue-500))"
          : "linear-gradient(135deg, var(--sqb-blue-700), var(--sqb-blue-500))",
        boxShadow: `
          0 0 0 1px rgba(255,255,255,0.08) inset,
          0 20px 60px rgba(11, 61, 145, 0.35),
          0 8px 20px rgba(11, 61, 145, 0.25)
        `,
        color: "white",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "transform 200ms var(--ease-spring)",
        outline: "none",
      }}
      onMouseDown={e => (e.currentTarget.style.transform = "scale(0.97)")}
      onMouseUp={e => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
    >
      {/* Pulse ring */}
      {!isActive && (
        <span style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          animation: "pulse-ring 2s ease-out infinite",
          pointerEvents: "none",
        }}/>
      )}
      {/* Soft glow halo */}
      <span style={{
        position: "absolute",
        inset: -px * 0.18,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(61,123,255,0.35) 0%, transparent 65%)",
        filter: "blur(12px)",
        zIndex: -1,
        pointerEvents: "none",
        animation: isActive ? "pulse-dot 2s ease-in-out infinite" : undefined,
      }}/>

      {/* Inner content */}
      {isActive ? (
        <div style={{ display: "flex", alignItems: "center", gap: px * 0.025, height: px * 0.4 }}>
          {bars.map((_, i) => (
            <span key={i} style={{
              width: px * 0.025,
              height: "100%",
              background: "rgba(255,255,255,0.92)",
              borderRadius: 2,
              animation: `equalizer ${0.8 + (i % 3) * 0.2}s ease-in-out infinite`,
              animationDelay: `${i * 0.08}s`,
              transformOrigin: "center",
            }}/>
          ))}
        </div>
      ) : isRinging ? (
        <Icon name="phone" size={iconSize} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: px * 0.04 }}>
          <Icon name="phone" size={iconSize} />
          {size === "hero" && (
            <span style={{ fontSize: 13, fontWeight: 550, opacity: 0.85, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Bog'lanish
            </span>
          )}
        </div>
      )}
    </button>
  );
};

window.CallButton = CallButton;

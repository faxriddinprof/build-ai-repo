// Customer Call Screen — the big call button moment
const CustomerCall = ({ onStart, onEnd, callState, setCallState }) => {
  // callState: "idle" | "ringing" | "active" | "ended"
  const [waitTime, setWaitTime] = useState(0);
  const [callTime, setCallTime] = useState(0);

  useEffect(() => {
    let interval;
    if (callState === "ringing") {
      setWaitTime(0);
      interval = setInterval(() => setWaitTime(t => t + 1), 1000);
    } else if (callState === "active") {
      interval = setInterval(() => setCallTime(t => t + 1), 1000);
    } else if (callState === "idle") {
      setWaitTime(0); setCallTime(0);
    }
    return () => clearInterval(interval);
  }, [callState]);

  // Auto-connect after 2.5s of ringing
  useEffect(() => {
    if (callState === "ringing") {
      const t = setTimeout(() => {
        setCallState("active");
        onStart && onStart();
      }, 2500);
      return () => clearTimeout(t);
    }
  }, [callState]);

  const fmt = (s) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  const handleClick = () => {
    if (callState === "idle") setCallState("ringing");
  };

  return (
    <div style={{
      minHeight: "100vh", width: "100%",
      display: "flex", flexDirection: "column",
      background: `
        radial-gradient(ellipse at 50% 30%, var(--sqb-blue-50) 0%, transparent 55%),
        var(--bg-page)
      `,
      position: "relative",
    }}>
      {/* Top bar — minimal chrome */}
      <header style={{
        padding: "20px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <SqbLogo size={28}/>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-muted)" }}>
          <Icon name="shield" size={13} style={{ color: "var(--success)" }}/>
          Xavfsiz ulanish
        </div>
      </header>

      {/* Main */}
      <main style={{
        flex: 1,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "flex-start",
        gap: 32, padding: "48px 24px 24px", textAlign: "center",
      }}>
        {/* Greeting */}
        <div style={{ maxWidth: 540, animation: "fade-in 600ms ease-out both" }}>
          <h1 style={{
            fontSize: 36, fontWeight: 600, lineHeight: 1.15,
            letterSpacing: "-0.02em", margin: 0,
            color: "var(--text-primary)",
          }}>
            SQB bankka xush kelibsiz
          </h1>
          <p style={{
            fontSize: 17, lineHeight: 1.55, color: "var(--text-secondary)",
            marginTop: 14, marginBottom: 0, textWrap: "balance",
          }}>
            {callState === "active"
              ? "Operator bilan suhbatlashayapsiz"
              : callState === "ringing"
              ? "Operator qidirilmoqda…"
              : "Operator bilan bog'lanish uchun tugmani bosing"}
          </p>
        </div>

        {/* Hero call button */}
        <CallButton
          size="hero"
          state={callState === "active" ? "active" : callState === "ringing" ? "ringing" : "idle"}
          onClick={handleClick}
        />

        {/* Status */}
        <div style={{ minHeight: 60, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          {callState === "idle" && (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "8px 14px",
              background: "var(--surface-1)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--r-full)",
              fontSize: 13, color: "var(--text-secondary)",
              boxShadow: "var(--shadow-card)",
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--success)" }}/>
              6 ta operator onlayn
            </div>
          )}
          {callState === "ringing" && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--text-secondary)" }}>
              <LiveDot color="var(--warning)" size={8}/>
              Operator kutilmoqda… {fmt(waitTime)}
            </div>
          )}
          {callState === "active" && (
            <>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--text-secondary)" }}>
                <LiveDot color="var(--success)" size={8}/>
                Operator ulandi · Diyora S.
              </div>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 500,
                color: "var(--text-primary)", letterSpacing: "0.02em",
                marginTop: 4,
              }}>
                {fmt(callTime)}
              </div>
              <button onClick={onEnd} style={{
                marginTop: 8,
                background: "var(--danger)", color: "white",
                border: "1px solid #B91C1C",
                borderRadius: "var(--r-full)",
                padding: "10px 20px",
                display: "inline-flex", alignItems: "center", gap: 8,
                fontSize: 14, fontWeight: 550, cursor: "pointer",
                boxShadow: "0 4px 14px rgba(220,38,38,0.25)",
              }}>
                <Icon name="phone-off" size={15}/>
                Qo'ng'iroqni yakunlash
              </button>
            </>
          )}
        </div>
      </main>

      {/* Footer hint */}
      <footer style={{
        padding: "20px 32px", textAlign: "center",
        fontSize: 12, color: "var(--text-muted)",
      }}>
        Qo'ng'iroq xavfsiz va bepul · Ish vaqti 9:00–21:00
      </footer>
    </div>
  );
};

window.CustomerCall = CustomerCall;

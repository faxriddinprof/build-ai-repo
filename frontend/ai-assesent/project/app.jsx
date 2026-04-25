// Main App
const App = () => {
  // Tweaks
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "theme": "light",
    "blueHue": 220,
    "blueSat": 88,
    "density": "comfortable"
  }/*EDITMODE-END*/;
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // Apply theme + density + blue hue to root
  React.useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", tweaks.theme);
    root.setAttribute("data-density", tweaks.density);
    const h = tweaks.blueHue;
    const s = tweaks.blueSat;
    root.style.setProperty("--sqb-blue-50",  `hsl(${h} ${Math.max(s-40,30)}% 96%)`);
    root.style.setProperty("--sqb-blue-100", `hsl(${h} ${Math.max(s-30,40)}% 90%)`);
    root.style.setProperty("--sqb-blue-500", `hsl(${h} ${s}% 38%)`);
    root.style.setProperty("--sqb-blue-600", `hsl(${h} ${s}% 30%)`);
    root.style.setProperty("--sqb-blue-700", `hsl(${h} ${Math.min(s+5,95)}% 24%)`);
    root.style.setProperty("--ai-glow", `hsl(${h+10} 95% 60%)`);
    root.style.setProperty("--ai-glow-soft", `hsla(${h+10}, 95%, 60%, 0.16)`);
    root.style.setProperty("--ai-glow-edge", `hsla(${h+10}, 95%, 60%, 0.45)`);
  }, [tweaks.theme, tweaks.blueHue, tweaks.blueSat, tweaks.density]);

  // Routing
  const [route, setRoute] = React.useState("login");
  const [showSummary, setShowSummary] = React.useState(false);
  const [showIncoming, setShowIncoming] = React.useState(false);

  // Demo timeline state
  const [callState, setCallState] = React.useState("idle");
  const [callTime, setCallTime] = React.useState(0);
  const [demoMode, setDemoMode] = React.useState(true);
  const tickRef = React.useRef(null);

  // Timeline ticker
  React.useEffect(() => {
    if (callState === "active") {
      tickRef.current = setInterval(() => {
        setCallTime(t => {
          const next = t + 0.5;
          if (next >= window.DEMO_TIMELINE.duration) {
            clearInterval(tickRef.current);
            setCallState("ended");
            setShowSummary(true);
            return window.DEMO_TIMELINE.duration;
          }
          return next;
        });
      }, 500);
      return () => clearInterval(tickRef.current);
    } else if (tickRef.current) {
      clearInterval(tickRef.current);
    }
  }, [callState]);

  const handleCustomerStart = () => {
    setCallTime(0);
    setRoute("agent");
    setCallState("active");
  };
  const handleAcceptIncoming = () => {
    // Start a new call inside the agent dashboard
    setShowIncoming(false);
    setShowSummary(false);
    setCallTime(0);
    setCallState("active");
  };
  const handleSkipIncoming = () => {
    // Skip — keep the incoming modal open so the next queued call shows
    // (in a fuller demo we'd advance the queue; for now just close it)
    setShowIncoming(false);
  };
  const handleEndCall = () => {
    setCallState("ended");
    setShowSummary(true);
    if (tickRef.current) clearInterval(tickRef.current);
  };
  const handleNewCall = () => {
    // After post-call summary closes — show IncomingCall modal inside the dashboard
    setShowSummary(false);
    setCallState("idle");
    setCallTime(0);
    setShowIncoming(true);
  };
  const handleLogin = () => {
    setRoute("agent");
    setCallTime(0);
    setCallState("active");
  };

  // No auto-progress needed — we boot straight into an active call on the agent dashboard.

  return (
    <>
      {route !== "login" && (
        <RouteNav route={route} setRoute={setRoute}
          setCallState={setCallState} setCallTime={setCallTime} setShowSummary={setShowSummary}/>
      )}

      {route === "login" && <LoginScreen onLogin={handleLogin}/>}
      {route === "customer" && (
        <CustomerCall callState={callState} setCallState={setCallState}
          onStart={handleCustomerStart} onEnd={handleEndCall}/>
      )}
      {route === "agent" && (
        <>
          <AgentDashboard callTime={callTime} callState={callState}
            onEndCall={handleEndCall} demoMode={demoMode} setDemoMode={setDemoMode}
            onLogout={() => setRoute("login")}/>
          {showIncoming && (
            <div style={{
              position: "fixed", inset: 0, zIndex: 200,
              background: "rgba(10, 22, 40, 0.55)",
              display: "flex", alignItems: "center", justifyContent: "center",
              animation: "fade-in 200ms ease-out both",
            }} onClick={() => setShowIncoming(false)}>
              <div onClick={e => e.stopPropagation()}>
                <IncomingCall onAccept={handleAcceptIncoming} onSkip={handleSkipIncoming}/>
              </div>
            </div>
          )}
        </>
      )}
      {route === "supervisor" && (
        <SupervisorDashboard onLogout={() => setRoute("login")}
          onSwitchToAgent={() => setRoute("agent")}/>
      )}

      <PostCallSummary open={showSummary}
        onClose={() => setShowSummary(false)} onNewCall={handleNewCall}/>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Mavzu (Theme)"/>
        <TweakRadio label="Tur" value={tweaks.theme}
          options={[{ value: "light", label: "Yorug'" }, { value: "dark", label: "Qorong'i" }]}
          onChange={v => setTweak("theme", v)}/>

        <TweakSection label="Asosiy rang"/>
        <TweakSlider label="Hue" min={195} max={245} step={1} value={tweaks.blueHue}
          onChange={v => setTweak("blueHue", v)}/>
        <TweakSlider label="Saturation" min={50} max={100} step={1} unit="%"
          value={tweaks.blueSat} onChange={v => setTweak("blueSat", v)}/>
        <div style={{
          height: 28, marginTop: 4,
          background: `hsl(${tweaks.blueHue} ${tweaks.blueSat}% 30%)`,
          borderRadius: 6, color: "white", fontSize: 10, fontWeight: 600,
          display: "flex", alignItems: "center", justifyContent: "center",
          letterSpacing: "0.04em",
        }}>SQB BLUE</div>

        <TweakSection label="Zichlik"/>
        <TweakRadio label="Density" value={tweaks.density}
          options={[{ value: "comfortable", label: "Qulay" }, { value: "compact", label: "Zich" }]}
          onChange={v => setTweak("density", v)}/>
      </TweaksPanel>
    </>
  );
};

// Route Nav — small floating pill
const RouteNav = ({ route, setRoute, setCallState, setCallTime, setShowSummary }) => {
  const items = [
    { id: "agent", label: "Operator", icon: "user" },
    { id: "supervisor", label: "Supervizor", icon: "users" },
    { id: "customer", label: "Mijoz (preview)", icon: "phone" },
  ];
  return (
    <div style={{
      position: "fixed", bottom: 16, left: 16,
      zIndex: 90, padding: 4,
      background: "var(--surface-glass)",
      backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
      border: "1px solid var(--border-default)",
      borderRadius: "var(--r-full)",
      boxShadow: "var(--shadow-floating)",
      display: "inline-flex", gap: 2,
    }}>
      {items.map(it => (
        <button key={it.id} onClick={() => {
          if (it.id === "customer") {
            setCallState("idle"); setCallTime(0); setShowSummary(false);
          }
          setRoute(it.id);
        }} style={{
          padding: "5px 12px",
          background: route === it.id ? "var(--sqb-blue-600)" : "transparent",
          color: route === it.id ? "white" : "var(--text-secondary)",
          border: "none", borderRadius: 99,
          fontSize: 11, fontWeight: 600, cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: 6,
          transition: "all 160ms",
        }}>
          <Icon name={it.icon} size={12}/>
          {it.label}
        </button>
      ))}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);

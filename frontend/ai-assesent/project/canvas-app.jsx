// Canvas app — Figma-style layout of all screens, components, tokens
// Each artboard wraps a "themed" container so we can mix light and dark frames
// on the same canvas.

const ThemedFrame = ({ theme = "light", width, height, children, style = {} }) => (
  <div data-theme={theme} style={{
    width, height,
    background: "var(--bg-page)",
    color: "var(--text-primary)",
    overflow: "hidden",
    fontFamily: "var(--font-sans)",
    position: "relative",
    ...style,
  }}>
    {children}
  </div>
);

/* Static (non-ticking) variants of the live screens for the canvas */
const StaticAgentDashboard = ({ theme = "light", scenario = "midcall" }) => {
  const TL = window.DEMO_TIMELINE;
  // Pick a callTime where transcript + first 2 suggestions + intake are visible
  const callTime = scenario === "midcall" ? 39.5
                  : scenario === "early" ? 12
                  : 75;
  return (
    <ThemedFrame theme={theme} width={1280} height={820}>
      <AgentDashboard
        callTime={callTime}
        callState="active"
        onEndCall={()=>{}}
        demoMode={false}
        setDemoMode={()=>{}}
        onLogout={()=>{}}
      />
    </ThemedFrame>
  );
};

const StaticCustomerCall = ({ theme = "light", state = "idle" }) => (
  <ThemedFrame theme={theme} width={760} height={820}>
    <CustomerCall
      callState={state}
      setCallState={()=>{}}
      onStart={()=>{}}
      onEnd={()=>{}}
    />
  </ThemedFrame>
);

const StaticLogin = ({ theme = "light" }) => (
  <ThemedFrame theme={theme} width={760} height={820}>
    <LoginScreen onLogin={()=>{}}/>
  </ThemedFrame>
);

const StaticSupervisor = ({ theme = "light" }) => (
  <ThemedFrame theme={theme} width={1280} height={820}>
    <SupervisorDashboard onLogout={()=>{}} onSwitchToAgent={()=>{}}/>
  </ThemedFrame>
);

const StaticSupervisorHistory = ({ theme = "light" }) => (
  <ThemedFrame theme={theme} width={1280} height={820}>
    <SupervisorDashboard onLogout={()=>{}} onSwitchToAgent={()=>{}} initialView="completed"/>
  </ThemedFrame>
);

const StaticSummary = ({ theme = "light" }) => (
  <ThemedFrame theme={theme} width={820} height={760}>
    <div style={{ position: "absolute", inset: 0, background: "rgba(10, 22, 40, 0.55)" }}/>
    <PostCallSummary open={true} onClose={()=>{}} onNewCall={()=>{}}/>
  </ThemedFrame>
);

/* Agent dashboard with post-call summary modal overlaid (call ended state) */
const StaticAgentEnded = ({ theme = "light" }) => {
  return (
    <ThemedFrame theme={theme} width={1280} height={820}>
      <AgentDashboard
        callTime={window.DEMO_TIMELINE.duration}
        callState="ended"
        onEndCall={()=>{}}
        demoMode={false}
        setDemoMode={()=>{}}
        onLogout={()=>{}}
      />
      {/* Dim overlay */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(10, 22, 40, 0.55)", zIndex: 10 }}/>
      {/* Modal — absolutely positioned within the frame, not fixed to viewport */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 11,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}>
        <div style={{
          width: "100%", maxWidth: 720, maxHeight: "calc(100% - 48px)",
          display: "flex", flexDirection: "column",
        }}>
          {/* Render modal contents but without the fixed-position wrapper */}
          <PostCallSummaryInline/>
        </div>
      </div>
    </ThemedFrame>
  );
};

/* Inline (non-fixed) version of PostCallSummary for canvas embedding */
const PostCallSummaryInline = () => {
  const TL = window.DEMO_TIMELINE;
  const s = TL.summary;
  const sections = [
    { key: "natija", label: "Natija", icon: "check", body: s.natija },
    { key: "etiroz", label: "Asosiy e'tirozlar", icon: "alert", body:
      <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
        {s.eтirozlar.map((x, i) => <li key={i} style={{ fontSize: 13.5, lineHeight: 1.5 }}>{x}</li>)}
      </ul>
    },
    { key: "bartaraf", label: "E'tirozlarni bartaraf etish", icon: "sparkles", body: s.eтirozlarBartaraf, ai: true },
    { key: "next", label: "Keyingi qadam", icon: "trending-up", body: s.keyingiQadam }
  ];
  return (
    <div style={{
      width: "100%",
      background: "var(--surface-1)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--r-xl)",
      boxShadow: "var(--shadow-modal)",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
      maxHeight: "100%",
    }}>
      {/* Hero header */}
      <div style={{
        padding: "20px 24px",
        background: "linear-gradient(135deg, var(--sqb-blue-700), var(--sqb-blue-500))",
        color: "white", position: "relative", overflow: "hidden", flexShrink: 0,
      }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 90% 0%, var(--ai-glow-soft), transparent 60%)", pointerEvents: "none" }}/>
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
          <button style={{
            background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)",
            color: "white", borderRadius: "var(--r-md)", padding: 8,
            cursor: "pointer", display: "inline-flex"
          }}>
            <Icon name="x" size={16}/>
          </button>
        </div>
        <div style={{
          marginTop: 16, padding: "10px 14px",
          background: "rgba(255,255,255,0.1)", borderRadius: "var(--r-md)",
          border: "1px solid rgba(255,255,255,0.15)",
          display: "flex", alignItems: "center", gap: 12,
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
                  {i < s.sentimentJourney.length - 1 && <Icon name="chevron-right" size={12} style={{ opacity: 0.5 }}/>}
                </React.Fragment>
              );
            })}
          </div>
          <Badge tone="success" size="md">
            <Icon name="check" size={11}/>
            <span style={{ marginLeft: 4 }}>Compliance {s.complianceHolati.passed}/{s.complianceHolati.total}</span>
          </Badge>
        </div>
      </div>
      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
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
                <Icon name={sec.icon} size={14} style={{ color: sec.ai ? "var(--ai-glow)" : "var(--text-secondary)" }}/>
                <span style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                  color: sec.ai ? "var(--ai-glow)" : "var(--text-secondary)"
                }}>{sec.label}</span>
              </div>
              <span style={{ fontSize: 11, color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="copy" size={12}/> Nusxa
              </span>
            </div>
            <div style={{ padding: 14, fontSize: 13.5, lineHeight: 1.55, color: "var(--text-primary)", background: "var(--surface-1)" }}>
              {sec.body}
            </div>
          </div>
        )}
      </div>
      <footer style={{
        padding: "14px 24px", borderTop: "1px solid var(--border-subtle)",
        display: "flex", gap: 10, justifyContent: "flex-end",
        background: "var(--surface-2)", flexShrink: 0,
      }}>
        <Button variant="secondary">Yopish</Button>
        <Button variant="primary" icon="phone">Yangi qo'ng'iroq</Button>
      </footer>
    </div>
  );
};

/* === Token sheet === */
const TokenSheet = ({ theme = "light" }) => {
  const colorRows = [
    { label: "Primary blue", tokens: ["--sqb-blue-50","--sqb-blue-100","--sqb-blue-500","--sqb-blue-600","--sqb-blue-700","--sqb-blue-900"] },
    { label: "AI accent",    tokens: ["--ai-glow","--ai-glow-soft","--ai-glow-edge"] },
    { label: "Sentiment",    tokens: ["--success","--warning","--danger"] },
    { label: "Surfaces",     tokens: ["--bg-page","--surface-1","--surface-2","--surface-3"] },
    { label: "Text",         tokens: ["--text-primary","--text-secondary","--text-muted"] },
    { label: "Borders",      tokens: ["--border-subtle","--border-default","--border-strong"] },
  ];
  return (
    <ThemedFrame theme={theme} width={760} height={1080} style={{ padding: 32, overflow: "auto" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>
          Design tokens · {theme === "dark" ? "Dark (AI cockpit)" : "Light (Banking dashboard)"}
        </div>
        <h2 style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>Colors</h2>
      </div>

      {colorRows.map(row => (
        <div key={row.label} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>{row.label}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {row.tokens.map(t => (
              <div key={t} style={{ width: 108 }}>
                <div style={{ height: 56, borderRadius: 8, background: `var(${t})`, border: "1px solid var(--border-subtle)" }}/>
                <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-muted)", marginTop: 4 }}>{t}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <h2 style={{ margin: "24px 0 12px", fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>Typography</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[
          { sz: 36, w: 600, lbl: "Display 36/600" },
          { sz: 22, w: 600, lbl: "Heading 22/600" },
          { sz: 16, w: 550, lbl: "Body 16/550" },
          { sz: 14, w: 500, lbl: "Body sm 14/500" },
          { sz: 12, w: 600, lbl: "Caption 12/600", upper: true },
        ].map(t => (
          <div key={t.lbl} style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 8 }}>
            <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-muted)", marginBottom: 4 }}>{t.lbl}</div>
            <div style={{
              fontSize: t.sz, fontWeight: t.w,
              letterSpacing: t.upper ? "0.08em" : "-0.01em",
              textTransform: t.upper ? "uppercase" : "none",
              color: "var(--text-primary)",
            }}>SQB · Sun'iy intellekt yordamchisi</div>
          </div>
        ))}
        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 8 }}>
          <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-muted)", marginBottom: 4 }}>Mono · transcript</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--text-primary)" }}>«Bu juda qimmat-ku!»  02:14</div>
        </div>
      </div>

      <h2 style={{ margin: "24px 0 12px", fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>Spacing & Radius</h2>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {[4,8,12,16,24,32,48].map(n => (
          <div key={n} style={{ textAlign: "center" }}>
            <div style={{ width: n, height: n, background: "var(--sqb-blue-600)", borderRadius: 2, margin: "0 auto" }}/>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4, fontFamily: "var(--font-mono)" }}>{n}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 16 }}>
        {[{n:"sm",r:6},{n:"md",r:10},{n:"lg",r:14},{n:"xl",r:20}].map(r => (
          <div key={r.n} style={{ textAlign: "center" }}>
            <div style={{ width: 56, height: 56, background: "var(--sqb-blue-100)", border: "1px solid var(--sqb-blue-500)", borderRadius: r.r }}/>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4, fontFamily: "var(--font-mono)" }}>{r.n} · {r.r}px</div>
          </div>
        ))}
      </div>
    </ThemedFrame>
  );
};

/* === Component sheet === */
const ComponentSheet = ({ theme = "light" }) => (
  <ThemedFrame theme={theme} width={1100} height={900} style={{ padding: 32, overflow: "auto" }}>
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>
        Components · {theme}
      </div>
      <h2 style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>Component library</h2>
    </div>

    <Section title="Buttons">
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Button variant="primary">Tasdiqlash</Button>
        <Button variant="secondary" icon="edit">Tahrirlash</Button>
        <Button variant="ghost" icon="copy">Nusxa</Button>
        <Button variant="danger" icon="phone-off">Yakunlash</Button>
        <Button variant="primary" size="sm">Sm</Button>
        <Button variant="primary" size="lg">Large CTA</Button>
      </div>
    </Section>

    <Section title="Inputs">
      <div style={{ display: "flex", gap: 12, maxWidth: 640 }}>
        <div style={{ flex: 1 }}><Input label="Login" icon="user" value="diyora.saidova" onChange={()=>{}}/></div>
        <div style={{ flex: 1 }}><Input label="Parol" icon="lock" type="password" value="••••••" onChange={()=>{}}/></div>
      </div>
    </Section>

    <Section title="Badges & Sentiment">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Badge tone="neutral">Neutral</Badge>
        <Badge tone="blue">Blue</Badge>
        <Badge tone="success">Ijobiy</Badge>
        <Badge tone="warning">Neytral</Badge>
        <Badge tone="danger">Salbiy</Badge>
        <Badge tone="ai" icon={<LiveDot color="var(--ai-glow)" size={5}/>}><span style={{ marginLeft: 4 }}>AI</span></Badge>
        <SentimentBadge sentiment="positive"/>
        <SentimentBadge sentiment="neutral"/>
        <SentimentBadge sentiment="negative"/>
      </div>
    </Section>

    <Section title="Compliance chips">
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <ComplianceChip status="done" label="Salomlashish"/>
        <ComplianceChip status="pending" label="Aksiyani taklif qilish"/>
        <ComplianceChip status="missed" label="Xayrlashish"/>
      </div>
    </Section>

    <Section title="Suggestion card · 3 states">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        <SuggestionCard variant="empty"/>
        <SuggestionCard
          trigger="qimmat"
          age={0.5}
          bullets={[
            "Foizsiz 60 kunlik davrni eslatib o'ting.",
            "Yillik xizmat haqi bekor qilinishini taklif qiling.",
          ]}
        />
        <SuggestionCard
          trigger="o'ylab ko'raman"
          age={5}
          bullets={[
            "Cheklangan vaqtli aksiyani eslating.",
            "24 soat ichida qaror so'rang.",
            "Mijozning asosiy ehtiyojini aniqlang.",
          ]}
        />
      </div>
    </Section>

    <Section title="Transcript bubbles">
      <div style={{ background: "var(--bg-page)", padding: 16, borderRadius: 8, maxWidth: 640 }}>
        <TranscriptBubble speaker="Mijoz" text="24% — bu juda qimmat-ku!" time="00:24"/>
        <TranscriptBubble speaker="Operator" text="Tushunaman. Bizda 60 kunlik foizsiz davr bor." time="00:30"/>
      </div>
    </Section>

    <Section title="Call button · sizes & states">
      <div style={{ display: "flex", gap: 32, alignItems: "center", padding: 16 }}>
        <div style={{ textAlign: "center" }}>
          <CallButton size="md" state="idle"/>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8, fontFamily: "var(--font-mono)" }}>idle · md</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <CallButton size="md" state="ringing"/>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8, fontFamily: "var(--font-mono)" }}>ringing</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <CallButton size="md" state="active"/>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8, fontFamily: "var(--font-mono)" }}>active · waveform</div>
        </div>
      </div>
    </Section>

    <Section title="Avatars & Logo">
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <SqbLogo size={36}/>
        <div style={{ width: 1, height: 32, background: "var(--border-default)" }}/>
        <Avatar name="Diyora Saidova" size={40}/>
        <Avatar name="Bekzod Karimov" size={32}/>
        <Avatar name="Aziz Yusupov" size={28}/>
      </div>
    </Section>
  </ThemedFrame>
);

const Section = ({ title, children }) => (
  <div style={{ marginBottom: 22 }}>
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10 }}>{title}</div>
    {children}
  </div>
);

/* === Mount === */
const CanvasApp = () => (
  <DesignCanvas>
    <DCSection id="screens-light" title="Screens" subtitle="Clean banking dashboard">
      <DCArtboard id="login-l" label="01 · Login" width={760} height={820}>
        <StaticLogin theme="light"/>
      </DCArtboard>
      <DCArtboard id="customer-idle-l" label="02 · Customer call · idle" width={760} height={820}>
        <StaticCustomerCall theme="light" state="idle"/>
      </DCArtboard>
      <DCArtboard id="customer-active-l" label="02b · Customer call · active" width={760} height={820}>
        <StaticCustomerCall theme="light" state="active"/>
      </DCArtboard>
      <DCArtboard id="agent-l" label="03 · Agent dashboard · AI moment" width={1280} height={820}>
        <StaticAgentDashboard theme="light" scenario="midcall"/>
      </DCArtboard>
      <DCArtboard id="agent-ended-l" label="03b · Agent dashboard · call ended" width={1280} height={820}>
        <StaticAgentEnded theme="light"/>
      </DCArtboard>
      <DCArtboard id="supervisor-l" label="04 · Supervisor · faol" width={1280} height={820}>
        <StaticSupervisor theme="light"/>
      </DCArtboard>
      <DCArtboard id="supervisor-history-l" label="04b · Supervisor · yakunlangan" width={1280} height={820}>
        <StaticSupervisorHistory theme="light"/>
      </DCArtboard>
    </DCSection>

    <DCSection id="tokens" title="Design tokens" subtitle="Color · Typography · Spacing · Radius">
      <DCArtboard id="tokens-l" label="Tokens" width={760} height={1080}>
        <TokenSheet theme="light"/>
      </DCArtboard>
    </DCSection>

    <DCSection id="components" title="Components" subtitle="Buttons · Inputs · Badges · Suggestion card · Transcript · Call button">
      <DCArtboard id="components-l" label="Components" width={1100} height={900}>
        <ComponentSheet theme="light"/>
      </DCArtboard>
    </DCSection>
  </DesignCanvas>
);

ReactDOM.createRoot(document.getElementById("root")).render(<CanvasApp/>);

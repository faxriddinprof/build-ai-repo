// Supervisor Dashboard — grid of live calls + drawer
const SupervisorDashboard = ({ onLogout, onSwitchToAgent, initialView = "active" }) => {
  const [drawerAgent, setDrawerAgent] = useState(null);
  const [tickTime, setTickTime] = useState(0);
  const [view, setView] = useState(initialView); // "active" | "completed"
  const [outcomeFilter, setOutcomeFilter] = useState("all"); // "all" | "won" | "lost" | "callback"
  const TL = window.DEMO_TIMELINE;
  const agents = window.SUPERVISOR_AGENTS;
  const history = window.SUPERVISOR_HISTORY || [];

  useEffect(() => {
    const i = setInterval(() => setTickTime(t => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const fmt = (s) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  // Aggregate stats
  const sentimentCounts = agents.reduce((acc, a) => {
    acc[a.sentiment] = (acc[a.sentiment] || 0) + 1; return acc;
  }, {});

  const filteredHistory = outcomeFilter === "all"
    ? history
    : history.filter(h => h.outcome === outcomeFilter);

  const outcomeMeta = {
    won:      { label: "Sotuv",      tone: "success", icon: "check" },
    lost:     { label: "Rad etildi", tone: "danger",  icon: "x" },
    callback: { label: "Qayta aloqa", tone: "warning", icon: "phone" },
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)", display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <header style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "14px 32px",
        background: "var(--surface-1)",
        borderBottom: "1px solid var(--border-subtle)",
      }}>
        <SqbLogo size={26}/>
        <div style={{ width: 1, height: 24, background: "var(--border-default)" }}/>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="users" size={16} style={{ color: "var(--text-secondary)" }}/>
          <h1 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Supervizor paneli</h1>
        </div>
        <div style={{ flex: 1 }}/>
        <button onClick={onLogout} style={{
          padding: "6px 12px", background: "transparent",
          border: "1px solid var(--border-default)", borderRadius: "var(--r-md)",
          fontSize: 12, fontWeight: 550, color: "var(--text-secondary)", cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: 8,
        }}>
          <Avatar name="Rustam Nazarov" size={20}/>
          Rustam N.
        </button>
      </header>

      {/* Filter / view toggle */}
      <div style={{
        padding: "20px 32px 0", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>
            {view === "active" ? "Faol qo'ng'iroqlar" : "Yakunlangan qo'ng'iroqlar"}
          </h2>
          <Badge tone="blue" size="lg">
            {view === "active" ? agents.length : filteredHistory.length}
          </Badge>
        </div>

        {/* Segmented control: Active / Completed */}
        <div style={{
          display: "inline-flex", padding: 3,
          background: "var(--surface-2)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--r-md)",
          marginLeft: 8,
        }}>
          {[
            { id: "active",    label: "Faol",        icon: "phone",       count: agents.length },
            { id: "completed", label: "Yakunlangan", icon: "check", count: history.length },
          ].map(opt => {
            const isActive = view === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setView(opt.id)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "6px 12px",
                  background: isActive ? "var(--surface-1)" : "transparent",
                  border: "1px solid",
                  borderColor: isActive ? "var(--border-default)" : "transparent",
                  borderRadius: "var(--r-sm)",
                  color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                  boxShadow: isActive ? "var(--shadow-card)" : "none",
                  transition: "all 120ms",
                }}
              >
                {opt.id === "active" && <LiveDot color="var(--danger)" size={6}/>}
                {opt.id !== "active" && <Icon name={opt.icon} size={12}/>}
                {opt.label}
                <span style={{
                  fontSize: 10, fontWeight: 600,
                  padding: "1px 6px", borderRadius: 99,
                  background: isActive ? "var(--sqb-blue-50)" : "var(--surface-3)",
                  color: isActive ? "var(--sqb-blue-700)" : "var(--text-muted)",
                  fontVariantNumeric: "tabular-nums",
                }}>{opt.count}</span>
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1 }}/>

        {view === "active" ? (
          <>
            <Badge tone="success" size="md" icon={<LiveDot color="var(--success)" size={6}/>}>
              <span style={{ marginLeft: 4 }}>{sentimentCounts.positive || 0} ijobiy</span>
            </Badge>
            <Badge tone="warning" size="md" icon={<LiveDot color="var(--warning)" size={6}/>}>
              <span style={{ marginLeft: 4 }}>{sentimentCounts.neutral || 0} neytral</span>
            </Badge>
            <Badge tone="danger" size="md" icon={<LiveDot color="var(--danger)" size={6}/>}>
              <span style={{ marginLeft: 4 }}>{sentimentCounts.negative || 0} salbiy</span>
            </Badge>
          </>
        ) : (
          <>
            {/* Outcome chips for history view */}
            {[
              { id: "all",      label: "Barchasi" },
              { id: "won",      label: "Sotuv" },
              { id: "lost",     label: "Rad" },
              { id: "callback", label: "Qayta aloqa" },
            ].map(o => {
              const sel = outcomeFilter === o.id;
              return (
                <button key={o.id} onClick={() => setOutcomeFilter(o.id)} style={{
                  padding: "5px 12px",
                  background: sel ? "var(--sqb-blue-600)" : "var(--surface-1)",
                  color: sel ? "white" : "var(--text-secondary)",
                  border: `1px solid ${sel ? "var(--sqb-blue-700)" : "var(--border-default)"}`,
                  borderRadius: "var(--r-full)",
                  fontSize: 11, fontWeight: 600, cursor: "pointer",
                }}>{o.label}</button>
              );
            })}
          </>
        )}
      </div>

      {/* Grid of call cards */}
      {view === "active" ? (
        <div style={{
          padding: 32,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 16,
        }}>
        {agents.map(a => {
          const dur = a.duration + tickTime;
          const sentColor = a.sentiment === "positive" ? "var(--success)"
                          : a.sentiment === "negative" ? "var(--danger)" : "var(--warning)";
          return (
            <Card key={a.id} onClick={() => setDrawerAgent(a)} style={{
              cursor: "pointer", padding: 16,
              transition: "transform 120ms, box-shadow 120ms",
              borderColor: a.isHero ? "var(--ai-glow-edge)" : undefined,
              boxShadow: a.isHero ? "var(--shadow-ai-glow)" : "var(--shadow-card)",
            }}
            onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
            onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <Avatar name={a.name} size={36}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Operator</div>
                </div>
                <SentimentBadge sentiment={a.sentiment}/>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 500, color: "var(--text-primary)" }}>
                  {fmt(dur)}
                </div>
                <MiniWaveform color={sentColor} bars={12} width={52}/>
              </div>
              <div style={{
                fontSize: 11, color: "var(--text-muted)", marginBottom: 4,
                letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 600,
              }}>Asosiy e'tiroz</div>
              <Badge tone="neutral" size="md">«{a.topObjection}»</Badge>
              {a.isHero && (
                <div style={{ marginTop: 10, padding: "6px 10px", background: "var(--ai-glow-soft)", border: "1px solid var(--ai-glow-edge)", borderRadius: "var(--r-md)", fontSize: 11, color: "var(--ai-glow)", display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name="sparkles" size={11}/>
                  AI 3 ta tavsiya berdi
                </div>
              )}
            </Card>
          );
        })}
        </div>
      ) : (
        /* History table */
        <div style={{ padding: "20px 32px 32px" }}>
          <div style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--r-lg)",
            overflow: "hidden",
            boxShadow: "var(--shadow-card)",
          }}>
            {/* Table header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1.6fr 1fr 1.4fr 1fr 1fr 0.6fr 28px",
              gap: 12,
              padding: "12px 16px",
              background: "var(--surface-2)",
              borderBottom: "1px solid var(--border-subtle)",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "var(--text-muted)",
            }}>
              <span>Operator</span>
              <span>Davomiyligi</span>
              <span>Asosiy e'tiroz</span>
              <span>Sentiment</span>
              <span>Natija</span>
              <span>Compliance</span>
              <span/>
            </div>
            {filteredHistory.map((h, idx) => {
              const o = outcomeMeta[h.outcome];
              return (
                <div key={h.id} onClick={() => setDrawerAgent({ ...h, completed: true })} style={{
                  display: "grid",
                  gridTemplateColumns: "1.6fr 1fr 1.4fr 1fr 1fr 0.6fr 28px",
                  gap: 12,
                  padding: "12px 16px",
                  alignItems: "center",
                  borderBottom: idx === filteredHistory.length - 1 ? "none" : "1px solid var(--border-subtle)",
                  cursor: "pointer",
                  transition: "background 120ms",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <Avatar name={h.name} size={28}/>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {h.name}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{h.endedAt}</div>
                    </div>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-primary)" }}>{fmt(h.duration)}</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>«{h.topObjection}»</div>
                  <div><SentimentBadge sentiment={h.sentiment}/></div>
                  <div>
                    <Badge tone={o.tone} size="md" icon={<Icon name={o.icon} size={11}/>}>
                      <span style={{ marginLeft: 4 }}>{o.label}</span>
                    </Badge>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: h.complianceScore >= 5 ? "var(--success)" : h.complianceScore >= 4 ? "var(--text-secondary)" : "var(--warning)", fontWeight: 600 }}>
                    {h.complianceScore}/5
                  </div>
                  <Icon name="chevron-right" size={14} style={{ color: "var(--text-muted)" }}/>
                </div>
              );
            })}
            {filteredHistory.length === 0 && (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                Tanlangan filtrga mos qo'ng'iroqlar yo'q
              </div>
            )}
          </div>
        </div>
      )}

      {/* Drawer */}
      {drawerAgent && (
        <>
          <div onClick={() => setDrawerAgent(null)} style={{
            position: "fixed", inset: 0, background: "rgba(10, 22, 40, 0.4)",
            zIndex: 40, animation: "fade-in 200ms ease-out both",
          }}/>
          <aside style={{
            position: "fixed", top: 0, right: 0, bottom: 0,
            width: 480, maxWidth: "92vw",
            background: "var(--surface-1)",
            borderLeft: "1px solid var(--border-subtle)",
            boxShadow: "var(--shadow-modal)",
            zIndex: 50, animation: "slide-in-right 280ms var(--ease-spring) both",
            display: "flex", flexDirection: "column",
          }}>
            <header style={{
              padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)",
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <Avatar name={drawerAgent.name} size={36}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{drawerAgent.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                  {drawerAgent.completed ? (
                    <><Icon name="check" size={11} style={{ color: "var(--success)" }}/> Yakunlangan · {fmt(drawerAgent.duration)} · {drawerAgent.endedAt}</>
                  ) : (
                    <><LiveDot color="var(--danger)" size={5}/> Faol qo'ng'iroq · {fmt(drawerAgent.duration + tickTime)}</>
                  )}
                </div>
              </div>
              <button onClick={() => setDrawerAgent(null)} style={{
                background: "transparent", border: "none", color: "var(--text-muted)",
                cursor: "pointer", padding: 6,
              }}><Icon name="x" size={18}/></button>
            </header>

            {/* Privacy notice — passport hidden */}
            <div style={{
              margin: 16, padding: "10px 12px",
              background: "var(--surface-2)", border: "1px dashed var(--border-default)",
              borderRadius: "var(--r-md)",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <Icon name="lock" size={15} style={{ color: "var(--text-muted)" }}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>Pasport: ma'lumot maxfiy</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Supervizorlarga PII ko'rinmaydi</div>
              </div>
              <Badge tone="success" size="sm">GDPR</Badge>
            </div>

            <div style={{ padding: "0 20px", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {drawerAgent.completed ? "Transkript" : "Jonli transkripsiya (faqat o'qish)"}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px" }}>
              {TL.transcript.slice(0, 6).map((t, i) => (
                <TranscriptBubble key={i} speaker={t.speaker} text={t.text} time={fmt(t.t)}/>
              ))}
            </div>

            <div style={{ padding: 16, borderTop: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>
                Compliance holati
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <ComplianceChip status="done" label="Salomlashish"/>
                <ComplianceChip status="done" label="Ism olish"/>
                <ComplianceChip status="done" label="Foiz"/>
                <ComplianceChip status="pending" label="Aksiya"/>
                <ComplianceChip status="pending" label="Keyingi qadam"/>
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
};

window.SupervisorDashboard = SupervisorDashboard;

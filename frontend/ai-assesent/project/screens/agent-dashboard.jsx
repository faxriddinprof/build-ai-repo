// Agent Dashboard — the AI cockpit
// Drives off the demo timeline + a callTime prop fed from app

const AgentDashboard = ({
  callTime,
  callState,
  onEndCall,
  demoMode,
  setDemoMode,
  onLogout,
}) => {
  const TL = window.DEMO_TIMELINE;
  const transcriptRef = useRef(null);
  const [intakeDismissed, setIntakeDismissed] = useState(false);
  const [intakeConfirmed, setIntakeConfirmed] = useState(false);
  const [copied, setCopied] = useState(null);

  // Visible transcript: items whose t <= callTime
  const visibleTranscript = useMemo(() => {
    return TL.transcript.filter(item => item.t <= callTime);
  }, [callTime]);

  // Streaming line: the most recent item if it started <2.5s ago
  const streamingLine = useMemo(() => {
    if (visibleTranscript.length === 0) return null;
    const last = visibleTranscript[visibleTranscript.length - 1];
    return (callTime - last.t) < 2.0 ? last : null;
  }, [visibleTranscript, callTime]);

  // Visible suggestions: with arrival timestamp tracked
  const visibleSuggestions = useMemo(() => {
    return TL.suggestions
      .filter(s => s.t <= callTime)
      .map(s => ({ ...s, age: callTime - s.t }))
      .reverse(); // newest first
  }, [callTime]);

  // Sentiment
  const currentSentiment = useMemo(() => {
    const shifts = TL.sentimentShifts.filter(s => s.t <= callTime);
    return shifts[shifts.length - 1]?.sentiment || "neutral";
  }, [callTime]);

  // Intake card visibility
  const intakeVisible = !intakeDismissed && !intakeConfirmed
    && callTime >= TL.intakeAppears
    && callTime < TL.intakeAppears + 25; // visible window

  // Compliance
  const complianceItems = useMemo(() => {
    return TL.compliance.map(c => ({
      ...c,
      status: callTime >= c.tickAt ? "done"
            : callState === "ended" ? "missed"
            : "pending",
      flash: Math.abs(callTime - c.tickAt) < 0.6 && callTime >= c.tickAt,
    }));
  }, [callTime, callState]);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [visibleTranscript.length]);

  const fmt = (s) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(Math.floor(s)%60).padStart(2,"0")}`;

  const copyText = (text) => {
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div style={{
      minHeight: "100vh", width: "100%",
      background: "var(--bg-page)",
      display: "flex", flexDirection: "column",
    }}>
      {/* TOP BAR */}
      <header style={{
        display: "flex", alignItems: "center", gap: 20,
        padding: "12px 24px",
        background: "var(--surface-1)",
        borderBottom: "1px solid var(--border-subtle)",
        boxShadow: "var(--shadow-card)",
        zIndex: 5,
      }}>
        <SqbLogo size={26}/>
        <div style={{ width: 1, height: 24, background: "var(--border-default)" }}/>

        {/* Call timer (large mono) */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {callState === "active" && <LiveDot color="var(--danger)" size={8}/>}
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Faol qo'ng'iroq
            </div>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500,
              color: "var(--text-primary)", letterSpacing: "0.02em", lineHeight: 1,
            }}>
              {fmt(callTime)}
            </div>
          </div>
        </div>

        <div style={{ width: 1, height: 24, background: "var(--border-default)" }}/>

        {/* Customer info pill */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "6px 12px",
          background: "var(--surface-2)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--r-full)",
        }}>
          <Avatar name={intakeConfirmed ? TL.intakeData.name : "Mijoz"} size={24}/>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
              {intakeConfirmed ? TL.intakeData.name : "Mijoz"}
            </span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
              +998 90 ••• 23 45
            </span>
          </div>
        </div>

        <SentimentBadge sentiment={currentSentiment}/>

        <div style={{ flex: 1 }}/>

        {/* Demo mode toggle */}
        <label style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "5px 12px",
          background: demoMode ? "var(--ai-glow-soft)" : "var(--surface-2)",
          border: `1px solid ${demoMode ? "var(--ai-glow-edge)" : "var(--border-subtle)"}`,
          borderRadius: "var(--r-full)",
          fontSize: 12, fontWeight: 550,
          color: demoMode ? "var(--ai-glow)" : "var(--text-secondary)",
          cursor: "pointer",
        }}>
          <span style={{
            width: 28, height: 16,
            background: demoMode ? "var(--ai-glow)" : "var(--border-strong)",
            borderRadius: 99,
            position: "relative",
            transition: "background 200ms",
          }}>
            <span style={{
              position: "absolute", top: 2, left: demoMode ? 14 : 2,
              width: 12, height: 12, borderRadius: "50%", background: "white",
              transition: "left 200ms var(--ease-spring)",
            }}/>
          </span>
          <input type="checkbox" checked={demoMode} onChange={e => setDemoMode(e.target.checked)} style={{ display: "none" }}/>
          Demo rejimi
        </label>

        <button onClick={onLogout} style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "6px 10px", background: "transparent",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--r-md)",
          color: "var(--text-secondary)", fontSize: 12, fontWeight: 550,
          cursor: "pointer",
        }}>
          <Avatar name="Diyora Saidova" size={22}/>
          Diyora S.
        </button>
      </header>

      {/* BODY: 2-column */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        {/* LEFT: Transcript */}
        <section style={{
          flex: "1 1 55%",
          display: "flex", flexDirection: "column",
          borderRight: "1px solid var(--border-subtle)",
          minWidth: 0,
        }}>
          <div style={{
            padding: "14px 24px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            borderBottom: "1px solid var(--border-subtle)",
            background: "var(--surface-1)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                Jonli transkripsiya
              </h2>
              <Badge tone="ai" size="sm" icon={<LiveDot color="var(--ai-glow)" size={5}/>}>
                <span style={{ marginLeft: 4 }}>O'zbek + Rus</span>
              </Badge>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text-muted)" }}>
              <span>Avto-skroll yoqilgan</span>
            </div>
          </div>
          <div ref={transcriptRef} style={{
            flex: 1, overflowY: "auto",
            padding: "20px 24px",
            background: "var(--bg-page)",
          }}>
            {visibleTranscript.length === 0 && (
              <div style={{
                height: "100%", display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                color: "var(--text-muted)", textAlign: "center", gap: 8,
              }}>
                <Icon name="mic" size={28}/>
                <div style={{ fontSize: 14 }}>Qo'ng'iroq kutilmoqda…</div>
                <div style={{ fontSize: 12 }}>Suhbat boshlanganda transkripsiya bu yerda paydo bo'ladi</div>
              </div>
            )}
            {visibleTranscript.map((item, i) => (
              <TranscriptBubble
                key={i}
                speaker={item.speaker}
                text={item.text}
                time={fmt(item.t)}
                streaming={streamingLine === item}
              />
            ))}
            {/* AI listening indicator at bottom when active */}
            {callState === "active" && !streamingLine && visibleTranscript.length > 0 && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 12px", marginTop: 8,
                fontSize: 11, color: "var(--text-muted)",
              }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 12 }}>
                  {[0,1,2].map(i => (
                    <span key={i} style={{
                      width: 3, background: "var(--ai-glow)", borderRadius: 1,
                      height: "100%",
                      animation: `equalizer ${0.7 + i*0.15}s ease-in-out infinite`,
                      animationDelay: `${i * 0.1}s`,
                      transformOrigin: "center",
                    }}/>
                  ))}
                </div>
                AI tinglamoqda
              </div>
            )}
          </div>
        </section>

        {/* RIGHT: AI Suggestions */}
        <section style={{
          flex: "1 1 45%",
          display: "flex", flexDirection: "column",
          minWidth: 0,
          background: "var(--surface-2)",
        }}>
          <div style={{
            padding: "14px 24px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            borderBottom: "1px solid var(--border-subtle)",
            background: "var(--surface-1)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Icon name="sparkles" size={16} style={{ color: "var(--ai-glow)" }}/>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                AI Tavsiyalar
              </h2>
              <Badge tone="ai" size="sm">{visibleSuggestions.length} ta</Badge>
            </div>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              ~1.4s kechikish
            </span>
          </div>

          <div style={{
            flex: 1, overflowY: "auto",
            padding: 20, display: "flex", flexDirection: "column", gap: 14,
          }}>
            {visibleSuggestions.length === 0 ? (
              <SuggestionCard variant="empty"/>
            ) : (
              visibleSuggestions.map((s, i) => (
                <SuggestionCard
                  key={s.t}
                  trigger={s.trigger}
                  bullets={s.bullets}
                  age={s.age}
                  onCopy={copyText}
                />
              ))
            )}
          </div>
        </section>

        {/* RIGHT-MOST: Call queue rail */}
        <QueueRail queue={window.CALL_QUEUE || []}/>

        {/* Floating Intake Confirmation Card */}
        {intakeVisible && (
          <div style={{
            position: "absolute",
            top: 24, right: 304,
            zIndex: 20,
          }}>
            <IntakeCard
              data={TL.intakeData}
              onConfirm={() => setIntakeConfirmed(true)}
              onEdit={() => setIntakeConfirmed(true)}
              onDismiss={() => setIntakeDismissed(true)}
            />
          </div>
        )}

        {/* Copy toast */}
        {copied && (
          <div style={{
            position: "absolute", bottom: 110, left: "50%", transform: "translateX(-50%)",
            padding: "8px 14px",
            background: "var(--text-primary)", color: "var(--bg-canvas)",
            borderRadius: "var(--r-md)",
            fontSize: 12, fontWeight: 550,
            boxShadow: "var(--shadow-floating)",
            zIndex: 50,
            animation: "fade-in 200ms ease-out both",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <Icon name="check" size={14}/>
            Nusxa olindi
          </div>
        )}
      </div>

      {/* BOTTOM BAR: Compliance */}
      <footer style={{
        padding: "12px 24px",
        background: "var(--surface-1)",
        borderTop: "1px solid var(--border-subtle)",
        display: "flex", alignItems: "center", gap: 14,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <Icon name="clipboard" size={15} style={{ color: "var(--text-secondary)" }}/>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
              Compliance
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.02em" }}>
              {complianceItems.filter(c => c.status === "done").length} / {complianceItems.length} bajarildi
            </div>
          </div>
        </div>
        <div style={{ width: 1, height: 32, background: "var(--border-default)" }}/>
        <div style={{
          display: "flex", gap: 6, overflowX: "auto",
          flex: 1, paddingBottom: 4,
        }}>
          {complianceItems.map(c => (
            <ComplianceChip key={c.id} status={c.status} label={c.label} flash={c.flash}/>
          ))}
        </div>

        {callState === "active" && (
          <button onClick={onEndCall} style={{
            background: "var(--danger)", color: "white",
            border: "1px solid #B91C1C",
            borderRadius: "var(--r-md)",
            padding: "8px 14px",
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 13, fontWeight: 550, cursor: "pointer",
            flexShrink: 0,
          }}>
            <Icon name="phone-off" size={14}/>
            Yakunlash
          </button>
        )}
      </footer>
    </div>
  );
};

window.AgentDashboard = AgentDashboard;

import type React from 'react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSupervisorFeed } from '../hooks/useSupervisorFeed'
import type { ActiveCall } from '../hooks/useSupervisorFeed'
import { useCallTranscript } from '../hooks/useCallTranscript'
import { useCallHistory } from '../hooks/useCallHistory'
import type { CallHistoryItem } from '../hooks/useCallHistory'
import { fmtTime } from '../lib/format'
import { SentimentBadge } from '../components/primitives/Badge'
import { TranscriptBubble } from '../components/call/TranscriptBubble'
import { DemoModeToggle } from '../components/DemoModeToggle'
import { useDemoModeStore } from '../store/demoModeStore'
import { Icon } from '../components/Icon'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'

// ---------------------------------------------------------------------------
// Demo fixtures
// ---------------------------------------------------------------------------
const now = Date.now()

const DEMO_ACTIVE_CALLS: ActiveCall[] = [
  {
    id: 'demo-1',
    name: 'Bekzod Karimov',
    agentId: 'Diyora S.',
    customerPhone: '+998 99 ••• 12 3•',
    customerRegion: 'Toshkent',
    duration: 142,
    sentiment: 'positive',
    topObjection: null,
    startedAt: new Date(now - 142_000).toISOString(),
    active: true,
    isHero: true,
  },
  {
    id: 'demo-2',
    name: 'Malika Yusupova',
    agentId: 'Jasur T.',
    customerPhone: '+998 91 ••• 45 6•',
    customerRegion: 'Samarqand',
    duration: 67,
    sentiment: 'neutral',
    topObjection: 'Foiz stavkasi baland',
    startedAt: new Date(now - 67_000).toISOString(),
    active: true,
    isHero: false,
  },
  {
    id: 'demo-3',
    name: 'Akbar Toshmatov',
    agentId: 'Nilufar R.',
    customerPhone: '+998 93 ••• 78 9•',
    customerRegion: "Farg'ona",
    duration: 35,
    sentiment: 'negative',
    topObjection: 'Kredit rad etildi',
    startedAt: new Date(now - 35_000).toISOString(),
    active: true,
    isHero: false,
  },
]

const DEMO_HISTORY: CallHistoryItem[] = [
  { id: 'h-1', customerName: 'Bekzod Karimov',  agentId: 'Diyora S.', duration: 312, sentiment: 'positive', outcome: 'completed',   complianceScore: 92, startedAt: new Date(now - 3_600_000).toISOString(), endedAt: null },
  { id: 'h-2', customerName: 'Sarvar Mirzayev',  agentId: 'Jasur T.',  duration: 184, sentiment: 'neutral',  outcome: 'completed',   complianceScore: 75, startedAt: new Date(now - 7_200_000).toISOString(), endedAt: null },
  { id: 'h-3', customerName: 'Zulfiya Rahimova', agentId: 'Nilufar R.',duration: 98,  sentiment: 'negative', outcome: 'failed',      complianceScore: 41, startedAt: new Date(now - 10_800_000).toISOString(), endedAt: null },
  { id: 'h-4', customerName: 'Odil Hasanov',     agentId: 'Diyora S.', duration: 256, sentiment: 'positive', outcome: 'transferred', complianceScore: 88, startedAt: new Date(now - 14_400_000).toISOString(), endedAt: null },
  { id: 'h-5', customerName: 'Gulnora Saidova',  agentId: 'Jasur T.',  duration: 421, sentiment: 'positive', outcome: 'completed',   complianceScore: 96, startedAt: new Date(now - 18_000_000).toISOString(), endedAt: null },
]

type TranscriptEntry = { id: string; speaker: string; text: string; ts: number }
const DEMO_TRANSCRIPTS: Record<string, TranscriptEntry[]> = {
  'demo-1': [
    { id: 't1', speaker: 'agent',    text: "Assalomu alaykum! SQB bank, Diyora murojaat qilyapman. Xizmatdan qanday foydalanishim mumkin?", ts: 4 },
    { id: 't2', speaker: 'customer', text: "Alaykum assalom. Ipoteka krediti olish haqida so'ramoqchi edim.", ts: 11 },
    { id: 't3', speaker: 'agent',    text: "Albatta, yordam beraman. Qancha summaga va qancha muddatga qiziqasiz?", ts: 17 },
    { id: 't4', speaker: 'customer', text: "500 million so'm, 20 yilga. Foiz stavkasi qancha bo'ladi?", ts: 26 },
    { id: 't5', speaker: 'agent',    text: "Hozirgi kurs bo'yicha yillik 18% dan boshlanadi. Birinchi to'lov 20% bo'lishi kerak.", ts: 34 },
    { id: 't6', speaker: 'customer', text: "Tushunarliq. Hujjatlar ro'yxatini yubora olasizmi?", ts: 48 },
    { id: 't7', speaker: 'agent',    text: "Albatta, hoziroq email manzilingizga yo'llaman. Boshqa savollar bormi?", ts: 55 },
  ],
  'demo-2': [
    { id: 't1', speaker: 'agent',    text: "Assalomu alaykum, SQB bank. Jasur murojaat qilyapman.", ts: 3 },
    { id: 't2', speaker: 'customer', text: "Salom. Karta bo'yicha foiz stavkasi nima uchun bu qadar baland?", ts: 9 },
    { id: 't3', speaker: 'agent',    text: "Tushunaman. Kredit karta foizi bozor sharoitiga bog'liq. Ammo sizga maxsus tarif taklif qila olaman.", ts: 18 },
    { id: 't4', speaker: 'customer', text: "Qanday shartlar bilan?", ts: 26 },
  ],
  'demo-3': [
    { id: 't1', speaker: 'agent',    text: "Assalomu alaykum! SQB bank, Nilufar.", ts: 3 },
    { id: 't2', speaker: 'customer', text: "Salom. Kredit arizam rad etildi, sababi nima?", ts: 8 },
    { id: 't3', speaker: 'agent',    text: "Kechirasiz noqulaylik uchun. Tizimni tekshirib ko'raman. Pasport raqamingizni ayta olasizmi?", ts: 15 },
  ],
  'h-1': [
    { id: 't1', speaker: 'agent',    text: "Assalomu alaykum! SQB bank, Diyora.", ts: 3 },
    { id: 't2', speaker: 'customer', text: "Salom. Ipoteka krediti haqida ma'lumot olmoqchi edim.", ts: 9 },
    { id: 't3', speaker: 'agent',    text: "Albatta! Qancha summaga qiziqasiz?", ts: 15 },
    { id: 't4', speaker: 'customer', text: "500 million atrofida. 20 yilga.", ts: 22 },
    { id: 't5', speaker: 'agent',    text: "Yillik 18%, boshlang'ich to'lov 20%. Hujjatlar ro'yxatini email orqali yuboray.", ts: 30 },
    { id: 't6', speaker: 'customer', text: "Juda yaxshi, rahmat!", ts: 38 },
  ],
  'h-2': [
    { id: 't1', speaker: 'agent',    text: "Assalomu alaykum, SQB bank. Jasur.", ts: 2 },
    { id: 't2', speaker: 'customer', text: "Salom. Plastik kartamni bloklash kerak.", ts: 8 },
    { id: 't3', speaker: 'agent',    text: "Tushundim. Kartani hoziroq bloklashim mumkin. Karta raqamini ayta olasizmi?", ts: 14 },
    { id: 't4', speaker: 'customer', text: "Ha, 4444 bilan tugaydi.", ts: 21 },
    { id: 't5', speaker: 'agent',    text: "Karta bloklandi. SMS xabar keladi.", ts: 27 },
  ],
  'h-3': [
    { id: 't1', speaker: 'agent',    text: "Assalomu alaykum! SQB bank, Nilufar.", ts: 3 },
    { id: 't2', speaker: 'customer', text: "Kredit arizam nega rad etildi?", ts: 8 },
    { id: 't3', speaker: 'agent',    text: "Tizimni tekshirdim — kredit tarixi bo'yicha cheklov bor.", ts: 16 },
    { id: 't4', speaker: 'customer', text: "Bu noto'g'ri, men hech qachon kechiktirilmaganman!", ts: 24 },
    { id: 't5', speaker: 'agent',    text: "Shikoyat arizasini rasmiylashtirishingiz mumkin. Yordam beraman.", ts: 32 },
  ],
  'h-4': [
    { id: 't1', speaker: 'agent',    text: "Assalomu alaykum! SQB bank, Diyora.", ts: 3 },
    { id: 't2', speaker: 'customer', text: "Biznes kredit bo'yicha konsultatsiya kerak.", ts: 9 },
    { id: 't3', speaker: 'agent',    text: "Biznes kreditlari bo'limi bilan bog'layman, ular to'liq ma'lumot beradi.", ts: 17 },
    { id: 't4', speaker: 'customer', text: "Yaxshi, bog'lang.", ts: 24 },
  ],
  'h-5': [
    { id: 't1', speaker: 'agent',    text: "Assalomu alaykum! SQB bank, Jasur.", ts: 2 },
    { id: 't2', speaker: 'customer', text: "Depozit shartlari haqida so'ramoqchi edim.", ts: 8 },
    { id: 't3', speaker: 'agent',    text: "Hozir 12 oylik depozit yillik 22%. Minimal summa 1 million so'm.", ts: 16 },
    { id: 't4', speaker: 'customer', text: "Juda yaxshi. Onlayn ochsa bo'ladimi?", ts: 25 },
    { id: 't5', speaker: 'agent',    text: "Ha, SQB Mobile ilovasi orqali 5 daqiqada ochishingiz mumkin.", ts: 32 },
    { id: 't6', speaker: 'customer', text: "Rahmat, hoziroq ko'raman.", ts: 40 },
    { id: 't7', speaker: 'agent',    text: "Marhamat! Boshqa savollar bo'lsa qo'ng'iroq qiling.", ts: 46 },
  ],
}

// ---------------------------------------------------------------------------
// Active call card
// ---------------------------------------------------------------------------
function ActiveCallCard({ call, onClick }: { call: ActiveCall; onClick: () => void }) {
  const [localDuration, setLocalDuration] = useState(call.duration)

  useEffect(() => {
    setLocalDuration(call.duration)
    const id = setInterval(() => setLocalDuration((d) => d + 1), 1000)
    return () => clearInterval(id)
  }, [call.id, call.duration])

  const dotColor =
    call.sentiment === 'positive' ? 'var(--success)' :
    call.sentiment === 'negative' ? 'var(--danger)' : 'var(--text-muted)'

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface-2)',
        border: `1px solid ${call.isHero ? 'var(--sqb-blue-500)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--r-lg)',
        padding: '16px 18px',
        cursor: 'pointer',
        transition: 'border-color 150ms, box-shadow 150ms',
        boxShadow: call.isHero ? '0 0 0 2px var(--sqb-blue-100)' : undefined,
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = 'var(--sqb-blue-500)'
        el.style.boxShadow = '0 2px 12px rgba(0,0,0,0.12)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = call.isHero ? 'var(--sqb-blue-500)' : 'var(--border-subtle)'
        el.style.boxShadow = call.isHero ? '0 0 0 2px var(--sqb-blue-100)' : ''
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0, boxShadow: `0 0 6px ${dotColor}` }} />
          <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>{call.name}</span>
        </div>
        {call.sentiment && <SentimentBadge sentiment={call.sentiment} />}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          <Icon name="user" size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
          {call.agentId}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{call.customerRegion}</span>
        <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
          ⏱ {fmtTime(localDuration)}
        </span>
      </div>

      {call.topObjection && (
        <div style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--warning)', background: 'var(--warning-bg)', borderRadius: 'var(--r-sm)', padding: '3px 8px' }}>
            {call.topObjection}
          </span>
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{call.customerPhone}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Drawer
// ---------------------------------------------------------------------------
function TranscriptDrawer({
  callId,
  onClose,
  demoTranscript,
}: {
  callId: string
  onClose: () => void
  demoTranscript?: TranscriptEntry[]
}) {
  const { data: liveTranscript = [], isLoading } = useCallTranscript(demoTranscript ? null : callId)
  const transcript = demoTranscript ?? liveTranscript
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [transcript.length])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40, animation: 'fade-in 200ms both' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, width: 420, height: '100vh', background: 'var(--surface-1)', borderLeft: '1px solid var(--border-subtle)', zIndex: 50, display: 'flex', flexDirection: 'column', animation: 'slide-in-right 240ms var(--ease-smooth) both' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>Qo'ng'iroq yozuvi</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: 'var(--r-sm)', display: 'flex', alignItems: 'center' }}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <div style={{ margin: '12px 16px 0', padding: '10px 14px', background: 'var(--warning-bg)', border: '1px solid var(--warning)', borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Icon name="lock" size={14} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--warning)', lineHeight: 1.4 }}>Mijoz pasporti ma'lumotlari maxfiylashtirilgan</span>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {isLoading && !demoTranscript && <div style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: 32 }}>Yuklanmoqda…</div>}
          {!isLoading && transcript.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: 32 }}>Yozuv yo'q</div>}
          {transcript.map((entry) => (
            <TranscriptBubble key={entry.id} speaker={entry.speaker} text={entry.text} time={fmtTime(entry.ts)} />
          ))}
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// History table
// ---------------------------------------------------------------------------
const OUTCOME_OPTIONS = [
  { value: '', label: 'Barcha natijalar' },
  { value: 'completed', label: 'Yakunlangan' },
  { value: 'failed', label: 'Muvaffaqiyatsiz' },
  { value: 'transferred', label: "Ko'chirilgan" },
]

function sentimentLabel(s: string) {
  if (s === 'positive') return 'Ijobiy'
  if (s === 'negative') return 'Salbiy'
  return 'Neytral'
}
function sentimentColor(s: string) {
  if (s === 'positive') return 'var(--success)'
  if (s === 'negative') return 'var(--danger)'
  return 'var(--text-muted)'
}

function HistoryTable({ demoData, onRowClick }: { demoData?: CallHistoryItem[]; onRowClick?: (id: string) => void }) {
  const [outcomeFilter, setOutcomeFilter] = useState('')
  const { data: liveHistory = [], isLoading } = useCallHistory(demoData ? {} : { outcome: outcomeFilter || undefined, limit: 50 })

  const history = demoData
    ? demoData.filter((r) => !outcomeFilter || r.outcome === outcomeFilter)
    : liveHistory

  const thStyle: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)', whiteSpace: 'nowrap' }
  const tdStyle: React.CSSProperties = { padding: '10px 14px', fontSize: 13, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)', whiteSpace: 'nowrap' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Natija:</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {OUTCOME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setOutcomeFilter(opt.value)}
              style={{
                padding: '5px 12px', fontSize: 12, borderRadius: 'var(--r-full)',
                border: `1px solid ${outcomeFilter === opt.value ? 'var(--sqb-blue-500)' : 'var(--border-subtle)'}`,
                background: outcomeFilter === opt.value ? 'var(--sqb-blue-50)' : 'var(--surface-2)',
                color: outcomeFilter === opt.value ? 'var(--sqb-blue-700)' : 'var(--text-secondary)',
                cursor: 'pointer', fontWeight: outcomeFilter === opt.value ? 600 : 400, transition: 'all 150ms',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && !demoData ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>Yuklanmoqda…</div>
      ) : history.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>Tarix bo'sh</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Mijoz</th>
                <th style={thStyle}>Agent</th>
                <th style={thStyle}>Davomiyligi</th>
                <th style={thStyle}>Kayfiyat</th>
                <th style={thStyle}>Natija</th>
                <th style={thStyle}>Muvofiqlik</th>
                <th style={thStyle}>Sana</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row: CallHistoryItem) => (
                <tr key={row.id}
                  onClick={() => onRowClick?.(row.id)}
                  style={{ transition: 'background 120ms', cursor: onRowClick ? 'pointer' : 'default' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface-2)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}
                >
                  <td style={tdStyle}>{row.customerName}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{row.agentId}</td>
                  <td style={tdStyle}>{fmtTime(row.duration)}</td>
                  <td style={{ ...tdStyle, color: sentimentColor(row.sentiment) }}>{sentimentLabel(row.sentiment)}</td>
                  <td style={tdStyle}>
                    {row.outcome
                      ? <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 'var(--r-sm)', background: 'var(--surface-3)', color: 'var(--text-secondary)' }}>{row.outcome}</span>
                      : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 60, height: 6, background: 'var(--border-subtle)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${row.complianceScore}%`, background: row.complianceScore >= 80 ? 'var(--success)' : row.complianceScore >= 50 ? 'var(--warning)' : 'var(--danger)', borderRadius: 3, transition: 'width 400ms var(--ease-smooth)' }} />
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.complianceScore}%</span>
                    </div>
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>
                    {new Date(row.startedAt).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function SupervisorPage() {
  const [tab, setTab] = useState<'active' | 'history'>('active')
  const [drawerCallId, setDrawerCallId] = useState<string | null>(null)
  const { activeCalls, isLoading } = useSupervisorFeed()
  const logout = useAuthStore((s) => s.logout)
  const { theme, setTheme } = useThemeStore()
  const demoEnabled = useDemoModeStore((s) => s.enabled)

  const displayCalls = demoEnabled ? DEMO_ACTIVE_CALLS : activeCalls
  const displayLoading = demoEnabled ? false : isLoading

  const handleCardClick = useCallback((id: string) => setDrawerCallId(id), [])
  const handleDrawerClose = useCallback(() => setDrawerCallId(null), [])

  const tabBtn = (value: 'active' | 'history', label: string) => (
    <button
      onClick={() => setTab(value)}
      style={{
        padding: '8px 20px', fontSize: 14,
        fontWeight: tab === value ? 600 : 400,
        color: tab === value ? 'var(--sqb-blue-500)' : 'var(--text-secondary)',
        background: 'none', border: 'none',
        borderBottomWidth: 2, borderBottomStyle: 'solid',
        borderBottomColor: tab === value ? 'var(--sqb-blue-500)' : 'transparent',
        cursor: 'pointer', transition: 'color 150ms, border-color 150ms',
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-1)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', height: 56, borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-2)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 17, color: 'var(--text-primary)' }}>Nazorat paneli</span>
          {displayCalls.length > 0 && (
            <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--r-full)', background: 'var(--sqb-blue-50)', color: 'var(--sqb-blue-700)', border: '1px solid var(--sqb-blue-100)' }}>
              {displayCalls.length} faol
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <DemoModeToggle />
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? "Yorug' rejim" : "Qorong'i rejim"}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: 'var(--r-sm)', display: 'flex', alignItems: 'center' }}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
          </button>
          <button
            onClick={logout}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 'var(--r-sm)' }}
          >
            <Icon name="logout" size={16} />
            Chiqish
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', padding: '0 24px', background: 'var(--surface-2)', flexShrink: 0 }}>
        {tabBtn('active', "Faol qo'ng'iroqlar")}
        {tabBtn('history', 'Tarix')}
      </div>

      {/* Content */}
      <main style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        {tab === 'active' && (
          <>
            {displayLoading && <div style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: 48 }}>Yuklanmoqda…</div>}
            {!displayLoading && displayCalls.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: 80, fontSize: 15 }}>
                <Icon name="phone" size={36} style={{ display: 'block', margin: '0 auto 12px', opacity: 0.3 }} />
                Faol qo'ng'iroqlar yo'q
              </div>
            )}
            {!displayLoading && displayCalls.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {displayCalls.map((call) => (
                  <ActiveCallCard key={call.id} call={call} onClick={() => handleCardClick(call.id)} />
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'history' && <HistoryTable demoData={demoEnabled ? DEMO_HISTORY : undefined} onRowClick={handleCardClick} />}
      </main>

      {/* Drawer */}
      {drawerCallId && (
        <TranscriptDrawer
          callId={drawerCallId}
          onClose={handleDrawerClose}
          demoTranscript={demoEnabled ? (DEMO_TRANSCRIPTS[drawerCallId] ?? []) : undefined}
        />
      )}
    </div>
  )
}

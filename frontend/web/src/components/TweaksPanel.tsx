import type React from 'react'
import { useRef, useCallback, useEffect, useState } from 'react'
import { useThemeStore } from '../store/themeStore'

const PANEL_STYLE = `
.twk-panel{position:fixed;right:16px;bottom:16px;z-index:9999;width:272px;
  max-height:calc(100vh - 32px);display:flex;flex-direction:column;
  background:rgba(250,249,247,.82);color:#29261b;
  -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
  border:.5px solid rgba(255,255,255,.6);border-radius:14px;
  box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.2);
  font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
.twk-hd{display:flex;align-items:center;justify-content:space-between;
  padding:10px 8px 10px 14px;cursor:move;user-select:none;
  border-bottom:.5px solid rgba(0,0,0,.08)}
.twk-hd b{font-size:12px;font-weight:600;letter-spacing:.01em}
.twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);
  width:22px;height:22px;border-radius:6px;cursor:default;font-size:13px;line-height:22px;text-align:center}
.twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
.twk-body{padding:12px 14px 14px;display:flex;flex-direction:column;gap:12px;
  overflow-y:auto;min-height:0;scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}
.twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
  color:rgba(41,38,27,.45);padding-bottom:4px;border-bottom:.5px solid rgba(0,0,0,.08)}
.twk-row{display:flex;flex-direction:column;gap:6px}
.twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
.twk-lbl{font-size:11.5px;font-weight:500;color:rgba(41,38,27,.72);display:flex;justify-content:space-between}
.twk-val{color:rgba(41,38,27,.45);font-variant-numeric:tabular-nums}
.twk-slider{appearance:none;-webkit-appearance:none;width:100%;height:4px;
  border-radius:999px;background:rgba(0,0,0,.12);outline:none}
.twk-slider::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;
  border-radius:50%;background:#fff;border:.5px solid rgba(0,0,0,.12);
  box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}
.twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;background:rgba(0,0,0,.06)}
.twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;
  background:rgba(255,255,255,.9);box-shadow:0 1px 2px rgba(0,0,0,.12);
  transition:left .15s,width .15s}
.twk-seg button{position:relative;z-index:1;flex:1;border:0;background:transparent;
  color:inherit;font:inherit;font-weight:500;height:22px;border-radius:6px;cursor:default;padding:0;font-size:11.5px}
.twk-toggle{position:relative;width:32px;height:18px;border:0;border-radius:999px;
  background:rgba(0,0,0,.15);transition:background .15s;cursor:default;padding:0;flex-shrink:0}
.twk-toggle[data-on="1"]{background:#34c759}
.twk-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
  background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s;display:block}
.twk-toggle[data-on="1"] i{transform:translateX(14px)}
`

function TweakSection({ label }: { label: string }) {
  return <div className="twk-sect">{label}</div>
}

function TweakSlider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (v: number) => void
}) {
  return (
    <div className="twk-row">
      <div className="twk-lbl">
        <span>{label}</span>
        <span className="twk-val">{value}{unit}</span>
      </div>
      <input
        type="range"
        className="twk-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

function TweakToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="twk-row twk-row-h">
      <div className="twk-lbl"><span>{label}</span></div>
      <button
        type="button"
        className="twk-toggle"
        data-on={value ? '1' : '0'}
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
      >
        <i />
      </button>
    </div>
  )
}

function TweakRadio({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  const n = options.length
  const idx = Math.max(0, options.findIndex((o) => o.value === value))
  return (
    <div className="twk-row">
      <div className="twk-lbl"><span>{label}</span></div>
      <div className="twk-seg">
        <div
          className="twk-seg-thumb"
          style={{
            left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
            width: `calc((100% - 4px) / ${n})`,
          }}
        />
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function TweaksPanel() {
  const { theme, blueHue, density, setTheme, setBlueHue, setDensity } = useThemeStore()
  const panelRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef({ x: 16, y: 16 })
  const [, forceRender] = useState(0)

  const clampToViewport = useCallback(() => {
    const panel = panelRef.current
    if (!panel) return
    const w = panel.offsetWidth
    const h = panel.offsetHeight
    const PAD = 16
    offsetRef.current = {
      x: Math.min(Math.max(PAD, window.innerWidth - w - PAD), Math.max(PAD, offsetRef.current.x)),
      y: Math.min(Math.max(PAD, window.innerHeight - h - PAD), Math.max(PAD, offsetRef.current.y)),
    }
    forceRender((n) => n + 1)
  }, [])

  useEffect(() => {
    clampToViewport()
    window.addEventListener('resize', clampToViewport)
    return () => window.removeEventListener('resize', clampToViewport)
  }, [clampToViewport])

  const onDragStart = useCallback((e: React.MouseEvent) => {
    const panel = panelRef.current
    if (!panel) return
    const r = panel.getBoundingClientRect()
    const sx = e.clientX
    const sy = e.clientY
    const startRight = window.innerWidth - r.right
    const startBottom = window.innerHeight - r.bottom
    const move = (ev: MouseEvent) => {
      const PAD = 16
      offsetRef.current = {
        x: Math.max(PAD, startRight - (ev.clientX - sx)),
        y: Math.max(PAD, startBottom - (ev.clientY - sy)),
      }
      if (panelRef.current) {
        panelRef.current.style.right = offsetRef.current.x + 'px'
        panelRef.current.style.bottom = offsetRef.current.y + 'px'
      }
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }, [])

  const huePreview = `hsl(${blueHue} 88% 38%)`

  return (
    <>
      <style>{PANEL_STYLE}</style>
      <div
        ref={panelRef}
        className="twk-panel"
        style={{ right: offsetRef.current.x, bottom: offsetRef.current.y }}
      >
        <div className="twk-hd" onMouseDown={onDragStart}>
          <b>Tweaks</b>
          <span style={{ fontSize: 10, color: 'rgba(41,38,27,.4)', fontStyle: 'italic' }}>
            ?tweaks=1
          </span>
        </div>
        <div className="twk-body">
          <TweakSection label="Mavzu" />
          <TweakToggle
            label="Qorong'i rejim"
            value={theme === 'dark'}
            onChange={(v) => setTheme(v ? 'dark' : 'light')}
          />
          <TweakRadio
            label="Zichlik"
            value={density}
            options={[
              { value: 'comfortable', label: 'Keng' },
              { value: 'compact', label: 'Ixcham' },
            ]}
            onChange={(v) => setDensity(v as 'comfortable' | 'compact')}
          />

          <TweakSection label="Brand rangi" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: huePreview,
                border: '.5px solid rgba(0,0,0,.12)',
                flexShrink: 0,
              }}
            />
            <TweakSlider
              label="Ko'k rang toni"
              value={blueHue}
              min={160}
              max={260}
              unit="°"
              onChange={setBlueHue}
            />
          </div>

          <TweakSection label="Hozirgi qiymatlar" />
          <div style={{ fontSize: 11, color: 'rgba(41,38,27,.55)', lineHeight: 1.7 }}>
            <div>Theme: <b>{theme}</b></div>
            <div>Density: <b>{density}</b></div>
            <div>Blue hue: <b>{blueHue}°</b></div>
          </div>
        </div>
      </div>
    </>
  )
}

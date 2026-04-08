import React, { useEffect, useRef, useState } from 'react'

// Same chemistry as v1, but:
//   - terse layout / minimal prose
//   - Q dot has an arrow pointing toward K
//   - the number line is just a scale, no "favored" zones (those would imply
//     forward/reverse depends on Q vs 1, not Q vs K)
//   - equilibration animation has a fixed time constant regardless of how
//     far Q is from K (we solve for the equilibrium extent ξ in closed form
//     and animate moles toward the target with a fixed fractional step)
//   - horizontal reaction-row table like v1

const R = 8.314
const DELTA_H = -50000 // J/mol — exothermic
const T_REF = 300 // K (K = 1 here)

const DEFAULTS = {
  volume: 1.0,
  temperature: T_REF,
  molsA: 2.0,
  molsB: 0.25,
  molsC: 0.5,
  molsD: 2.0,
}

const MIN_MOLES = 0.01
const STEP_DELAY_MS = 50
const ALPHA = 0.15 // fraction of remaining distance per step → ~1.5 s to settle
const SNAP_TOL = 1e-4

const fmt = (n: number) => {
  if (!isFinite(n)) return '—'
  if (n === 0) return '0'
  const a = Math.abs(n)
  if (a >= 0.01 && a < 1000) return parseFloat(n.toFixed(3)).toString()
  return n.toExponential(2)
}

const fmtChange = (n: number) => {
  if (Math.abs(n) < 0.001) return '0'
  return (n > 0 ? '+' : '−') + fmt(Math.abs(n))
}

type Moles = { A: number; B: number; C: number; D: number }

const EquilibriumV2: React.FC = () => {
  const [volume, setVolume] = useState(DEFAULTS.volume)
  const [temperature, setTemperature] = useState(DEFAULTS.temperature)
  const [molsA, setMolsA] = useState(DEFAULTS.molsA)
  const [molsB, setMolsB] = useState(DEFAULTS.molsB)
  const [molsC, setMolsC] = useState(DEFAULTS.molsC)
  const [molsD, setMolsD] = useState(DEFAULTS.molsD)
  // ICE-table "Initial" row — snapshot of moles at the most recent Reset
  const [initial, setInitial] = useState<Moles>({
    A: DEFAULTS.molsA, B: DEFAULTS.molsB, C: DEFAULTS.molsC, D: DEFAULTS.molsD,
  })
  const [isEquilibrating, setIsEquilibrating] = useState(false)
  const targetRef = useRef<Moles | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Van't Hoff toy: K = 1 at T_REF, decreases with T (since ΔH < 0)
  const K = Math.exp(-(DELTA_H / R) * (1 / temperature - 1 / T_REF))

  // Treat container volume as the gas volume (matches v1; solid volumes are
  // small and ignoring them keeps the initial state exactly at equilibrium)
  const concB = molsB / volume
  const concC = molsC / volume
  const Q = (concC * concC) / Math.max(concB, 1e-12)

  const logRatio = Math.log(Q / K)
  const atEquilibrium = Math.abs(logRatio) < SNAP_TOL
  const shiftsForward = !atEquilibrium && logRatio < 0
  const shiftsReverse = !atEquilibrium && logRatio > 0

  // Number-line positions on a log10 scale
  const logMin = -3
  const logMax = 3
  const clamp = (v: number) => Math.min(Math.max(v, 0), 100)
  const qPos = clamp(((Math.log10(Q) - logMin) / (logMax - logMin)) * 100)
  const kPos = clamp(((Math.log10(K) - logMin) / (logMax - logMin)) * 100)

  // Solve for the extent of reaction ξ (forward-positive) such that Q = K
  // after the change. With nB → nB - ξ and nC → nC + 2ξ:
  //   (nC + 2ξ)² = K · V · (nB - ξ)
  //   4ξ² + (4nC + KV) ξ + (nC² - KV·nB) = 0
  const computeTarget = (): Moles | null => {
    const a = 4
    const b = 4 * molsC + K * volume
    const c = molsC * molsC - K * volume * molsB
    const disc = b * b - 4 * a * c
    if (disc < 0) return null
    const xi = (-b + Math.sqrt(disc)) / (2 * a)
    const xiMin = -molsC / 2 + MIN_MOLES
    const xiMax = molsB - MIN_MOLES
    const xiC = Math.max(xiMin, Math.min(xiMax, xi))
    return {
      A: Math.max(molsA - 3 * xiC, 0),
      B: Math.max(molsB - xiC, MIN_MOLES),
      C: Math.max(molsC + 2 * xiC, MIN_MOLES),
      D: Math.max(molsD + xiC, 0),
    }
  }

  // Animate moles toward the precomputed target with a fixed fractional step.
  // Time to reach equilibrium is independent of how far Q started from K.
  useEffect(() => {
    if (!isEquilibrating || !targetRef.current) return
    const tgt = targetRef.current
    const dist =
      Math.abs(molsA - tgt.A) +
      Math.abs(molsB - tgt.B) +
      Math.abs(molsC - tgt.C) +
      Math.abs(molsD - tgt.D)
    if (dist < SNAP_TOL) {
      setMolsA(tgt.A)
      setMolsB(tgt.B)
      setMolsC(tgt.C)
      setMolsD(tgt.D)
      setIsEquilibrating(false)
      targetRef.current = null
      return
    }
    timeoutRef.current = setTimeout(() => {
      setMolsA(prev => prev + ALPHA * (tgt.A - prev))
      setMolsB(prev => prev + ALPHA * (tgt.B - prev))
      setMolsC(prev => prev + ALPHA * (tgt.C - prev))
      setMolsD(prev => prev + ALPHA * (tgt.D - prev))
    }, STEP_DELAY_MS)
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [isEquilibrating, molsA, molsB, molsC, molsD])

  const equilibrate = () => {
    if (atEquilibrium) return
    targetRef.current = computeTarget()
    if (targetRef.current) setIsEquilibrating(true)
  }

  const reset = () => {
    setIsEquilibrating(false)
    targetRef.current = null
    setVolume(DEFAULTS.volume)
    setTemperature(DEFAULTS.temperature)
    setMolsA(DEFAULTS.molsA)
    setMolsB(DEFAULTS.molsB)
    setMolsC(DEFAULTS.molsC)
    setMolsD(DEFAULTS.molsD)
    setInitial({ A: DEFAULTS.molsA, B: DEFAULTS.molsB, C: DEFAULTS.molsC, D: DEFAULTS.molsD })
  }

  // Each new "stress" snapshots Initial to the post-perturbation state, so the
  // Change row starts from zero and then fills in with the reaction extent.
  const adjust = (which: 'B' | 'C' | 'D', delta: number) => {
    const next: Moles = { A: molsA, B: molsB, C: molsC, D: molsD }
    if (which === 'B') next.B = Math.max(molsB + delta, MIN_MOLES)
    if (which === 'C') next.C = Math.max(molsC + delta, MIN_MOLES)
    if (which === 'D') next.D = Math.max(molsD + delta, 0)
    setMolsA(next.A); setMolsB(next.B); setMolsC(next.C); setMolsD(next.D)
    setInitial(next)
  }

  // V and T changes also count as stresses — snapshot Initial so Change starts
  // fresh from the moment the slider moves.
  const stressInitial = () => {
    setInitial({ A: molsA, B: molsB, C: molsC, D: molsD })
  }

  // Compact status pill text
  let statusBg = 'bg-emerald-50 border-emerald-300 text-emerald-900'
  let statusText: React.ReactNode = 'Q = K  —  at equilibrium'
  if (shiftsForward) {
    statusBg = 'bg-blue-50 border-blue-300 text-blue-900'
    statusText = (
      <>Q &lt; K  →  shifts forward <span className="opacity-70">(K/Q = {fmt(K / Q)})</span></>
    )
  } else if (shiftsReverse) {
    statusBg = 'bg-rose-50 border-rose-300 text-rose-900'
    statusText = (
      <>Q &gt; K  →  shifts reverse <span className="opacity-70">(Q/K = {fmt(Q / K)})</span></>
    )
  }

  // Solid layer heights (px) inside the vial.
  const VIAL_H = 140
  const VIAL_W = 70
  const SOLID_SCALE = 22 // px per mol
  const aH = Math.min(molsA * SOLID_SCALE, VIAL_H - 4)
  const dH = Math.min(molsD * SOLID_SCALE, VIAL_H - 4 - aH)

  return (
    <div className="w-full max-w-3xl mx-auto p-4 space-y-4">
      {/* Reaction equation + small vial visual */}
      <div className="flex items-center justify-center gap-6">
        <div className="text-center text-2xl font-medium tracking-wide">
          3<span className="text-gray-700">A(s)</span> +
          <span className="text-blue-700"> B(g)</span>  ⇌
          2<span className="text-blue-700">C(g)</span> +
          <span className="text-gray-700"> D(s)</span>
        </div>
        <div className="flex flex-col items-center">
          <div
            className="relative border-2 border-gray-500 border-t-0 rounded-b bg-slate-100 overflow-hidden"
            style={{ width: VIAL_W, height: VIAL_H }}
            aria-label="Container with solids A and D"
          >
            {/* D (yellow) sits on top of A */}
            <div
              className={`absolute left-0 right-0 transition-[height] duration-200 ease-linear ${
                shiftsForward ? 'animate-pulse' : ''
              }`}
              style={{
                bottom: aH,
                height: dH,
                background: '#fde047', // yellow-300
                borderTop: shiftsForward ? '3px solid #f59e0b' : '1px solid #ca8a04',
              }}
              title={`D(s) — ${fmt(molsD)} mol`}
            />
            {/* A (white) at the bottom */}
            <div
              className={`absolute left-0 right-0 transition-[height] duration-200 ease-linear ${
                shiftsReverse ? 'animate-pulse' : ''
              }`}
              style={{
                bottom: 0,
                height: aH,
                background: '#ffffff',
                borderTop: shiftsReverse ? '3px solid #f59e0b' : '1px solid #9ca3af',
              }}
              title={`A(s) — ${fmt(molsA)} mol`}
            />
          </div>
          <div className="text-[10px] text-gray-500 mt-1 flex gap-2">
            <span><span className="inline-block w-2 h-2 bg-[#f9fafb] border border-gray-400 align-middle mr-1" />A</span>
            <span><span className="inline-block w-2 h-2 bg-[#fde047] border border-yellow-700 align-middle mr-1" />D</span>
          </div>
        </div>
      </div>

      {/* Q and K values */}
      <div className="bg-white border border-gray-200 rounded p-3 text-center font-mono">
        <div className="text-sm text-gray-600 font-sans">K = [C]² ⁄ [B]</div>
        <div className="mt-1">
          Q = ({fmt(concC)})² ⁄ ({fmt(concB)}) = <strong className="text-amber-700">{fmt(Q)}</strong>
          <span className="ml-4">K = <strong>{fmt(K)}</strong></span>
        </div>
      </div>

      {/* Status pill */}
      <div className={`border rounded px-3 py-2 text-center text-sm font-medium ${statusBg}`}>
        {statusText}
      </div>

      {/* Number line — plain log scale, K marker + Q dot with arrow */}
      <div className="relative h-16 select-none px-2">
        {/* axis */}
        <div className="absolute top-9 left-2 right-2 h-px bg-gray-400" />
        <div className="absolute top-7 left-2 w-px h-5 bg-gray-400" />
        <div className="absolute top-7 right-2 w-px h-5 bg-gray-400" />

        {/* K marker (above the axis) */}
        <div
          className="absolute"
          style={{ left: `calc(${kPos}% * (100% - 16px) / 100% + 8px)`, top: 0, transform: 'translateX(-50%)' }}
        >
          <div className="text-[11px] text-gray-700 font-semibold whitespace-nowrap">
            K = {fmt(K)}
          </div>
          <div className="w-px h-6 bg-gray-700 mx-auto mt-0.5" />
        </div>

        {/* Q dot (on the axis) with attached SVG arrow toward K */}
        <div
          className="absolute"
          style={{ left: `calc(${qPos}% * (100% - 16px) / 100% + 8px)`, top: 28, transform: 'translateX(-50%)' }}
        >
          <QDotWithArrow
            direction={shiftsForward ? 'right' : shiftsReverse ? 'left' : 'none'}
          />
          <div className="text-[11px] text-amber-700 font-semibold mt-0.5 text-center whitespace-nowrap">
            Q = {fmt(Q)}
          </div>
        </div>

        {/* axis labels */}
        <div className="absolute left-0 top-[60px] text-[10px] text-gray-500">10⁻³</div>
        <div className="absolute right-0 top-[60px] text-[10px] text-gray-500">10³</div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
        <div className="space-y-2 border border-gray-200 rounded p-3">
          <label className="block text-sm">
            Volume: <span className="font-medium">{volume.toFixed(2)} L</span>
          </label>
          <input
            type="range" min={0.5} max={5} step={0.1} value={volume}
            onChange={(e) => { setVolume(Number(e.target.value)); stressInitial() }}
            className="w-full" disabled={isEquilibrating}
          />
          <label className="block text-sm pt-1">
            Temperature: <span className="font-medium">{temperature.toFixed(0)} K</span>
          </label>
          <input
            type="range" min={220} max={460} step={1} value={temperature}
            onChange={(e) => { setTemperature(Number(e.target.value)); stressInitial() }}
            className="w-full" disabled={isEquilibrating}
          />
        </div>

        <div className="border border-gray-200 rounded p-3">
          <div className="grid grid-cols-3 gap-2">
            <ControlGroup label="B(g)" onAdd={() => adjust('B', +0.2)} onSub={() => adjust('B', -0.1)} disabled={isEquilibrating} />
            <ControlGroup label="C(g)" onAdd={() => adjust('C', +0.2)} onSub={() => adjust('C', -0.1)} disabled={isEquilibrating} />
            <ControlGroup label="D(s)" onAdd={() => adjust('D', +0.5)} onSub={() => adjust('D', -0.5)} disabled={isEquilibrating} />
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={equilibrate}
              disabled={isEquilibrating || atEquilibrium}
              className={`flex-1 px-3 py-2 rounded text-white text-sm ${
                isEquilibrating
                  ? 'bg-gray-400'
                  : atEquilibrium
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isEquilibrating ? 'Equilibrating…' : atEquilibrium ? 'At equilibrium' : 'Run to equilibrium'}
            </button>
            <button
              onClick={reset}
              disabled={isEquilibrating}
              className="px-3 py-2 rounded border border-gray-300 hover:bg-gray-50 text-sm disabled:opacity-50"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* ICE table — Initial / Change / Equilibrium + current Conc */}
      <table className="w-full mt-2 border-collapse border border-gray-300 text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2"></th>
            <th className="border p-2">3A(s)</th>
            <th className="border p-2"></th>
            <th className="border p-2">B(g)</th>
            <th className="border p-2 text-center">⇌</th>
            <th className="border p-2">2C(g)</th>
            <th className="border p-2"></th>
            <th className="border p-2">D(s)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border p-2 font-medium">Initial</td>
            <td className="border p-2 text-right text-gray-500">{fmt(initial.A)}</td>
            <td className="border p-2"></td>
            <td className="border p-2 text-right">{fmt(initial.B)}</td>
            <td className="border p-2"></td>
            <td className="border p-2 text-right">{fmt(initial.C)}</td>
            <td className="border p-2"></td>
            <td className="border p-2 text-right text-gray-500">{fmt(initial.D)}</td>
          </tr>
          <tr>
            <td className="border p-2 font-medium">Change</td>
            <td className="border p-2 text-right text-gray-500">{fmtChange(molsA - initial.A)}</td>
            <td className="border p-2"></td>
            <td className="border p-2 text-right">{fmtChange(molsB - initial.B)}</td>
            <td className="border p-2"></td>
            <td className="border p-2 text-right">{fmtChange(molsC - initial.C)}</td>
            <td className="border p-2"></td>
            <td className="border p-2 text-right text-gray-500">{fmtChange(molsD - initial.D)}</td>
          </tr>
          <tr>
            <td className="border p-2 font-medium">Equilibrium</td>
            <td className="border p-2 text-right text-gray-500">{fmt(molsA)}</td>
            <td className="border p-2"></td>
            <td className="border p-2 text-right">{fmt(molsB)}</td>
            <td className="border p-2"></td>
            <td className="border p-2 text-right">{fmt(molsC)}</td>
            <td className="border p-2"></td>
            <td className="border p-2 text-right text-gray-500">{fmt(molsD)}</td>
          </tr>
          <tr className="bg-gray-50">
            <td className="border p-2 font-medium">Conc. (M)</td>
            <td className="border p-2 text-right text-gray-400">—</td>
            <td className="border p-2"></td>
            <td className="border p-2 text-right">{fmt(concB)}</td>
            <td className="border p-2"></td>
            <td className="border p-2 text-right">{fmt(concC)}</td>
            <td className="border p-2"></td>
            <td className="border p-2 text-right text-gray-400">—</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// Q dot drawn as an SVG so the directional arrow attaches cleanly to it.
const QDotWithArrow: React.FC<{ direction: 'left' | 'right' | 'none' }> = ({ direction }) => {
  const W = 60
  const H = 16
  const cx = W / 2
  const cy = H / 2
  const r = 5
  const stroke = '#d97706' // amber-600
  const fill = '#f59e0b' // amber-500
  return (
    <svg width={W} height={H} className="block mx-auto overflow-visible">
      {direction === 'right' && (
        <>
          <line
            x1={cx} y1={cy} x2={W - 8} y2={cy}
            stroke={stroke} strokeWidth={2.5} strokeLinecap="round"
          />
          <polygon
            points={`${W - 2},${cy} ${W - 10},${cy - 5} ${W - 10},${cy + 5}`}
            fill={stroke}
          />
        </>
      )}
      {direction === 'left' && (
        <>
          <line
            x1={8} y1={cy} x2={cx} y2={cy}
            stroke={stroke} strokeWidth={2.5} strokeLinecap="round"
          />
          <polygon
            points={`2,${cy} 10,${cy - 5} 10,${cy + 5}`}
            fill={stroke}
          />
        </>
      )}
      {/* Dot painted on top of the line so it visually anchors the arrow */}
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke="white" strokeWidth={2} />
    </svg>
  )
}

const ControlGroup: React.FC<{
  label: string
  onAdd: () => void
  onSub: () => void
  disabled?: boolean
}> = ({ label, onAdd, onSub, disabled }) => (
  <div className="flex flex-col items-stretch gap-1">
    <div className="text-center text-sm font-medium">{label}</div>
    <div className="flex gap-1">
      <button
        onClick={onSub}
        disabled={disabled}
        className="flex-1 px-1 py-1 rounded border border-gray-300 hover:bg-gray-50 text-sm disabled:opacity-50"
        aria-label={`Remove ${label}`}
      >
        −
      </button>
      <button
        onClick={onAdd}
        disabled={disabled}
        className="flex-1 px-1 py-1 rounded border border-gray-300 hover:bg-gray-50 text-sm disabled:opacity-50"
        aria-label={`Add ${label}`}
      >
        +
      </button>
    </div>
  </div>
)

export default EquilibriumV2

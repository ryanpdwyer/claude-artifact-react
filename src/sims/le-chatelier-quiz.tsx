import React, { Fragment, useEffect, useState } from 'react'

// Le Chatelier walk-through quiz pages.
//
// For each stress, the card reveals an animated explanation in three stages:
//   1. Stress arrow appears on the affected species (or "heat" / V / water).
//   2. The Q-vs-K number line shows Q displaced from K with an arrow back.
//   3. Response arrows appear on every species that changes when the reaction
//      shifts. The asked quantity is highlighted.
//
// Wording is kept gen-chem level: "pure solids don't appear in K", not
// "activity is one".

// ---------- Reaction definitions ----------

type Sp = {
  key: string
  coef: number
  node: React.ReactNode
  state: 's' | 'g' | 'aq' | 'l'
}

type RxnDef = {
  reactants: Sp[]
  products: Sp[]
  // Qualitative K magnitude — controls where the K marker sits on the
  // number line so students see at a glance whether reactants or products
  // are favored.
  Ksize: 'small' | 'large'
}

const RXN_PBS: RxnDef = {
  // PbS is extremely insoluble (Ksp ≈ 10⁻²⁸); even with H⁺ helping, the
  // overall K is roughly 10⁻⁷ — strongly reactant-favored.
  Ksize: 'small',
  reactants: [
    { key: 'H+', coef: 2, node: <>H<sup>+</sup></>, state: 'aq' },
    { key: 'PbS', coef: 1, node: 'PbS', state: 's' },
  ],
  products: [
    { key: 'Pb2+', coef: 1, node: <>Pb<sup>2+</sup></>, state: 'aq' },
    { key: 'H2S', coef: 1, node: <>H<sub>2</sub>S</>, state: 'g' },
  ],
}

const RXN_CAOH2: RxnDef = {
  // Limewater absorbing CO₂ to form Ca(HCO₃)₂ goes essentially to
  // completion at room T — K is large, products are favored.
  Ksize: 'large',
  reactants: [
    { key: 'CO2', coef: 2, node: <>CO<sub>2</sub></>, state: 'g' },
    { key: 'CaOH2', coef: 1, node: <>Ca(OH)<sub>2</sub></>, state: 's' },
  ],
  products: [
    { key: 'Ca2+', coef: 1, node: <>Ca<sup>2+</sup></>, state: 'aq' },
    { key: 'HCO3-', coef: 2, node: <>HCO<sub>3</sub><sup>−</sup></>, state: 'aq' },
  ],
}

// ---------- Question type ----------

type Stress =
  | { kind: 'species'; key: string; dir: 'up' | 'down' }
  | { kind: 'heat'; side: 'left' | 'right'; dir: 'up' | 'down' }
  | { kind: 'volume'; dir: 'up' | 'down' }
  | { kind: 'water' }
  | { kind: 'solid'; key: string }

type Shift = 'left' | 'right' | 'none'
type Change = 'I' | 'D' | 'U'

type Question = {
  letter: string
  bonus?: boolean
  stressLabel: React.ReactNode
  asked: React.ReactNode
  askedKey: string // matches a species key, or 'K'
  stress: Stress
  shift: Shift
  change: Change
  caption: React.ReactNode
}

// ---------- Visual: species chip with optional stress + response arrows ----------

const SpeciesChip: React.FC<{
  sp: Sp
  stressDir?: 'up' | 'down'
  stressCount?: number // 1 = one big direct stress; >1 = multiple smaller (V or H₂O)
  responseDir?: 'up' | 'down'
  isAsked?: boolean
  stage: number
}> = ({ sp, stressDir, stressCount = 0, responseDir, isAsked, stage }) => {
  const showStress = stressDir && stressCount > 0 && stage >= 1
  const showResponse = responseDir && stage >= 3
  const stateColor =
    sp.state === 's' || sp.state === 'l' ? 'text-gray-500' : 'text-gray-700'
  const stressChar = stressDir === 'up' ? '↑' : '↓'
  // Same size whether single or multi — count is conveyed by repetition.
  const stressClass = 'text-3xl tracking-tighter'
  return (
    <div className="inline-flex flex-col items-center mx-1 align-bottom">
      <div className="h-7 flex items-end justify-center gap-1 leading-none">
        {showStress && (
          <span
            className={`text-rose-600 font-bold transition-opacity duration-500 ${stressClass}`}
            aria-label="stress"
          >
            {stressChar.repeat(stressCount)}
          </span>
        )}
        {showResponse && (
          <span
            className="text-blue-600 text-base font-bold transition-opacity duration-500"
            aria-label="response"
          >
            {responseDir === 'up' ? '↑' : '↓'}
          </span>
        )}
      </div>
      <div
        className={`whitespace-nowrap ${
          isAsked ? 'bg-amber-100 px-1 rounded ring-1 ring-amber-300' : ''
        }`}
      >
        {sp.coef > 1 && <span>{sp.coef}</span>}
        <span>{sp.node}</span>
        <span className={`text-xs ${stateColor}`}>({sp.state})</span>
      </div>
    </div>
  )
}

// ---------- Visual: full reaction with optional heat term ----------

const ReactionVisual: React.FC<{
  rxn: RxnDef
  q: Question
  stage: number
}> = ({ rxn, q, stage }) => {
  // Stress arrows. Pure solids never get a stress arrow because their
  // concentration is constant — arrows would be misleading.
  const stressArrows: Record<string, 'up' | 'down'> = {}
  const stressCounts: Record<string, number> = {}
  const allSp = [...rxn.reactants, ...rxn.products]

  if (q.stress.kind === 'species') {
    // Single big direct arrow on the affected species.
    stressArrows[q.stress.key] = q.stress.dir
    stressCounts[q.stress.key] = 1
  } else if (q.stress.kind === 'volume') {
    // Volume change affects gas concentrations only.
    // Compress (V↓) → [gas] ↑;  expand (V↑) → [gas] ↓.
    const dir: 'up' | 'down' = q.stress.dir === 'down' ? 'up' : 'down'
    allSp.forEach(s => {
      if (s.state === 'g') {
        stressArrows[s.key] = dir
        stressCounts[s.key] = s.coef
      }
    })
  } else if (q.stress.kind === 'water') {
    // Adding water dilutes aqueous species only.
    allSp.forEach(s => {
      if (s.state === 'aq') {
        stressArrows[s.key] = 'down'
        stressCounts[s.key] = s.coef
      }
    })
  }

  // Response arrow on the asked species only (skip the stressed species —
  // its response doesn't fully cancel the stress). Solids ARE allowed to
  // get response arrows because their moles do change.
  const responseArrows: Record<string, 'up' | 'down'> = {}
  const askedSpeciesIsStressed = stressArrows[q.askedKey] !== undefined
  if (!askedSpeciesIsStressed && q.shift !== 'none') {
    const isReactant = rxn.reactants.some(s => s.key === q.askedKey)
    const isProduct = rxn.products.some(s => s.key === q.askedKey)
    if (isReactant) {
      responseArrows[q.askedKey] = q.shift === 'left' ? 'up' : 'down'
    } else if (isProduct) {
      responseArrows[q.askedKey] = q.shift === 'right' ? 'up' : 'down'
    }
  }

  const heatStress = q.stress.kind === 'heat' ? q.stress : null

  const renderSide = (species: Sp[]) =>
    species.map((sp, i) => (
      <Fragment key={sp.key}>
        <SpeciesChip
          sp={sp}
          stressDir={stressArrows[sp.key]}
          stressCount={stressCounts[sp.key]}
          responseDir={responseArrows[sp.key]}
          isAsked={q.askedKey === sp.key && stage >= 3}
          stage={stage}
        />
        {i < species.length - 1 && <span className="text-xl mx-0.5">+</span>}
      </Fragment>
    ))

  return (
    <div className="flex flex-wrap items-end justify-center text-xl font-medium gap-y-1">
      {heatStress && heatStress.side === 'left' && stage >= 1 && (
        <>
          <HeatBadge dir={heatStress.dir} />
          <span className="text-xl mx-0.5">+</span>
        </>
      )}
      {renderSide(rxn.reactants)}
      <span className="text-2xl mx-2">⇌</span>
      {renderSide(rxn.products)}
      {heatStress && heatStress.side === 'right' && stage >= 1 && (
        <>
          <span className="text-xl mx-0.5">+</span>
          <HeatBadge dir={heatStress.dir} />
        </>
      )}
    </div>
  )
}

const HeatBadge: React.FC<{ dir: 'up' | 'down' }> = ({ dir }) => (
  <div className="inline-flex flex-col items-center mx-1 align-bottom">
    <div className="h-5 flex items-end justify-center leading-none">
      <span className="text-rose-600 text-base font-bold">
        {dir === 'up' ? '↑' : '↓'}
      </span>
    </div>
    <div className="px-1 rounded bg-rose-50 border border-rose-200 text-rose-900">
      heat
    </div>
  </div>
)

// ---------- Mini Q vs K number line with animated arrow ----------

type KMark = { pct: number; label: React.ReactNode; color?: string }

type LinePos = {
  // One marker for non-T stresses; two for T (K_RT + K_cold/K_hot).
  kMarks: KMark[]
  // The K position that the Q-arrow should point toward (the new K when
  // temperature changed; otherwise the only K).
  kArrowTarget: number
  qInitial: number
  qEnd: number
}

const computeLinePos = (rxn: RxnDef, q: Question): LinePos => {
  const kInitial = rxn.Ksize === 'small' ? 22 : 78
  const displace = 22
  const clamp = (v: number) => Math.max(5, Math.min(95, v))

  if (q.stress.kind === 'heat') {
    // K moves; both K_RT and K_cold/K_hot stay visible.
    // Endothermic (heat on left): cooling lowers K, heating raises K.
    // Exothermic (heat on right): cooling raises K, heating lowers K.
    let kEnd: number
    if (q.stress.side === 'left') {
      kEnd = q.stress.dir === 'down'
        ? clamp(kInitial - displace)
        : clamp(kInitial + displace)
    } else {
      kEnd = q.stress.dir === 'down'
        ? clamp(kInitial + displace)
        : clamp(kInitial - displace)
    }
    const endLabel = q.stress.dir === 'down'
      ? <>K<sub>cold</sub></>
      : <>K<sub>hot</sub></>
    return {
      kMarks: [
        { pct: kInitial, label: <>K<sub>RT</sub></>, color: '#9ca3af' },
        { pct: kEnd, label: endLabel, color: '#1d4ed8' },
      ],
      kArrowTarget: kEnd,
      // Q stays at the original equilibrium position.
      qInitial: kInitial,
      qEnd: kInitial,
    }
  }

  // Non-temperature stress: Q displaces, K stays.
  let qEnd = kInitial
  if (q.shift === 'left') qEnd = clamp(kInitial + displace)
  else if (q.shift === 'right') qEnd = clamp(kInitial - displace)
  return {
    kMarks: [{ pct: kInitial, label: 'K', color: '#374151' }],
    kArrowTarget: kInitial,
    qInitial: kInitial,
    qEnd,
  }
}

const KMarker: React.FC<{ mark: KMark; visible: boolean }> = ({ mark, visible }) => (
  <div
    className="absolute transition-opacity duration-500"
    style={{
      left: `${mark.pct}%`,
      top: 0,
      transform: 'translateX(-50%)',
      opacity: visible ? 1 : 0,
    }}
  >
    <div
      className="text-[10px] font-semibold whitespace-nowrap"
      style={{ color: mark.color ?? '#374151' }}
    >
      {mark.label}
    </div>
    <div
      className="w-px h-5 mx-auto"
      style={{ background: mark.color ?? '#374151' }}
    />
  </div>
)

const MiniNumberLine: React.FC<{
  pos: LinePos
  stage: number
}> = ({ pos, stage }) => {
  const animate = stage >= 2
  const qPct = animate ? pos.qEnd : pos.qInitial
  // Arrow on Q points toward kArrowTarget (the new K for T stresses).
  const sep = qPct - pos.kArrowTarget
  const arrow: 'left' | 'right' | 'none' =
    !animate || Math.abs(sep) < 1 ? 'none' : sep > 0 ? 'left' : 'right'
  return (
    <div className="relative h-12 mt-1 mx-4">
      {/* axis */}
      <div className="absolute top-6 left-0 right-0 h-px bg-gray-400" />
      <div className="absolute top-4 left-0 w-px h-5 bg-gray-300" />
      <div className="absolute top-4 right-0 w-px h-5 bg-gray-300" />
      {/* K markers — first is always visible, additional ones fade in at stage 2 */}
      {pos.kMarks.map((mark, i) => (
        <KMarker key={i} mark={mark} visible={i === 0 || animate} />
      ))}
      {/* Q dot + arrow */}
      <div
        className="absolute transition-[left] duration-500 ease-out"
        style={{ left: `${qPct}%`, top: 22, transform: 'translateX(-50%)' }}
      >
        <QDotSvg arrow={arrow} />
        <div className="text-[10px] text-amber-700 font-semibold text-center mt-0.5">
          Q
        </div>
      </div>
      {/* labels */}
      <div className="absolute left-0 bottom-0 text-[9px] text-gray-500">
        more reactants
      </div>
      <div className="absolute right-0 bottom-0 text-[9px] text-gray-500">
        more products
      </div>
    </div>
  )
}

const QDotSvg: React.FC<{ arrow: 'left' | 'right' | 'none' }> = ({ arrow }) => {
  const W = 50
  const H = 14
  const cx = W / 2
  const cy = H / 2
  const r = 4
  const stroke = '#d97706'
  const fill = '#f59e0b'
  return (
    <svg width={W} height={H} className="block mx-auto overflow-visible">
      {arrow === 'right' && (
        <>
          <line x1={cx} y1={cy} x2={W - 7} y2={cy} stroke={stroke} strokeWidth={2.5} strokeLinecap="round" />
          <polygon points={`${W - 1},${cy} ${W - 8},${cy - 4} ${W - 8},${cy + 4}`} fill={stroke} />
        </>
      )}
      {arrow === 'left' && (
        <>
          <line x1={7} y1={cy} x2={cx} y2={cy} stroke={stroke} strokeWidth={2.5} strokeLinecap="round" />
          <polygon points={`1,${cy} 8,${cy - 4} 8,${cy + 4}`} fill={stroke} />
        </>
      )}
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke="white" strokeWidth={2} />
    </svg>
  )
}

// ---------- Badges ----------

const ShiftBadge: React.FC<{ dir: Shift }> = ({ dir }) => {
  if (dir === 'left')
    return (
      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-900">
        ← shifts left
      </span>
    )
  if (dir === 'right')
    return (
      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-900">
        shifts right →
      </span>
    )
  return (
    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700">
      ⇌ no shift
    </span>
  )
}

const ChangeBadge: React.FC<{ change: Change }> = ({ change }) => {
  const map = {
    I: { label: 'Increase', cls: 'bg-emerald-100 text-emerald-900' },
    D: { label: 'Decrease', cls: 'bg-rose-100 text-rose-900' },
    U: { label: 'Unchanged', cls: 'bg-gray-100 text-gray-700' },
  }
  const m = map[change]
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${m.cls}`}>{m.label}</span>
}

// ---------- Quiz card ----------

const QuizCard: React.FC<{
  q: Question
  rxn: RxnDef
  isOpen: boolean
  onToggle: () => void
}> = ({ q, rxn, isOpen, onToggle }) => {
  // Stage advances 1 → 2 → 3 with delays so the explanation animates in.
  const [stage, setStage] = useState(0)
  useEffect(() => {
    if (!isOpen) {
      setStage(0)
      return
    }
    const t0 = setTimeout(() => setStage(1), 300)
    const t1 = setTimeout(() => setStage(2), 1500)
    const t2 = setTimeout(() => setStage(3), 2700)
    return () => {
      clearTimeout(t0)
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [isOpen])

  const linePos = computeLinePos(rxn, q)

  return (
    <div className="border border-gray-200 rounded">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-4 hover:bg-gray-50 flex items-start justify-between gap-3"
      >
        <div className="flex-1">
          <div className="font-medium">
            <span className="text-gray-500 mr-1">{q.letter})</span>
            {q.bonus && (
              <span className="text-[10px] uppercase tracking-wide text-amber-700 bg-amber-100 rounded px-1 py-0.5 mr-1">
                bonus
              </span>
            )}
            {q.stressLabel}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            What happens to <strong>{q.asked}</strong>?
          </div>
        </div>
        <span className="text-xs text-blue-600 shrink-0 mt-1">
          {isOpen ? 'Hide' : 'Reveal'}
        </span>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pt-3 border-t border-gray-200 space-y-3">
          <div className="bg-gray-50 rounded p-3">
            {q.stress.kind === 'volume' && stage >= 1 && (
              <div className="text-center mb-2">
                <span className="px-2 py-0.5 rounded bg-rose-50 border border-rose-300 text-rose-900 font-semibold text-sm">
                  {q.stress.dir === 'down' ? '↓ V (compressed)' : '↑ V (expanded)'}
                </span>
              </div>
            )}
            {q.stress.kind === 'water' && stage >= 1 && (
              <div className="text-center mb-2">
                <span className="px-2 py-0.5 rounded bg-rose-50 border border-rose-300 text-rose-900 font-semibold text-sm">
                  + H₂O (diluted)
                </span>
              </div>
            )}
            {q.stress.kind === 'solid' && stage >= 1 && (() => {
              const sp = [...rxn.reactants, ...rxn.products].find(
                s => s.key === (q.stress as { kind: 'solid'; key: string }).key
              )
              return (
                <div className="text-center mb-2">
                  <span className="px-2 py-0.5 rounded bg-rose-50 border border-rose-300 text-rose-900 font-semibold text-sm">
                    Solid added: moles ↑, but [{sp?.node}] is <em>constant</em>
                  </span>
                </div>
              )
            })()}
            <ReactionVisual rxn={rxn} q={q} stage={stage} />
          </div>
          <MiniNumberLine pos={linePos} stage={stage} />
          <div className="flex flex-wrap items-center justify-center gap-2">
            <ShiftBadge dir={q.shift} />
            <span className="text-sm text-gray-600">
              {q.asked} →
            </span>
            <ChangeBadge change={q.change} />
          </div>
          <p className="text-xs text-gray-600 text-center">{q.caption}</p>
        </div>
      )}
    </div>
  )
}

// ---------- Reaction quiz page ----------

const ReactionQuiz: React.FC<{
  title: string
  rxn: RxnDef
  reactionNode: React.ReactNode
  thermal: 'endothermic' | 'exothermic'
  questions: Question[]
}> = ({ title, rxn, reactionNode, thermal, questions }) => {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  return (
    <div className="w-full max-w-3xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="bg-gray-50 border border-gray-200 rounded p-4 text-center">
        <div className="text-2xl font-medium">{reactionNode}</div>
        <div className="text-sm text-gray-600 mt-2">
          initially at equilibrium at 20&nbsp;°C — reaction is{' '}
          <strong className={thermal === 'endothermic' ? 'text-rose-700' : 'text-blue-700'}>
            {thermal}
          </strong>
        </div>
      </div>
      <div className="space-y-2">
        {questions.map(q => (
          <QuizCard
            key={q.letter}
            q={q}
            rxn={rxn}
            isOpen={!!open[q.letter]}
            onToggle={() => setOpen(o => ({ ...o, [q.letter]: !o[q.letter] }))}
          />
        ))}
      </div>
    </div>
  )
}

// ---------- Reaction 1: PbS / H₂S, endothermic ----------

const reaction1Node = (
  <>
    2H<sup>+</sup>(aq) + PbS(s) ⇌ Pb<sup>2+</sup>(aq) + H<sub>2</sub>S(g)
  </>
)

const questions1: Question[] = [
  {
    letter: 'a',
    stressLabel: <>Pb<sup>2+</sup> is added</>,
    asked: 'K',
    askedKey: 'K',
    stress: { kind: 'species', key: 'Pb2+', dir: 'up' },
    shift: 'left',
    change: 'U',
    caption: 'K only depends on temperature — adding a product changes Q, not K.',
  },
  {
    letter: 'b',
    stressLabel: 'PbS(s) is added',
    asked: <>grams of H<sup>+</sup></>,
    askedKey: 'H+',
    stress: { kind: 'solid', key: 'PbS' },
    shift: 'none',
    change: 'U',
    caption: "Pure solids don't appear in the K expression, so adding more doesn't disturb the equilibrium.",
  },
  {
    letter: 'c',
    stressLabel: 'Temperature is decreased to 5 °C',
    asked: 'K',
    askedKey: 'K',
    stress: { kind: 'heat', side: 'left', dir: 'down' },
    shift: 'left',
    change: 'D',
    caption: 'Endothermic: think of heat as a reactant. Removing heat (cooling) shifts the reaction left → K decreases.',
  },
  {
    letter: 'd',
    stressLabel: 'Pressure is increased by decreasing the volume',
    asked: <>grams of Pb<sup>2+</sup></>,
    askedKey: 'Pb2+',
    stress: { kind: 'volume', dir: 'down' },
    shift: 'left',
    change: 'D',
    caption: 'Right side has 1 mol of gas, left side has 0. Higher pressure favors fewer gas moles → shift left.',
  },
  {
    letter: 'e',
    bonus: true,
    stressLabel: 'Water is added',
    asked: 'moles of PbS',
    askedKey: 'PbS',
    stress: { kind: 'water' },
    shift: 'left',
    change: 'I',
    caption: 'Diluting drops [H⁺]² faster than [Pb²⁺] → Q rises above K → shift left → more PbS forms.',
  },
]

export const PbsQuiz: React.FC = () => (
  <ReactionQuiz
    title="Le Chatelier — endothermic PbS / H₂S"
    rxn={RXN_PBS}
    reactionNode={reaction1Node}
    thermal="endothermic"
    questions={questions1}
  />
)

// ---------- Reaction 2: CO₂ / Ca(OH)₂, exothermic ----------

const reaction2Node = (
  <>
    2CO<sub>2</sub>(g) + Ca(OH)<sub>2</sub>(s) ⇌ Ca<sup>2+</sup>(aq) + 2HCO
    <sub>3</sub><sup>−</sup>(aq)
  </>
)

const questions2: Question[] = [
  {
    letter: 'a',
    stressLabel: 'Ca(OH)₂(s) is added',
    asked: 'K',
    askedKey: 'K',
    stress: { kind: 'solid', key: 'CaOH2' },
    shift: 'none',
    change: 'U',
    caption: "Pure solids don't appear in K, so adding more doesn't change Q. K depends only on temperature.",
  },
  {
    letter: 'b',
    stressLabel: <>Ca<sup>2+</sup> is removed</>,
    asked: <>grams of HCO<sub>3</sub><sup>−</sup></>,
    askedKey: 'HCO3-',
    stress: { kind: 'species', key: 'Ca2+', dir: 'down' },
    shift: 'right',
    change: 'I',
    caption: 'Removing a product drops Q below K → shift right → more HCO₃⁻ is produced along with the replacement Ca²⁺.',
  },
  {
    letter: 'c',
    stressLabel: 'Temperature is decreased to 5 °C',
    asked: 'K',
    askedKey: 'K',
    stress: { kind: 'heat', side: 'right', dir: 'down' },
    shift: 'right',
    change: 'I',
    caption: 'Exothermic: think of heat as a product. Removing heat shifts the reaction right → K increases.',
  },
  {
    letter: 'd',
    stressLabel: 'Pressure is increased by decreasing the volume',
    asked: <>mol Ca(OH)<sub>2</sub></>,
    askedKey: 'CaOH2',
    stress: { kind: 'volume', dir: 'down' },
    shift: 'right',
    change: 'D',
    caption: 'Left side has 2 mol of gas, right has 0. Higher pressure favors fewer gas moles → shift right → Ca(OH)₂ is consumed.',
  },
  {
    letter: 'e',
    bonus: true,
    stressLabel: 'Water is added',
    asked: <>mol CO<sub>2</sub></>,
    askedKey: 'CO2',
    stress: { kind: 'water' },
    shift: 'right',
    change: 'D',
    caption: 'Diluting lowers [Ca²⁺] and [HCO₃⁻]² but not [CO₂] → Q drops below K → shift right → CO₂ is consumed.',
  },
]

export const Caoh2Quiz: React.FC = () => (
  <ReactionQuiz
    title="Le Chatelier — exothermic CO₂ / Ca(OH)₂"
    rxn={RXN_CAOH2}
    reactionNode={reaction2Node}
    thermal="exothermic"
    questions={questions2}
  />
)

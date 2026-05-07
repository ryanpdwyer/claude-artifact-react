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
  | { kind: 'inert'; label: React.ReactNode }
  | { kind: 'catalyst'; label: React.ReactNode }

type Shift = 'left' | 'right' | 'none'
type Change = 'I' | 'D' | 'U'

// A single quantity the question asks about (a species amount, or K).
// Multiple askeds per card let us show both "grams of NO" and "K" side by side.
type AskedItem = {
  node: React.ReactNode
  key: string // matches a species key, or 'K'
  change: Change
}

type Question = {
  letter: string
  bonus?: boolean
  stressLabel: React.ReactNode
  asked: AskedItem[]
  stress: Stress
  shift: Shift
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

  // Response arrows on each asked species (skip the stressed species —
  // its response doesn't fully cancel the stress). Solids ARE allowed to
  // get response arrows because their moles do change.
  const responseArrows: Record<string, 'up' | 'down'> = {}
  if (q.shift !== 'none') {
    for (const item of q.asked) {
      if (stressArrows[item.key] !== undefined) continue
      const isReactant = rxn.reactants.some(s => s.key === item.key)
      const isProduct = rxn.products.some(s => s.key === item.key)
      if (isReactant) {
        responseArrows[item.key] = q.shift === 'left' ? 'up' : 'down'
      } else if (isProduct) {
        responseArrows[item.key] = q.shift === 'right' ? 'up' : 'down'
      }
    }
  }
  const askedKeys = new Set(q.asked.map(a => a.key))

  const heatStress = q.stress.kind === 'heat' ? q.stress : null

  const renderSide = (species: Sp[]) =>
    species.map((sp, i) => (
      <Fragment key={sp.key}>
        <SpeciesChip
          sp={sp}
          stressDir={stressArrows[sp.key]}
          stressCount={stressCounts[sp.key]}
          responseDir={responseArrows[sp.key]}
          isAsked={askedKeys.has(sp.key) && stage >= 3}
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

// ---------- Pre-reveal multiple choice ----------

const MC_CHOICES: { value: Change; label: string; symbol: string }[] = [
  { value: 'I', label: 'Increase', symbol: '↑' },
  { value: 'D', label: 'Decrease', symbol: '↓' },
  { value: 'U', label: 'Unchanged', symbol: '=' },
]

const MCRow: React.FC<{
  item: AskedItem
  pick?: Change
  onPick: (c: Change) => void
  revealed: boolean
}> = ({ item, pick, onPick, revealed }) => {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-gray-700">{item.node}:</span>
      <div className="flex gap-1" role="radiogroup">
        {MC_CHOICES.map(c => {
          const isPicked = pick === c.value
          const isAnswer = item.change === c.value
          const base = 'px-2 py-0.5 rounded border text-xs transition-colors'
          let cls = base + ' '
          if (revealed) {
            if (isAnswer) {
              cls += 'bg-emerald-100 text-emerald-900 border-emerald-500 font-semibold'
            } else if (isPicked) {
              cls += 'bg-rose-100 text-rose-900 border-rose-500 line-through'
            } else {
              cls += 'bg-white text-gray-400 border-gray-200'
            }
          } else if (isPicked) {
            cls += 'bg-blue-100 text-blue-900 border-blue-500'
          } else {
            cls += 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
          }
          return (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={isPicked}
              aria-label={c.label}
              disabled={revealed}
              onClick={e => {
                e.stopPropagation()
                onPick(c.value)
              }}
              className={cls}
            >
              <span className="mr-0.5">{c.symbol}</span>
              {c.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------- Quiz card ----------

const QuizCard: React.FC<{
  q: Question
  rxn: RxnDef
  isOpen: boolean
  onToggle: () => void
  picks: Record<string, Change>
  onPick: (askedKey: string, change: Change) => void
}> = ({ q, rxn, isOpen, onToggle, picks, onPick }) => {
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
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
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
            What happens to{' '}
            {q.asked.map((a, i) => (
              <Fragment key={a.key}>
                {i > 0 && (i === q.asked.length - 1 ? ' and ' : ', ')}
                <strong>{a.node}</strong>
              </Fragment>
            ))}
            ?
          </div>
          <div className="mt-2 space-y-1">
            {q.asked.map(item => (
              <MCRow
                key={item.key}
                item={item}
                pick={picks[item.key]}
                onPick={c => onPick(item.key, c)}
                revealed={isOpen}
              />
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="text-xs text-blue-600 hover:underline shrink-0 mt-1 px-2 py-1 rounded hover:bg-blue-50"
        >
          {isOpen ? 'Hide' : 'Reveal'}
        </button>
      </div>
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
            {q.stress.kind === 'inert' && stage >= 1 && (
              <div className="text-center mb-2">
                <span className="px-2 py-0.5 rounded bg-rose-50 border border-rose-300 text-rose-900 font-semibold text-sm">
                  {q.stress.label} — inert, constant V → partial pressures unchanged
                </span>
              </div>
            )}
            {q.stress.kind === 'catalyst' && stage >= 1 && (
              <div className="text-center mb-2">
                <span className="px-2 py-0.5 rounded bg-rose-50 border border-rose-300 text-rose-900 font-semibold text-sm">
                  {q.stress.label} — forward and reverse rates both ↑ equally
                </span>
              </div>
            )}
            <ReactionVisual rxn={rxn} q={q} stage={stage} />
          </div>
          <MiniNumberLine pos={linePos} stage={stage} />
          <div className="flex flex-col items-center gap-2">
            <ShiftBadge dir={q.shift} />
            <div className="flex flex-col items-center gap-1">
              {q.asked.map(item => (
                <div key={item.key} className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">{item.node} →</span>
                  <ChangeBadge change={item.change} />
                </div>
              ))}
            </div>
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
  const [picks, setPicks] = useState<Record<string, Record<string, Change>>>({})
  const setPick = (letter: string, askedKey: string, change: Change) =>
    setPicks(p => ({
      ...p,
      [letter]: { ...(p[letter] || {}), [askedKey]: change },
    }))
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
            picks={picks[q.letter] || {}}
            onPick={(askedKey, change) => setPick(q.letter, askedKey, change)}
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
    asked: [{ node: 'K', key: 'K', change: 'U' }],
    stress: { kind: 'species', key: 'Pb2+', dir: 'up' },
    shift: 'left',
    caption: 'K only depends on temperature — adding a product changes Q, not K.',
  },
  {
    letter: 'b',
    stressLabel: 'PbS(s) is added',
    asked: [{ node: <>grams of H<sup>+</sup></>, key: 'H+', change: 'U' }],
    stress: { kind: 'solid', key: 'PbS' },
    shift: 'none',
    caption: "Pure solids don't appear in the K expression, so adding more doesn't disturb the equilibrium.",
  },
  {
    letter: 'c',
    stressLabel: 'Temperature is decreased to 5 °C',
    asked: [{ node: 'K', key: 'K', change: 'D' }],
    stress: { kind: 'heat', side: 'left', dir: 'down' },
    shift: 'left',
    caption: 'Endothermic: think of heat as a reactant. Removing heat (cooling) shifts the reaction left → K decreases.',
  },
  {
    letter: 'd',
    stressLabel: 'Pressure is increased by decreasing the volume',
    asked: [{ node: <>grams of Pb<sup>2+</sup></>, key: 'Pb2+', change: 'D' }],
    stress: { kind: 'volume', dir: 'down' },
    shift: 'left',
    caption: 'Right side has 1 mol of gas, left side has 0. Higher pressure favors fewer gas moles → shift left.',
  },
  {
    letter: 'e',
    bonus: true,
    stressLabel: 'Water is added',
    asked: [{ node: 'moles of PbS', key: 'PbS', change: 'I' }],
    stress: { kind: 'water' },
    shift: 'left',
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
    asked: [{ node: 'K', key: 'K', change: 'U' }],
    stress: { kind: 'solid', key: 'CaOH2' },
    shift: 'none',
    caption: "Pure solids don't appear in K, so adding more doesn't change Q. K depends only on temperature.",
  },
  {
    letter: 'b',
    stressLabel: <>Ca<sup>2+</sup> is removed</>,
    asked: [{ node: <>grams of HCO<sub>3</sub><sup>−</sup></>, key: 'HCO3-', change: 'I' }],
    stress: { kind: 'species', key: 'Ca2+', dir: 'down' },
    shift: 'right',
    caption: 'Removing a product drops Q below K → shift right → more HCO₃⁻ is produced along with the replacement Ca²⁺.',
  },
  {
    letter: 'c',
    stressLabel: 'Temperature is decreased to 5 °C',
    asked: [{ node: 'K', key: 'K', change: 'I' }],
    stress: { kind: 'heat', side: 'right', dir: 'down' },
    shift: 'right',
    caption: 'Exothermic: think of heat as a product. Removing heat shifts the reaction right → K increases.',
  },
  {
    letter: 'd',
    stressLabel: 'Pressure is increased by decreasing the volume',
    asked: [{ node: <>mol Ca(OH)<sub>2</sub></>, key: 'CaOH2', change: 'D' }],
    stress: { kind: 'volume', dir: 'down' },
    shift: 'right',
    caption: 'Left side has 2 mol of gas, right has 0. Higher pressure favors fewer gas moles → shift right → Ca(OH)₂ is consumed.',
  },
  {
    letter: 'e',
    bonus: true,
    stressLabel: 'Water is added',
    asked: [{ node: <>mol CO<sub>2</sub></>, key: 'CO2', change: 'D' }],
    stress: { kind: 'water' },
    shift: 'right',
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

// ---------- Reaction 3: N₂ + O₂ ⇌ 2 NO, endothermic ----------

const RXN_N2O2: RxnDef = {
  // K for N₂ + O₂ ⇌ 2 NO at room T is around 10⁻³⁰ — overwhelmingly
  // reactant-favored (which is why the atmosphere doesn't combust itself).
  Ksize: 'small',
  reactants: [
    { key: 'N2', coef: 1, node: <>N<sub>2</sub></>, state: 'g' },
    { key: 'O2', coef: 1, node: <>O<sub>2</sub></>, state: 'g' },
  ],
  products: [{ key: 'NO', coef: 2, node: 'NO', state: 'g' }],
}

const reaction3Node = (
  <>
    N<sub>2</sub>(g) + O<sub>2</sub>(g) ⇌ 2 NO(g)
  </>
)

const questions3: Question[] = [
  {
    letter: 'a',
    stressLabel: <>N<sub>2</sub> is added</>,
    asked: [
      { node: 'grams of NO', key: 'NO', change: 'I' },
      { node: 'K', key: 'K', change: 'U' },
    ],
    stress: { kind: 'species', key: 'N2', dir: 'up' },
    shift: 'right',
    caption: 'Adding a reactant drops Q below K → shift right → more NO forms. K only depends on T.',
  },
  {
    letter: 'b',
    stressLabel: 'Temperature decreases',
    asked: [
      { node: 'grams of NO', key: 'NO', change: 'D' },
      { node: 'K', key: 'K', change: 'D' },
    ],
    stress: { kind: 'heat', side: 'left', dir: 'down' },
    shift: 'left',
    caption: 'Endothermic: heat acts as a reactant. Cooling removes heat → shift left → less NO, and K itself decreases.',
  },
  {
    letter: 'c',
    stressLabel: '10 atm of Ar is added',
    asked: [
      { node: 'grams of NO', key: 'NO', change: 'U' },
      { node: 'K', key: 'K', change: 'U' },
    ],
    stress: { kind: 'inert', label: <>+ 10 atm Ar</> },
    shift: 'none',
    caption: 'Ar is inert. At constant V the partial pressures of N₂, O₂, NO are unchanged → Q = K, no shift.',
  },
  {
    letter: 'd',
    stressLabel: 'Volume is doubled',
    asked: [
      { node: 'grams of NO', key: 'NO', change: 'U' },
      { node: 'K', key: 'K', change: 'U' },
    ],
    stress: { kind: 'volume', dir: 'up' },
    shift: 'none',
    caption: 'Δn_gas = 0 (2 mol ⇌ 2 mol). Every [gas] drops by the same factor, so Q is unchanged → no shift.',
  },
  {
    letter: 'e',
    stressLabel: 'A platinum catalyst is added',
    asked: [
      { node: 'grams of NO', key: 'NO', change: 'U' },
      { node: 'K', key: 'K', change: 'U' },
    ],
    stress: { kind: 'catalyst', label: <>+ Pt catalyst</> },
    shift: 'none',
    caption: 'A catalyst speeds up the forward and reverse reactions equally — equilibrium is reached faster, not shifted.',
  },
  {
    letter: 'f',
    stressLabel: <>O<sub>2</sub> is removed</>,
    asked: [
      { node: 'grams of NO', key: 'NO', change: 'D' },
      { node: 'K', key: 'K', change: 'U' },
    ],
    stress: { kind: 'species', key: 'O2', dir: 'down' },
    shift: 'left',
    caption: 'Removing a reactant pushes Q above K → shift left → NO is consumed. K only depends on T.',
  },
]

export const N2O2Quiz: React.FC = () => (
  <ReactionQuiz
    title="Le Chatelier — endothermic N₂ + O₂ / NO"
    rxn={RXN_N2O2}
    reactionNode={reaction3Node}
    thermal="endothermic"
    questions={questions3}
  />
)

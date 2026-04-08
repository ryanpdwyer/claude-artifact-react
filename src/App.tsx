import './App.css'
import { useEffect, useState } from 'react'
import OriginalEquilibrium from './artifact-component'
import EquilibriumV2 from './sims/equilibrium-v2'

// Minimal client-side router. No deps. Vite's dev server already
// falls back to index.html for unknown paths, so /v2 just works.
function getPath() {
  return window.location.pathname.replace(/\/+$/, '') || '/'
}

function navigate(to: string) {
  if (getPath() === to) return
  window.history.pushState({}, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

const ROUTES: { path: string; label: string; render: () => JSX.Element }[] = [
  { path: '/', label: 'v1 (original)', render: () => <OriginalEquilibrium /> },
  { path: '/v2', label: 'v2 (improved)', render: () => <EquilibriumV2 /> },
]

function App() {
  const [path, setPath] = useState(getPath())

  useEffect(() => {
    const onPop = () => setPath(getPath())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const route = ROUTES.find(r => r.path === path) ?? ROUTES[0]

  return (
    <>
      <nav className="w-full border-b border-gray-200 bg-white text-sm">
        <div className="max-w-2xl mx-auto px-4 py-2 flex gap-3 items-center">
          <span className="font-semibold text-gray-700">Equilibrium sims:</span>
          {ROUTES.map(r => {
            const active = r.path === route.path
            return (
              <a
                key={r.path}
                href={r.path}
                onClick={(e) => { e.preventDefault(); navigate(r.path) }}
                className={
                  active
                    ? 'text-blue-700 font-medium underline'
                    : 'text-gray-600 hover:text-blue-700'
                }
              >
                {r.label}
              </a>
            )
          })}
        </div>
      </nav>
      {route.render()}
    </>
  )
}

export default App

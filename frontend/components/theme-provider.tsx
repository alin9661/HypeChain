'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useServerInsertedHTML } from 'next/navigation'

// First-party replacement for next-themes (which is unmaintained and renders
// its anti-FOUC <script> inside the React tree, tripping React 19's
// "Encountered a script tag while rendering" dev error on every page).
// Same storage key and hook shape, so saved preferences and consumers carry over.

type Theme = 'light' | 'dark' | 'system'

// Both constants are interpolated into INIT_SCRIPT below — they MUST remain
// static literals (never user- or runtime-derived), or the inline script
// becomes an injection surface.
const STORAGE_KEY = 'theme'
// 'dark' per frontend/DESIGN.md ("Dark only") — the terminal aesthetic is the
// default; light remains a user-selectable preference in /settings.
const DEFAULT_THEME: Theme = 'dark'

// Runs during HTML parsing, before first paint, so a saved dark preference
// never flashes light. Must stay dependency-free and idempotent.
const INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}')||'${DEFAULT_THEME}';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var c=document.documentElement.classList;c.toggle('dark',d);c.toggle('light',!d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})()`

function applyTheme(pref: Theme) {
  const dark =
    pref === 'dark' ||
    (pref === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
  const classList = document.documentElement.classList
  classList.toggle('dark', dark)
  classList.toggle('light', !dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored
    }
  } catch {
    // localStorage unavailable (private mode, blocked) — fall through
  }
  return DEFAULT_THEME
}

interface UseThemeProps {
  /** The saved preference. undefined until mounted (avoids hydration mismatch). */
  theme: Theme | undefined
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<UseThemeProps>({
  theme: undefined,
  setTheme: () => {},
})

export const useTheme = () => useContext(ThemeContext)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme | undefined>(undefined)

  // Inject the pre-paint script into the SSR stream, OUTSIDE the React tree.
  // On the client this hook renders nothing, so React never creates a <script>
  // element during client rendering — the React 19 warning cannot fire.
  const inserted = useRef(false)
  useServerInsertedHTML(() => {
    if (inserted.current) return null
    inserted.current = true
    return <script dangerouslySetInnerHTML={{ __html: INIT_SCRIPT }} />
  })

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // persistence unavailable — still apply for this session
    }
    applyTheme(next)
  }, [])

  // Read the saved preference after mount. The init script normally applied it
  // pre-paint already; re-applying is idempotent and self-heals environments
  // where the inline script never ran (e.g. blocked by a strict CSP).
  useEffect(() => {
    const stored = readStoredTheme()
    setThemeState(stored)
    applyTheme(stored)
  }, [])

  // Track OS appearance while preference is "system".
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  // Cross-tab sync: another tab changing the preference updates this one.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      // key === null means another tab called localStorage.clear() — treat it
      // as a reset to the default rather than ignoring it.
      if (e.key !== null && e.key !== STORAGE_KEY) return
      const next = readStoredTheme()
      setThemeState(next)
      applyTheme(next)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Stable identity so root-level re-renders don't invalidate every consumer;
  // setTheme is already a stable useCallback.
  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme])

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  )
}

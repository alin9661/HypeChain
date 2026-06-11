'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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

const STORAGE_KEY = 'theme'
const DEFAULT_THEME: Theme = 'light'

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

  // Read the saved preference after mount (the init script already applied it).
  useEffect(() => {
    setThemeState(readStoredTheme())
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
      if (e.key !== STORAGE_KEY) return
      const next = readStoredTheme()
      setThemeState(next)
      applyTheme(next)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

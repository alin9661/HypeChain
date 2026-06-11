'use client'

import { Bell, Search, Moon, Sun } from 'lucide-react'
import { useTheme } from '@/components/theme-provider'
import { useEffect, useState } from 'react'
import Link from 'next/link'

export function TopHeader() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <header className="sticky top-0 z-20 border-b border-slate-700 bg-slate-900/95 backdrop-blur supports-[backdrop-filter]:bg-slate-900/60">
        <div className="flex h-16 items-center gap-6 px-6">
          {/* Logo - Loading State */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500" />
          <div className="flex-1" />
        </div>
      </header>
    )
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-700 bg-slate-900/95 backdrop-blur supports-[backdrop-filter]:bg-slate-900/60">
      <div className="flex h-16 items-center gap-6 px-6">
        {/* HypeChain Logo - Top Left */}
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-3 transition-all duration-300 hover:scale-105"
          aria-label="HypeChain Home"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg transition-all duration-300 group-hover:shadow-blue-500/50 group-hover:shadow-xl">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-6 w-6 text-white"
              aria-hidden="true"
            >
              <path
                d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"
                fill="currentColor"
                className="transition-transform duration-300 group-hover:scale-110"
              />
            </svg>
          </div>
          <span className="hidden text-xl font-bold text-white transition-colors duration-300 group-hover:text-cyan-400 md:block">
            HypeChain
          </span>
        </Link>

        {/* Search */}
        <div className="flex flex-1 items-center gap-4">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Search transactions, addresses..."
              className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2 pl-10 pr-4 text-sm text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              aria-label="Search"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4">
          {/* Theme toggle */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          {/* Notifications */}
          <button
            className="relative rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-blue-500" />
          </button>

          {/* User profile */}
          <button className="flex items-center gap-3 rounded-lg hover:bg-slate-800 p-1.5">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400" />
          </button>
        </div>
      </div>
    </header>
  )
}

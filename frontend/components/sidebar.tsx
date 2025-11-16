'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Activity,
  Settings,
  Menu,
  X,
  ChevronLeft
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Recent Activities', href: '/activities', icon: Activity },
  { name: 'Settings', href: '/settings', icon: Settings },
]

interface SidebarProps {
  className?: string
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed left-4 top-4 z-50 rounded-lg bg-slate-800 p-2 text-slate-200 lg:hidden"
        aria-label="Toggle menu"
      >
        {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 h-screen border-r border-slate-700 bg-slate-900 transition-all duration-300',
          collapsed ? 'w-20' : 'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          className
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-between border-b border-slate-700 px-6">
            {!collapsed && (
              <Link href="/" className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500" />
                <span className="text-xl font-bold text-white">HypeChain</span>
              </Link>
            )}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:block"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <ChevronLeft className={cn('h-5 w-5 transition-transform', collapsed && 'rotate-180')} />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                    isActive
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/50'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white',
                    collapsed && 'justify-center'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  {!collapsed && <span>{item.name}</span>}
                </Link>
              )
            })}
          </nav>

          {/* Footer */}
          <div className="border-t border-slate-700 p-4">
            <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400" />
              {!collapsed && (
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">User</p>
                  <p className="text-xs text-slate-400">user@example.com</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

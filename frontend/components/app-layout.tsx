'use client'

import { Sidebar } from './sidebar'
import { TopHeader } from './top-header'
import { cn } from '@/lib/utils'

interface AppLayoutProps {
  children: React.ReactNode
  className?: string
}

export function AppLayout({ children, className }: AppLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <Sidebar />

      <div className="flex flex-1 flex-col lg:pl-64">
        <TopHeader />

        <main className={cn('flex-1 overflow-auto p-6', className)}>
          {children}
        </main>
      </div>
    </div>
  )
}

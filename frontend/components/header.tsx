'use client'

import Link from 'next/link'
import { Menu } from 'lucide-react'
import { useState } from 'react'

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-neutral-300 bg-neutral-100">
      <div className="flex items-center justify-between px-4 py-4 md:px-8">
        <Link href="/" className="font-mono text-xl font-bold tracking-tight text-black md:text-2xl">
          YEEZY
        </Link>
        
        <nav className="hidden items-center gap-8 font-mono text-sm font-medium uppercase tracking-wider md:flex">
          <Link href="#" className="text-black transition-opacity hover:opacity-60">
            Shop
          </Link>
          <Link href="#" className="text-black transition-opacity hover:opacity-60">
            About
          </Link>
          <Link href="#" className="text-black transition-opacity hover:opacity-60">
            Contact
          </Link>
        </nav>

        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden"
          aria-label="Toggle menu"
        >
          <Menu className="h-6 w-6" />
        </button>
      </div>

      {menuOpen && (
        <nav className="flex flex-col gap-4 border-t border-neutral-300 bg-neutral-100 px-4 py-6 font-mono text-sm font-medium uppercase tracking-wider md:hidden">
          <Link href="#" className="text-black transition-opacity hover:opacity-60">
            Shop
          </Link>
          <Link href="#" className="text-black transition-opacity hover:opacity-60">
            About
          </Link>
          <Link href="#" className="text-black transition-opacity hover:opacity-60">
            Contact
          </Link>
        </nav>
      )}
    </header>
  )
}

'use client'

import Link from 'next/link'
import { GL } from '@/components/gl'
import { Pill } from '@/components/pill'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { Leva } from 'leva'

export default function LandingPage() {
  const [hovering, setHovering] = useState(false)

  return (
    <>
      {/* Navigation Bar */}
      <div className="fixed z-50 pt-8 md:pt-14 top-0 left-0 w-full">
        <header className="flex items-center justify-between container mx-auto px-4 md:px-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 z-50">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#FFC700] to-[#FFD700] shadow-lg">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-6 w-6 text-black"
                aria-hidden="true"
              >
                <path
                  d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"
                  fill="currentColor"
                />
              </svg>
            </div>
            <span className="text-xl font-bold font-mono text-white">
              HypeChain
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="flex max-lg:hidden absolute left-1/2 -translate-x-1/2 items-center justify-center gap-x-10">
            {['About', 'Features', 'Marketplace', 'Contact'].map((item) => (
              <Link
                className="uppercase inline-block font-mono text-white/60 hover:text-white/100 duration-150 transition-colors ease-out text-sm"
                href={`#${item.toLowerCase()}`}
                key={item}
              >
                {item}
              </Link>
            ))}
          </nav>

          {/* Connect Wallet */}
          <Link
            className="uppercase max-lg:hidden transition-colors ease-out duration-150 font-mono text-[#FFC700] hover:text-[#FFC700]/80 text-sm"
            href="/dashboard"
          >
            Connect Wallet
          </Link>

          {/* Mobile Connect Wallet */}
          <Link
            href="/dashboard"
            className="lg:hidden uppercase font-mono text-[#FFC700] hover:text-[#FFC700]/80 text-sm"
          >
            Connect Wallet
          </Link>
        </header>
      </div>

      {/* Hero Section with WebGL Background */}
      <div className="flex flex-col h-svh justify-between bg-black">
        <GL hovering={hovering} />

        <div className="pb-16 mt-auto text-center relative z-10 px-4">
          <Pill className="mb-6">BETA RELEASE</Pill>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-mono text-white">
            Unlock your <br />
            marketplace
          </h1>
          <p className="font-mono text-sm sm:text-base text-white/60 text-balance mt-8 max-w-[440px] mx-auto">
            Trade NFTs with AI-powered insights and lightning-fast transactions on Solana
          </p>

          {/* Desktop Button */}
          <Link className="contents max-sm:hidden" href="/dashboard">
            <Button
              className="mt-14"
              onMouseEnter={() => setHovering(true)}
              onMouseLeave={() => setHovering(false)}
            >
              [Join Waitlist]
            </Button>
          </Link>

          {/* Mobile Button */}
          <Link className="contents sm:hidden" href="/dashboard">
            <Button
              size="sm"
              className="mt-14"
              onMouseEnter={() => setHovering(true)}
              onMouseLeave={() => setHovering(false)}
            >
              [Join Waitlist]
            </Button>
          </Link>
        </div>
      </div>

      <Leva hidden />
    </>
  )
}

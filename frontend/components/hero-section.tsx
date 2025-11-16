'use client';

import { ArrowRight, Sparkles, TrendingUp } from 'lucide-react';
import Link from 'next/link';

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Decorative background elements */}
      <div className="absolute inset-0 bg-grid-slate-200/50 dark:bg-grid-slate-700/25 [mask-image:linear-gradient(to_bottom,white,transparent)]" />
      <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-32">
        <div className="text-center">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/80 dark:bg-slate-800/80 px-4 py-2 text-sm font-medium text-slate-900 dark:text-slate-100 shadow-sm backdrop-blur-sm ring-1 ring-slate-200 dark:ring-slate-700">
            <Sparkles className="h-4 w-4 text-blue-500" />
            <span>AI-Powered NFT Marketplace</span>
          </div>

          {/* Heading - High contrast for accessibility */}
          <h1 className="mb-6 text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-5xl md:text-6xl lg:text-7xl">
            Trade NFTs with
            <span className="block bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              Confidence & Style
            </span>
          </h1>

          {/* Description - WCAG AA compliant contrast */}
          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-slate-700 dark:text-slate-300 sm:text-xl">
            Experience the future of NFT trading with AI-powered insights, real-time analytics, and a marketplace designed for the modern collector.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/dashboard"
              className="group inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-lg transition-all duration-300 hover:bg-blue-700 hover:shadow-xl hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
            >
              Explore Marketplace
              <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
            <Link
              href="/activities"
              className="inline-flex items-center gap-2 rounded-lg bg-white dark:bg-slate-800 px-6 py-3 text-base font-semibold text-slate-900 dark:text-slate-100 shadow-md ring-1 ring-slate-200 dark:ring-slate-700 transition-all duration-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:shadow-lg hover:scale-105 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
            >
              <TrendingUp className="h-5 w-5" />
              View Activities
            </Link>
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-3">
            <div className="rounded-lg bg-white/60 dark:bg-slate-800/60 p-6 backdrop-blur-sm ring-1 ring-slate-200 dark:ring-slate-700">
              <div className="text-3xl font-bold text-slate-900 dark:text-slate-50">10K+</div>
              <div className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-400">
                Active NFTs
              </div>
            </div>
            <div className="rounded-lg bg-white/60 dark:bg-slate-800/60 p-6 backdrop-blur-sm ring-1 ring-slate-200 dark:ring-slate-700">
              <div className="text-3xl font-bold text-slate-900 dark:text-slate-50">5K+</div>
              <div className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-400">
                Collectors
              </div>
            </div>
            <div className="col-span-2 rounded-lg bg-white/60 dark:bg-slate-800/60 p-6 backdrop-blur-sm ring-1 ring-slate-200 dark:ring-slate-700 sm:col-span-1">
              <div className="text-3xl font-bold text-slate-900 dark:text-slate-50">99.8%</div>
              <div className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-400">
                Success Rate
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

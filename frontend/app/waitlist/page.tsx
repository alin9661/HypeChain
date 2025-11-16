'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Navigation } from '@/components/navigation'
import { GL } from '@/components/gl'

export default function WaitlistPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    walletAddress: '',
    interest: 'general'
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')

    // Basic validation
    if (!formData.name || !formData.email) {
      setError('Please fill in all required fields')
      setIsSubmitting(false)
      return
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      setError('Please enter a valid email address')
      setIsSubmitting(false)
      return
    }

    try {
      // Simulate API call - replace with actual backend endpoint
      await new Promise(resolve => setTimeout(resolve, 1500))

      // You can add actual API call here:
      // const response = await fetch('/api/waitlist', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(formData)
      // })

      setSubmitted(true)
    } catch (err) {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const navigationItems = [
    { name: 'Marketplace', href: '/marketplace' },
    { name: 'Collections', href: '/collections' },
    { name: 'Activities', href: '/activities' }
  ]

  if (submitted) {
    return (
      <>
        <GL />
        <div className="relative z-10 flex min-h-screen flex-col">
          <Navigation items={navigationItems} showConnectWallet />

          <main className="flex flex-1 flex-col items-center justify-center px-4 pb-20 pt-32 md:pt-40">
            <div className="w-full max-w-md text-center">
              <div className="mb-6 flex justify-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#FFC700]">
                  <svg className="h-10 w-10 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>

              <h1 className="mb-4 text-4xl font-bold text-white md:text-5xl">
                You're on the list!
              </h1>

              <p className="mb-8 text-lg text-white/70">
                Thank you for joining the HypeChain waitlist. We'll notify you at{' '}
                <span className="text-[#FFC700]">{formData.email}</span> when we launch.
              </p>

              <button
                onClick={() => router.push('/')}
                className="rounded-lg bg-white px-8 py-3 text-base font-medium text-black transition-all hover:bg-white/90 md:px-12 md:py-4 md:text-lg"
              >
                Back to Home
              </button>
            </div>
          </main>
        </div>
      </>
    )
  }

  return (
    <>
      <GL />
      <div className="relative z-10 flex min-h-screen flex-col">
        <Navigation items={navigationItems} showConnectWallet />

        <main className="flex flex-1 flex-col items-center justify-center px-4 pb-20 pt-32 md:pt-40">
          <div className="w-full max-w-md">
            <div className="mb-8 text-center md:mb-12">
              <h1 className="mb-4 text-4xl font-bold text-white md:text-5xl lg:text-6xl">
                Join the Waitlist
              </h1>
              <p className="text-lg text-white/70 md:text-xl">
                Be the first to experience the future of NFT marketplaces
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-red-400">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="name" className="mb-2 block text-sm font-medium text-white">
                  Name <span className="text-[#FFC700]">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 backdrop-blur-sm transition-all focus:border-[#FFC700]/50 focus:outline-none focus:ring-2 focus:ring-[#FFC700]/20"
                  placeholder="Enter your name"
                />
              </div>

              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-white">
                  Email <span className="text-[#FFC700]">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 backdrop-blur-sm transition-all focus:border-[#FFC700]/50 focus:outline-none focus:ring-2 focus:ring-[#FFC700]/20"
                  placeholder="your.email@example.com"
                />
              </div>

              <div>
                <label htmlFor="walletAddress" className="mb-2 block text-sm font-medium text-white">
                  Solana Wallet Address <span className="text-white/40">(Optional)</span>
                </label>
                <input
                  type="text"
                  id="walletAddress"
                  name="walletAddress"
                  value={formData.walletAddress}
                  onChange={handleInputChange}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 backdrop-blur-sm transition-all focus:border-[#FFC700]/50 focus:outline-none focus:ring-2 focus:ring-[#FFC700]/20"
                  placeholder="Your Solana wallet address"
                />
              </div>

              <div>
                <label htmlFor="interest" className="mb-2 block text-sm font-medium text-white">
                  I'm interested in
                </label>
                <select
                  id="interest"
                  name="interest"
                  value={formData.interest}
                  onChange={handleInputChange}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white backdrop-blur-sm transition-all focus:border-[#FFC700]/50 focus:outline-none focus:ring-2 focus:ring-[#FFC700]/20"
                >
                  <option value="general">General marketplace access</option>
                  <option value="trading">Trading NFTs</option>
                  <option value="creating">Creating NFT collections</option>
                  <option value="investing">Investing in digital assets</option>
                  <option value="building">Building on HypeChain</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg bg-gradient-to-r from-[#FFC700] to-[#FFD700] px-8 py-4 text-lg font-medium text-black transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed md:text-xl"
              >
                {isSubmitting ? 'Joining...' : 'Join Waitlist'}
              </button>

              <p className="text-center text-sm text-white/50">
                By joining, you agree to receive updates about HypeChain
              </p>
            </form>
          </div>
        </main>
      </div>
    </>
  )
}

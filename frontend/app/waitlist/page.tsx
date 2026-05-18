'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Navigation } from '@/components/navigation'

type Intent = 'collect' | 'trade' | 'verify' | 'build'

const INTENT_OPTIONS: { value: Intent; label: string }[] = [
  { value: 'collect', label: 'Collect' },
  { value: 'trade', label: 'Trade' },
  { value: 'verify', label: 'Verify' },
  { value: 'build', label: 'Build' },
]

const NAV_ITEMS = [
  { name: 'Marketplace', href: '/marketplace' },
  { name: 'Collections', href: '/collections' },
  { name: 'Activities', href: '/activities' },
]

// Polygon clip-path tiers (DESIGN.md "Layout > Corner treatment").
const POLY_4  = 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)'
const POLY_12 = 'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)'
const POLY_16 = 'polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px)'

function buildSubmissionId(): string {
  // HC-W-NNNNNN format; mirrors listings-detail's HC-YYYY-NNNNNN case-file format.
  const n = String(Math.floor(1848 + Math.random() * 50)).padStart(6, '0')
  return `HC-W-${n}`
}

function nowIntakeStamp(): string {
  // 2026-05-18 13:47:21 EST format (case-file vocabulary)
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} EST`
}

export default function WaitlistPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    walletAddress: '',
    interest: 'collect' as Intent,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submission, setSubmission] = useState<{
    id: string
    intake: string
    email: string
    intent: Intent
  } | null>(null)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.name || !formData.email) {
      setError('Examiner Name and Email are required.')
      return
    }
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)
    if (!emailOk) {
      setError('Email address is invalid.')
      return
    }

    setIsSubmitting(true)
    try {
      // Simulated backend — matches existing stub in this file's prior version.
      // Replace with real /api/waitlist call when the endpoint is live.
      await new Promise((resolve) => setTimeout(resolve, 900))
      setSubmission({
        id: buildSubmissionId(),
        intake: nowIntakeStamp(),
        email: formData.email,
        intent: formData.interest,
      })
    } catch {
      setError('Submission failed. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="relative z-10 flex min-h-screen flex-col bg-black text-[var(--hc-text-body)]">
      <Navigation items={NAV_ITEMS} showConnectWallet />

      <main className="mx-auto grid w-full max-w-[1280px] flex-1 grid-cols-1 gap-16 px-6 pb-24 pt-32 md:pt-40 lg:grid-cols-[1.1fr_0.9fr] lg:gap-32">
        {/* LEFT: hero copy + queue rail */}
        <section>
          <div className="mb-6 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--hc-text-muted)]">
            <span className="text-[var(--hc-accent)]">[</span>
            INTAKE&nbsp;//&nbsp;HYPECHAIN-Q4-2026&nbsp;//&nbsp;BETA
            <span className="text-[var(--hc-accent)]">]</span>
          </div>

          <h1
            className="mb-8 font-sentient italic font-extralight leading-[1.02] tracking-[-0.02em] text-white"
            style={{ fontSize: 'clamp(48px, 9vw, 96px)' }}
          >
            built for <span className="italic text-[var(--hc-accent)]">verified records.</span>
          </h1>

          <p className="mb-12 max-w-[52ch] text-lg leading-[1.55] text-[var(--hc-text-body)] md:text-xl">
            HypeChain isn&apos;t a JPEG mall. Every listing is examined by an AI vision model
            before mint — physical authenticity, condition grade, market comp. The chain is
            just where the receipt lives.
          </p>

          {/* Queue rail */}
          <div className="grid grid-cols-3 border-y border-[var(--hc-hairline)]">
            <QueueCell label="In Queue" value="1,847" />
            <QueueCell label="Verified Volume" value="2.4" unit="M USDC" />
            <QueueCell label="Examiner Uptime" value="99.94" unit="%" />
          </div>
        </section>

        {/* RIGHT: intake form or receipt */}
        <section className="relative">
          <span
            className={`pointer-events-none absolute left-6 -top-2 z-[2] bg-black px-2 font-mono text-[10px] uppercase tracking-[0.22em] ${
              submission ? 'text-[var(--hc-verify-high)]' : 'text-[var(--hc-text-muted)]'
            }`}
          >
            {submission ? 'RECEIPT' : 'INTAKE'}
          </span>

          {submission ? (
            <Receipt
              submission={submission}
              onBackHome={() => router.push('/')}
              onReset={() => setSubmission(null)}
            />
          ) : (
            <form
              onSubmit={handleSubmit}
              noValidate
              className="relative border border-[var(--hc-border)] bg-[var(--hc-surface-1)] p-8 md:p-12"
              style={{ clipPath: POLY_16 }}
            >
              <header className="mb-8 flex items-baseline justify-between border-b border-[var(--hc-hairline)] pb-4">
                <span className="font-mono text-[13px] font-medium uppercase tracking-[0.16em] text-white">
                  Submit Intake
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] tabular-nums text-[var(--hc-text-muted)]">
                  FORM-W-———
                </span>
              </header>

              {error && (
                <div
                  role="alert"
                  className="mb-6 border border-[var(--hc-verify-low)]/40 bg-[var(--hc-verify-low)]/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--hc-verify-low)]"
                  style={{ clipPath: POLY_4 }}
                >
                  {error}
                </div>
              )}

              <Field
                id="name"
                label="Examiner Name"
                required
                value={formData.name}
                onChange={(v) => setFormData((p) => ({ ...p, name: v }))}
                placeholder="Jane Doe"
                autoComplete="name"
              />
              <Field
                id="email"
                label="Email"
                type="email"
                required
                value={formData.email}
                onChange={(v) => setFormData((p) => ({ ...p, email: v }))}
                placeholder="you@domain.com"
                autoComplete="email"
              />
              <Field
                id="wallet"
                label="Solana Wallet"
                optional
                value={formData.walletAddress}
                onChange={(v) => setFormData((p) => ({ ...p, walletAddress: v }))}
                placeholder="7f49aBcDe1Fg…3c2a"
                hint="Speeds verification when you mint your first listing."
                spellCheck={false}
              />

              <fieldset className="mb-6">
                <legend className="mb-2 flex w-full items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--hc-text-muted)]">
                  <span>
                    Intent <span className="opacity-60">Pick One</span>
                  </span>
                </legend>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-4" role="radiogroup" aria-label="Intent">
                  {INTENT_OPTIONS.map(({ value, label }) => {
                    const active = formData.interest === value
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setFormData((p) => ({ ...p, interest: value }))}
                        className={`cursor-pointer border px-2 py-3 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors duration-100 ${
                          active
                            ? 'border-[var(--hc-accent)] bg-[var(--hc-accent-tint)] text-[var(--hc-accent)]'
                            : 'border-[var(--hc-border)] text-[var(--hc-text-muted)] hover:border-[var(--hc-text-muted)] hover:text-white'
                        }`}
                        style={{ clipPath: POLY_4 }}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              <div className="mt-8 flex flex-col gap-3">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="relative flex w-full cursor-pointer items-center justify-center gap-2 border border-[var(--hc-accent)] bg-[var(--hc-accent)] px-6 py-5 font-mono text-[12px] font-medium uppercase tracking-[0.22em] text-black transition-[background,box-shadow] duration-200 hover:bg-[var(--hc-accent-deep)] hover:shadow-[inset_0_0_0_2px_rgba(0,0,0,0.18)] disabled:cursor-default disabled:opacity-50"
                  style={{ clipPath: POLY_12 }}
                >
                  {isSubmitting ? 'Filing…' : 'File Intake'}
                  {!isSubmitting && <span aria-hidden>▸</span>}
                </button>
                <p className="text-center font-mono text-[10px] tracking-[0.10em] text-[var(--hc-text-muted)]">
                  By filing, you consent to receive verification updates. No marketing emails.
                </p>
              </div>
            </form>
          )}
        </section>
      </main>

      <footer className="flex flex-wrap justify-between gap-4 border-t border-[var(--hc-hairline)] px-6 py-6 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--hc-text-muted)]">
        <span className="tabular-nums">HC // INTAKE 2026 // WAITLIST</span>
        <span>Verified records · Not financial advice</span>
      </footer>
    </div>
  )
}

function QueueCell({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="border-r border-[var(--hc-hairline)] py-4 first:pl-0 [&:not(:first-child)]:pl-4 last:border-r-0">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--hc-text-muted)]">
        {label}
      </div>
      <div className="font-mono text-[22px] font-medium tabular-nums tracking-[-0.01em] text-white">
        {value}
        {unit && (
          <span className="ml-1 font-mono text-[11px] font-normal tracking-[0.06em] text-[var(--hc-text-muted)]">
            {unit}
          </span>
        )}
      </div>
    </div>
  )
}

function Field({
  id,
  label,
  type = 'text',
  required,
  optional,
  value,
  onChange,
  placeholder,
  hint,
  autoComplete,
  spellCheck,
}: {
  id: string
  label: string
  type?: string
  required?: boolean
  optional?: boolean
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hint?: string
  autoComplete?: string
  spellCheck?: boolean
}) {
  return (
    <div className="mb-6">
      <label
        htmlFor={`f-${id}`}
        className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--hc-text-muted)]"
      >
        <span>
          {label}{' '}
          {required && <span className="text-[var(--hc-accent)]">*</span>}
          {optional && <span className="opacity-60">Optional</span>}
        </span>
      </label>
      <input
        id={`f-${id}`}
        name={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        spellCheck={spellCheck}
        required={required}
        className="w-full rounded-none border border-[var(--hc-border)] bg-[var(--hc-surface-2)] px-3 py-4 font-mono text-[14px] tabular-nums text-white placeholder:tracking-[0.04em] placeholder:text-[var(--hc-text-muted)] placeholder:opacity-50 outline-none transition-[border-color,box-shadow] duration-100 focus:border-[var(--hc-accent)] focus:[box-shadow:inset_0_0_0_1px_var(--hc-accent)]"
      />
      {hint && (
        <div className="mt-1 font-mono text-[10px] tracking-[0.08em] text-[var(--hc-text-muted)]">
          {hint}
        </div>
      )}
    </div>
  )
}

function Receipt({
  submission,
  onBackHome,
  onReset,
}: {
  submission: { id: string; intake: string; email: string; intent: Intent }
  onBackHome: () => void
  onReset: () => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(submission.id)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      // clipboard blocked — fail silently
    }
  }

  return (
    <div
      aria-live="polite"
      className="relative border border-[var(--hc-border)] bg-[var(--hc-surface-1)] p-8 md:p-12"
      style={{ clipPath: POLY_16 }}
    >
      <div className="mb-4 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--hc-verify-high)]">
        <span className="size-1.5 animate-pulse rounded-full bg-[var(--hc-verify-high)]" />
        Status: Queued — Verified
      </div>

      <h2
        className="mb-6 font-sentient italic font-extralight leading-[1.05] text-white"
        style={{ fontSize: '36px' }}
      >
        your intake is filed.
      </h2>

      <dl className="grid gap-1">
        <ReceiptRow label="Submission" value={submission.id} mono />
        <ReceiptRow label="Intake" value={submission.intake} />
        <ReceiptRow label="Examiner" value="VISION-4O" />
        <ReceiptRow label="Email" value={submission.email} accent />
        <ReceiptRow label="Position" value="#1,848 of 1,848" />
        <ReceiptRow label="Intent" value={submission.intent.toUpperCase()} />
        <ReceiptRow label="ETA" value="Q4 2026 — wave invitations roll weekly" />
      </dl>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="cursor-pointer border border-[var(--hc-accent)] bg-[var(--hc-accent)] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-black transition-colors hover:bg-[var(--hc-accent-deep)]"
          style={{ clipPath: POLY_4 }}
        >
          {copied ? '✓ Copied' : 'Copy Submission ID'}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="cursor-pointer border border-[var(--hc-border)] bg-transparent px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-white transition-colors hover:border-[var(--hc-text-muted)]"
          style={{ clipPath: POLY_4 }}
        >
          File Another
        </button>
        <button
          type="button"
          onClick={onBackHome}
          className="cursor-pointer border border-[var(--hc-border)] bg-transparent px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-white transition-colors hover:border-[var(--hc-text-muted)]"
          style={{ clipPath: POLY_4 }}
        >
          Back to Landing
        </button>
      </div>
    </div>
  )
}

function ReceiptRow({
  label,
  value,
  accent,
  mono,
}: {
  label: string
  value: string
  accent?: boolean
  mono?: boolean
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-4 border-b border-dashed border-[var(--hc-hairline)] py-2 font-mono text-[12px] tabular-nums last:border-b-0">
      <dt className="text-[10px] uppercase tracking-[0.16em] text-[var(--hc-text-muted)]">
        {label}
      </dt>
      <dd
        className={`break-all ${accent ? 'text-[var(--hc-accent)]' : 'text-white'} ${
          mono ? 'tracking-[0.04em]' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  )
}

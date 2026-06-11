import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { AppProvider } from '@/contexts/AppContext'
import { ToastContainer } from '@/components/toast'
import { ErrorBoundary } from '@/components/error-boundary'
import { FloatingChatButton } from '@/components/floating-chat-button'
import { PrivyProviderWrapper } from '@/components/privy-provider-wrapper'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'HypeChain - AI-Powered NFT Marketplace',
  description: 'Next-generation NFT marketplace on Solana with AI verification',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // Dark baked into the SSR HTML so the terminal aesthetic doesn't depend on
    // JS executing (no-JS, blocked inline script). The pre-paint theme script
    // only flips classes for users who chose light / system-light;
    // suppressHydrationWarning covers that mismatch.
    <html
      lang="en"
      suppressHydrationWarning
      className="dark"
      style={{ colorScheme: 'dark' }}
    >
      <body className={`font-sans antialiased`}>
        <ThemeProvider>
          <PrivyProviderWrapper>
            <ErrorBoundary>
              <AppProvider>
                {children}
                <ToastContainer />
                <FloatingChatButton />
              </AppProvider>
            </ErrorBoundary>
          </PrivyProviderWrapper>
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  )
}

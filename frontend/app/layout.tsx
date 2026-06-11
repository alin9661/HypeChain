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
    <html lang="en" suppressHydrationWarning>
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

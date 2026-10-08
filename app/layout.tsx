import { Analytics } from '@vercel/analytics/next'
import { Be_Vietnam_Pro, Cormorant_Garamond } from 'next/font/google'
import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import { CommerceApp } from '@/components/commerce-app'
import './globals.css'

const vietnameseSans = Be_Vietnam_Pro({ weight: ['400', '500', '600', '700'], subsets: ['latin', 'vietnamese'], variable: '--font-vietnamese', display: 'swap' })
const displaySerif = Cormorant_Garamond({ weight: ['400', '500', '600'], subsets: ['latin', 'vietnamese'], variable: '--font-display-serif', display: 'swap' })

export const metadata: Metadata = {
  title: 'Chipscendle — A scent a day keeps the stress away',
  description: 'Nến thơm handmade Chipscendle: những mùi hương dịu nhẹ cho góc nhà thư thái và những món quà ấm áp.',
  applicationName: 'Chipscendle',
  generator: 'Next.js',
  icons: { icon: '/logo.png', apple: '/logo.png' },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f8f7f4',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className="light" data-scroll-behavior="smooth">
      <body className={`${vietnameseSans.variable} ${displaySerif.variable} antialiased`}>
        <Suspense fallback={null}>
          <CommerceApp />
        </Suspense>
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}

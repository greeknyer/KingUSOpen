import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'King US Open Scheduler',
  description: 'US Open food service scheduling',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  )
}

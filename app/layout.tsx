import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Listening Map - Discover Your Music World',
  description: 'See where your favorite artists are from on a world map',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}



import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'FGV Descarboniza',
  description: 'Inventário de emissões de CO₂',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  )
}

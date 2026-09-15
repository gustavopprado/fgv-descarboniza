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
    // `suppressHydrationWarning` vale só para os atributos DESTE elemento, não
    // para a árvore abaixo: extensões de navegador escrevem no <html> antes de o
    // React hidratar — certificado digital, tradutor, gerenciador de senha —, e
    // o servidor não tem como prever isso. Sem a marca, todo mundo com uma
    // dessas instalada vê um erro de hidratação que não é do sistema. Divergência
    // dentro da aplicação continua sendo reportada normalmente.
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  )
}

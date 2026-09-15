import type { Metadata } from 'next'
import { Archivo, Inter } from 'next/font/google'

import './globals.css'

/**
 * As duas famílias do protótipo — CLAUDE.md §4.
 *
 * Servidas pelo próprio domínio, não pelo Google: `next/font` baixa os arquivos
 * no build e os entrega junto da aplicação. Além de evitar o salto de layout, é
 * o que impede o navegador de quem abre o painel de fazer uma requisição a
 * terceiro — não vale a pena contar ao Google quem consulta o inventário.
 */
const titulo = Archivo({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--fonte-titulo',
  display: 'swap',
})

const corpo = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--fonte-corpo',
  display: 'swap',
})

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
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${titulo.variable} ${corpo.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  )
}

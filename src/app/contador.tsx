'use client'

/**
 * Número que conta de zero até o valor — CLAUDE.md §10, comportamento do
 * protótipo.
 *
 * **O valor final é o que vem do servidor**, já no HTML. A contagem é um enfeite
 * que acontece depois, no cliente: se o script não rodar, o número correto
 * continua na tela. O contrário — renderizar zero e contar até o valor —
 * deixaria um inventário exibindo zero para quem tem JavaScript bloqueado, o
 * que num relatório de emissão é pior que não animar.
 *
 * **A volta para zero acontece antes da pintura**, com efeito de layout. Com
 * efeito comum, o navegador chegava a pintar o valor final, e o número piscava
 * — aparecia pronto, saltava para zero e só então subia. O protótipo não faz
 * isso porque lá o zero já está no HTML; aqui o zero não pode estar, então o
 * salto precisa acontecer no quadro anterior ao primeiro visível.
 *
 * Quem pede menos movimento não vê contagem nenhuma.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { numero } from '@/lib/formato'

const DURACAO_MS = 1100

/**
 * No servidor não há layout para medir, e o React avisa se `useLayoutEffect` for
 * chamado lá. Como o efeito só existe para evitar um quadro pintado errado, no
 * servidor ele simplesmente não precisa rodar.
 */
const useEfeitoDeLayout = typeof window === 'undefined' ? useEffect : useLayoutEffect

export function Contador({
  valor,
  casas = 1,
  className,
}: {
  valor: number
  casas?: number
  className?: string
}) {
  const [texto, setTexto] = useState(() => numero(valor, casas))
  const jaAnimou = useRef(false)

  useEfeitoDeLayout(() => {
    if (jaAnimou.current) return
    jaAnimou.current = true

    const querMenosMovimento = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    if (querMenosMovimento || valor === 0) return

    // Antes de qualquer pintura: o zero entra aqui, não no HTML do servidor.
    setTexto(numero(0, casas))

    let quadro = 0
    const inicio = performance.now()

    const passo = (agora: number) => {
      const p = Math.min(1, (agora - inicio) / DURACAO_MS)
      // Cúbica de saída: rápido no começo, assentando no fim.
      const eixo = 1 - Math.pow(1 - p, 3)
      setTexto(numero(valor * eixo, casas))
      if (p < 1) quadro = requestAnimationFrame(passo)
    }

    quadro = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(quadro)
  }, [valor, casas])

  return (
    // A formatação pt-BR pode divergir entre o ICU do servidor e o do
    // navegador em casos de borda. A marca vale só para este texto.
    <span className={className} suppressHydrationWarning>
      {texto}
    </span>
  )
}

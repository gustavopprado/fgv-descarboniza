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
 * **Não existe trava de "já animei", e a ausência dela é o conserto.** A versão
 * anterior guardava um `ref` para animar uma vez só. A trava jogava fora
 * justamente o número certo que este arquivo tinha acabado de colocar no HTML,
 * por dois caminhos independentes:
 *
 *  - **em desenvolvimento o React executa todo efeito duas vezes.** A primeira
 *    execução zerava o texto e agendava o quadro; a limpeza cancelava o quadro;
 *    a segunda saía na primeira linha, pela trava. O número ficava **em zero
 *    para sempre** — em todos os cartões de todas as telas;
 *  - **ao trocar o ano por um link, o componente não remonta.** O inicializador
 *    do estado não roda de novo e o efeito saía pela trava, então o número
 *    exibido **não acompanhava a prop nova**.
 *
 * Sem a trava, os dois casos se resolvem pelo mesmo caminho: o efeito recomeça a
 * contagem do zero e termina no valor atual. Reanimar de vez em quando é barato;
 * exibir zero num inventário de emissões não é.
 *
 * Quem pede menos movimento não vê contagem nenhuma — e, mesmo aí, o efeito
 * escreve o valor atual, senão a troca de ano deixaria o número anterior na
 * tela.
 *
 * **Esta classe de erro não tem guarda automática honesta.** `tsc`, `npm test` e
 * `next build` passam com e sem o defeito: ciclo de efeito e ordem de pintura só
 * existem quando há navegador pintando. Quem exercita isto é quem abre a tela.
 */
import { useEffect, useLayoutEffect, useState } from 'react'

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

  useEfeitoDeLayout(() => {
    const querMenosMovimento = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches

    if (querMenosMovimento || valor === 0) {
      // Sem animação, mas ainda assim escrevendo: na primeira montagem isto é
      // o mesmo texto e o React nem re-renderiza; numa troca de recorte é o que
      // impede o número anterior de ficar na tela.
      setTexto(numero(valor, casas))
      return
    }

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

/**
 * Raiz — CLAUDE.md §10.1.
 *
 * A Visão geral ainda não foi construída. Até lá, a raiz manda cada perfil para
 * a primeira tela que ele pode abrir: rota que existe e que ele tem direito de
 * ver, nunca uma que vá recusá-lo.
 */
import { redirect } from 'next/navigation'

import { navegacaoPara } from '@/server/consultas/navegacao'
import { exigirSessao } from '@/server/sessao'
import { Casca } from './casca'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const ctx = await exigirSessao()

  const primeira = navegacaoPara(ctx).find((i) => i.construida)
  if (primeira !== undefined) redirect(primeira.href)

  return (
    <Casca ctx={ctx} atual="/">
      <h1 className="text-2xl font-semibold text-[var(--color-folha-900)]">
        Nada por aqui ainda
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-[var(--color-folha-900)]/70">
        Nenhuma das telas do seu perfil foi construída até agora. Elas aparecem no
        menu, apagadas, à medida que forem entrando.
      </p>
    </Casca>
  )
}

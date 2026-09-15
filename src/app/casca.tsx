/**
 * Casca das telas autenticadas — CLAUDE.md §1.1, §4 e §10.
 *
 * A separação entre inventário e programa de viagens é visível na navegação
 * porque é conceitual: a primeira parte relata o que já aconteceu, a segunda
 * começa a medir daqui para a frente.
 *
 * O verde da FGV fica reservado para marca e item ativo de menu (§4).
 */
import Link from 'next/link'

import type { ContextoDeAcesso } from '@/server/consultas/acesso'
import { navegacaoPara, type ItemDeNavegacao } from '@/server/consultas/navegacao'
import { Sair } from './sair'

const TITULO_DA_SECAO = {
  inventario: 'Inventário',
  programa: 'Programa de viagens',
} as const

function Item({ item, ativo }: { item: ItemDeNavegacao; ativo: boolean }) {
  if (!item.construida) {
    return (
      <span
        className="block cursor-default rounded px-3 py-2 text-sm text-[var(--color-folha-900)]/35"
        title="Tela ainda não construída"
      >
        {item.rotulo}
      </span>
    )
  }

  return (
    <Link
      href={item.href}
      aria-current={ativo ? 'page' : undefined}
      className={
        ativo
          ? 'block rounded bg-[var(--color-fgv)]/15 px-3 py-2 text-sm font-medium text-[var(--color-folha-900)]'
          : 'block rounded px-3 py-2 text-sm text-[var(--color-folha-900)]/80 hover:bg-[var(--color-folha-300)]/50'
      }
    >
      {item.rotulo}
    </Link>
  )
}

export function Casca({
  ctx,
  atual,
  children,
}: {
  ctx: ContextoDeAcesso
  atual: string
  children: React.ReactNode
}) {
  const itens = navegacaoPara(ctx)
  const secoes = (['inventario', 'programa'] as const).filter((s) =>
    itens.some((i) => i.secao === s),
  )

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="shrink-0 border-b border-[var(--color-folha-300)] bg-[var(--color-folha-300)]/25 px-4 py-6 md:w-64 md:border-r md:border-b-0">
        <p className="px-3 text-base font-semibold text-[var(--color-fgv)]">
          FGV Descarboniza
        </p>

        <nav className="mt-6 space-y-6">
          {secoes.map((secao) => (
            <div key={secao}>
              <p className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-[var(--color-folha-900)]/50 uppercase">
                {TITULO_DA_SECAO[secao]}
              </p>
              {itens
                .filter((i) => i.secao === secao)
                .map((i) => (
                  <Item key={i.href} item={i} ativo={i.href === atual} />
                ))}
            </div>
          ))}
        </nav>

        <div className="mt-8 border-t border-[var(--color-folha-300)] px-3 pt-4">
          <p className="text-xs break-all text-[var(--color-folha-900)]/60">
            {ctx.email}
          </p>
          <p className="mt-1 text-xs text-[var(--color-folha-900)]/45">{ctx.papel}</p>
          <Sair />
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-6 py-8 md:px-10">{children}</main>
    </div>
  )
}

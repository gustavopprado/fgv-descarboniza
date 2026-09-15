/**
 * Casca das telas autenticadas — CLAUDE.md §1.1, §4 e §10.
 *
 * Segue o protótipo: menu lateral fixo em verde escuro, com as duas partes do
 * sistema rotuladas e separadas, ícone por item e barra no verde da FGV no item
 * ativo. A separação entre inventário e programa é visível porque é conceitual
 * — a primeira parte relata o que já aconteceu, a segunda começa a medir daqui
 * para a frente.
 *
 * **Uma divergência deliberada do protótipo:** lá o menu simplesmente desaparece
 * abaixo de 1000px, o que deixaria quem abre no celular sem navegação nenhuma.
 * Aqui ele vira uma barra horizontal rolável no topo. O protótipo é referência
 * visual, não especificação de comportamento em tela pequena.
 */
import Link from 'next/link'

import type { ContextoDeAcesso } from '@/server/consultas/acesso'
import { navegacaoPara, type ItemDeNavegacao } from '@/server/consultas/navegacao'
import { IconeDaRota } from './icones'
import { Sair } from './sair'

const TITULO_DA_SECAO = {
  inventario: 'Inventário',
  programa: 'Programa de viagens',
} as const

const NOME_DO_PAPEL: Record<ContextoDeAcesso['papel'], string> = {
  admin: 'Administrador',
  sustentabilidade: 'Sustentabilidade',
  gestor: 'Gestor de área',
  importacao: 'Importação',
  colaborador: 'Colaborador',
}

function Item({ item, ativo }: { item: ItemDeNavegacao; ativo: boolean }) {
  const base =
    'flex shrink-0 items-center gap-2.5 border-l-[3px] py-2.5 pr-5 pl-[19px] text-[13.5px] transition-colors duration-150 max-md:border-l-0 max-md:border-b-[3px] max-md:px-4 max-md:py-3'

  if (!item.construida) {
    return (
      <span
        className={`${base} cursor-default border-transparent text-[var(--color-escuro-apoio)]/60`}
        title="Tela ainda não construída"
      >
        <IconeDaRota href={item.href} className="size-4 shrink-0 opacity-60" />
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
          ? `${base} border-[var(--color-fgv)] bg-[var(--color-fgv)]/14 font-medium text-white`
          : `${base} border-transparent text-[var(--color-escuro-forte)] hover:bg-white/5 hover:text-white`
      }
    >
      <IconeDaRota href={item.href} className="size-4 shrink-0 opacity-85" />
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
      <nav className="shrink-0 bg-[var(--color-escuro)] text-[var(--color-escuro-texto)] md:sticky md:top-0 md:h-screen md:w-[232px] md:flex-none md:flex-col md:overflow-y-auto md:pt-[22px] md:pb-[18px] flex flex-col">
        <div className="px-5 pt-4 pb-4 md:pb-5">
          <p className="font-[family-name:var(--font-titulo)] text-base font-semibold tracking-[-0.01em] text-white">
            Descarboniza
          </p>
          <p className="text-[11px] text-[var(--color-escuro-apoio)]">
            Inventário de emissões
          </p>
        </div>

        {/* Em tela estreita as duas seções viram uma faixa rolável: rótulo de
            seção como divisor inline, para não gastar altura. */}
        <div className="max-md:flex max-md:overflow-x-auto">
          {secoes.map((secao, indice) => (
            <div
              key={secao}
              className={
                indice > 0
                  ? 'md:mt-3 md:border-t md:border-white/10 md:pt-3'
                  : undefined
              }
            >
              <p className="px-[22px] pt-3.5 pb-1.5 text-[11px] tracking-[0.02em] text-[var(--color-escuro-apoio)] max-md:hidden">
                {TITULO_DA_SECAO[secao]}
              </p>
              <div className="max-md:flex">
                {itens
                  .filter((i) => i.secao === secao)
                  .map((i) => (
                    <Item key={i.href} item={i} ativo={i.href === atual} />
                  ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-auto border-t border-white/10 px-[22px] pt-3.5 text-[11.5px] text-[var(--color-escuro-apoio)] max-md:hidden">
          <b className="block truncate font-medium text-[var(--color-escuro-forte)]">
            {ctx.email}
          </b>
          {NOME_DO_PAPEL[ctx.papel]}
          <Sair />
        </div>
      </nav>

      <main className="min-w-0 max-w-[1180px] flex-1 px-[18px] pt-[22px] pb-[60px] md:px-10 md:pt-[30px] md:pb-[70px]">
        {children}

        {/* Em tela estreita a identificação e a saída ficam no fim da página:
            a faixa do topo é só navegação. */}
        <div className="mt-10 border-t border-[var(--color-linha)] pt-4 text-[11.5px] text-[var(--color-apoio)] md:hidden">
          <b className="block font-medium text-[var(--color-tinta)]">{ctx.email}</b>
          {NOME_DO_PAPEL[ctx.papel]}
          <Sair />
        </div>
      </main>
    </div>
  )
}

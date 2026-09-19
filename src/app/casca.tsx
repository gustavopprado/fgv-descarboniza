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
 *
 * **A segunda divergência, e ela é sobre largura.** O protótipo dá ao conteúdo
 * `max-width:1180px` sem `margin:0 auto` — ancorado à esquerda, com o resto da
 * tela em branco. O código copiava isso fielmente, então num monitor de 1920 o
 * conteúdo parava a 508px da borda direita, e num de 2560 a 1148px.
 *
 * **A casca é contêiner, não medida.** Ela cresce com a tela; quem declara
 * limite é cada peça, pelo motivo dela: prosa tem medida de leitura em `ch`,
 * desenho tem teto em pixel porque `viewBox` amplia em vez de reflui, e tabela
 * não tem limite nenhum porque largura ali vira coluna legível. Teto na casca
 * seria um número arbitrário que devolveria o mesmo branco um monitor adiante.
 *
 * O ajuste está calibrado para 1366–2000px. Acima disso o branco não some: ele
 * migra para dentro dos painéis, em volta das figuras que têm teto, e o conserto
 * é a grade reorganizar — não a casca voltar a ter limite.
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
          {/* Dimensões explícitas para o bloco não pular enquanto a imagem
              carrega. É `img` e não o componente de imagem do framework de
              propósito: são 21 KB estáticos, e a pipeline de otimização não tem
              o que otimizar aqui. */}
          <img
            src="/descarboniza.png"
            alt="FGV"
            width={112}
            height={43}
            className="mb-2 block h-auto w-[112px]"
          />
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

      {/* Sem `max-w`: ver o cabeçalho deste arquivo. O padding sobe um degrau
          em tela larga para o conteúdo não encostar na borda do monitor. */}
      <main className="min-w-0 flex-1 px-[18px] pt-[22px] pb-[60px] md:px-10 md:pt-[30px] md:pb-[70px] xl:px-14">
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

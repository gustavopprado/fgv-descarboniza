/**
 * Peças compartilhadas das telas — CLAUDE.md §4 e §10.
 *
 * A anatomia vem do protótipo: painel branco com borda fina, cartão de
 * indicador em quatro camadas, tabela com coluna numérica à direita, grades
 * nomeadas e entrada em cascata. Elas existem aqui, e não copiadas em cada
 * tela, porque o protótipo define **um sistema**, não decoração por tela: o
 * mesmo painel e o mesmo cartão aparecem nas sete.
 *
 * Nenhuma peça conhece Firestore, papel ou consulta. Recebem o que já saiu da
 * camada de consulta e desenham.
 */
import Link from 'next/link'

import { inteiro, numero, proporcao } from '@/lib/formato'
import type { Grupo } from '@/server/consultas/agregacao'
import { Contador } from './contador'

/* ------------------------------------------------------------- cascata */

/**
 * Entrada em cascata.
 *
 * O atraso é calculado no servidor e vai como `animation-delay`; a animação é
 * de CSS e termina sozinha no estado final, mesmo sem JavaScript (ver
 * `globals.css`). `ordem` é a posição do bloco na tela.
 */
export function Revelar({
  ordem = 0,
  className,
  children,
}: {
  ordem?: number
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={className === undefined ? 'revelar' : `revelar ${className}`}
      style={{ animationDelay: `${ordem * 90}ms` }}
    >
      {children}
    </div>
  )
}

/* -------------------------------------------------------------- grades */

const GRADE = {
  /** Três colunas iguais — os cartões de indicador. */
  tres: 'grid gap-4 md:grid-cols-3',
  /** Duas colunas iguais. */
  duas: 'grid gap-4 md:grid-cols-2',
  /**
   * Assimétrica: o desenho grande à esquerda, o gráfico à direita.
   *
   * Divide só a partir de `lg`, e não de `md` como as outras. O que vai à
   * esquerda aqui é largo por natureza — um radar, uma tabela de cinco colunas —,
   * e em 900px a coluna de 1,55fr já é estreita demais para ele: a tabela
   * espreme coluna até número encostar em data. Empilhado é melhor que espremido.
   */
  larga: 'grid gap-4 lg:grid-cols-[1.55fr_1fr]',
} as const

export function Grade({
  tipo,
  className,
  children,
}: {
  tipo: keyof typeof GRADE
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className === undefined ? GRADE[tipo] : `${GRADE[tipo]} ${className}`}>
      {children}
    </div>
  )
}

/* -------------------------------------------------------------- painel */

/** A superfície de tudo: branco, borda fina, raio 14. Sem sombra. */
export function Painel({
  titulo,
  descricao,
  className,
  id,
  children,
}: {
  titulo?: string
  descricao?: string
  className?: string
  /** Âncora, para um recorte que troca de endereço devolver a rolagem aqui. */
  id?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-6 rounded-[var(--radius-painel)] border border-[var(--color-linha)] bg-[var(--color-superficie)] px-[22px] py-5 ${className ?? ''}`}
    >
      {titulo !== undefined && (
        <h2 className="text-[14.5px] font-semibold text-[var(--color-tinta)]">
          {titulo}
        </h2>
      )}
      {descricao !== undefined && (
        <p className="mt-0.5 mb-4 max-w-[62ch] text-[12.5px] text-[var(--color-apoio)]">
          {descricao}
        </p>
      )}
      {children}
    </section>
  )
}

/**
 * Bloco de seção sem superfície, para agrupar painéis sob um título.
 * Mantido porque a tela de Método organiza conteúdo longo em blocos.
 */
export function Secao({
  titulo,
  descricao,
  children,
}: {
  titulo: string
  descricao?: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-4">
      <h2 className="text-[14.5px] font-semibold text-[var(--color-tinta)]">{titulo}</h2>
      {descricao !== undefined && (
        <p className="mt-0.5 max-w-[62ch] text-[12.5px] text-[var(--color-apoio)]">
          {descricao}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[11px] border border-dashed border-[var(--color-linha)] px-4 py-6 text-[13px] text-[var(--color-apoio)]">
      {children}
    </p>
  )
}

/* ------------------------------------------------------------ etiqueta */

export function Etiqueta({
  tom = 'neutro',
  children,
}: {
  tom?: 'neutro' | 'atencao'
  children: React.ReactNode
}) {
  return (
    <span
      className={
        tom === 'atencao'
          ? 'inline-block rounded-full bg-[#FBEED3] px-2 py-0.5 text-[11px] font-medium text-[#8A6A1C]'
          : 'inline-block rounded-full bg-[var(--color-folha-300)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-folha-900)]'
      }
    >
      {children}
    </span>
  )
}

/* ------------------------------------------------------------- cartão */

/**
 * Cartão de indicador, nas quatro camadas do protótipo: rótulo, valor com
 * unidade, nota e etiqueta.
 *
 * O valor conta de zero até o número quando `casas` é informado — e o número
 * correto é o que está no HTML, então a contagem é enfeite, não conteúdo (ver
 * `contador.tsx`). A unidade fica ao lado do número, nunca implícita.
 */
export function Cartao({
  rotulo,
  valor,
  unidade,
  nota,
  casas,
  etiqueta,
}: {
  rotulo: string
  valor: number
  unidade: string
  nota?: string
  /** Casas decimais; padrão uma, como no resto do painel. */
  casas?: number
  etiqueta?: { texto: string; tom?: 'neutro' | 'atencao' }
}) {
  const decimais = casas ?? 1

  return (
    <Painel>
      <p className="text-[12.5px] text-[var(--color-apoio)]">{rotulo}</p>
      <p className="mt-0.5 font-[family-name:var(--font-titulo)] text-[33px] font-bold tracking-[-0.03em] text-[var(--color-tinta)] tabular-nums">
        <Contador valor={valor} casas={decimais} />
        <span className="ml-1.5 text-[14px] font-semibold text-[var(--color-apoio)]">
          {unidade}
        </span>
      </p>
      {nota !== undefined && (
        <p className="mt-0.5 text-[12px] text-[var(--color-apoio)]">{nota}</p>
      )}
      {etiqueta !== undefined && (
        <p className="mt-2.5">
          <Etiqueta tom={etiqueta.tom}>{etiqueta.texto}</Etiqueta>
        </p>
      )}
    </Painel>
  )
}

/* ------------------------------------------------------------- tabela */

/**
 * Classes da tabela, em vez de componentes.
 *
 * Tabela com componente para cada célula fica ilegível no lugar onde é escrita,
 * e o ganho seria só não repetir uma string. As classes mantêm o markup natural
 * e a aparência num lugar só.
 *
 * **Toda célula tem folga horizontal, e as das pontas não.** Sem ela, uma coluna
 * numérica alinhada à direita encosta na coluna de texto seguinte e os dois
 * valores se leem como um só — foi o que aconteceu entre "Trechos" e "Período"
 * nas tabelas de viagem, inclusive no cabeçalho. Zerar a folga na primeira e na
 * última mantém a tabela rente à borda do painel, como o protótipo desenha.
 */
const FOLGA = 'px-2 first:pl-0 last:pr-0'

export const TABELA = {
  tabela: 'w-full border-collapse text-[13px]',
  th: `border-b border-[var(--color-linha)] pb-2.5 ${FOLGA} text-left text-[11.5px] font-medium text-[var(--color-apoio)]`,
  thNum: `border-b border-[var(--color-linha)] pb-2.5 ${FOLGA} text-right text-[11.5px] font-medium text-[var(--color-apoio)]`,
  td: `border-b border-[#EDF2EB] py-2.5 ${FOLGA}`,
  tdNum: `border-b border-[#EDF2EB] py-2.5 ${FOLGA} text-right tabular-nums`,
} as const

/** Nota de rodapé de painel, acima de uma linha. */
export function Nota({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 border-t border-[var(--color-linha)] pt-3 text-[12px] text-[var(--color-apoio)]">
      {children}
    </p>
  )
}

/* ---------------------------------------------------- seletor de ano */

/**
 * Corte por período (§10.1), em pílulas.
 *
 * Cada opção é um link de verdade: o corte fica no endereço, então recarregar
 * mantém o recorte e o ano escolhido pode ser enviado a outra pessoa.
 */
export function SeletorDeAno({
  anos,
  atual,
  href,
  rotuloDeTodos = 'Todos os anos',
}: {
  anos: number[]
  atual: number | null
  href: (ano: number | null) => string
  rotuloDeTodos?: string
}) {
  if (anos.length < 2) return null

  const opcao = (ativo: boolean) =>
    ativo
      ? 'rounded-[7px] bg-[var(--color-superficie)] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--color-tinta)] shadow-[0_1px_3px_rgba(34,51,31,.1)]'
      : 'rounded-[7px] px-3.5 py-1.5 text-[13px] text-[var(--color-apoio)] transition-colors duration-150 hover:text-[var(--color-tinta)]'

  return (
    <div className="flex shrink-0 gap-0.5 rounded-[9px] bg-[#E2EADF] p-[3px]">
      <Link href={href(null)} className={opcao(atual === null)}>
        {rotuloDeTodos}
      </Link>
      {anos.map((ano) => (
        <Link key={ano} href={href(ano)} className={opcao(atual === ano)}>
          {ano}
        </Link>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------ cabeçalho */

export function Cabecalho({
  titulo,
  descricao,
  acao,
}: {
  titulo: string
  descricao?: string
  acao?: React.ReactNode
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-5">
      <div>
        <h1 className="text-[27px] font-semibold text-[var(--color-tinta)]">{titulo}</h1>
        {descricao !== undefined && (
          <p className="mt-1.5 max-w-[62ch] text-[13.5px] text-[var(--color-apoio)]">
            {descricao}
          </p>
        )}
      </div>
      {acao}
    </header>
  )
}

/* -------------------------------------------------------- lista de grupos */

/**
 * Lista de grupos com barra proporcional.
 *
 * O grupo que veio da supressão de recortes pequenos (§3.1) é marcado: sem a
 * marca, "outros" parece uma categoria da pesquisa em vez do que é — um balde
 * que existe para não identificar ninguém.
 */
export function ListaDeGrupos({
  grupos,
  unidade = 'kg CO₂',
  mostrarPessoas = true,
}: {
  grupos: Grupo[]
  unidade?: string
  mostrarPessoas?: boolean
}) {
  if (grupos.length === 0) {
    return <Vazio>Nada a exibir neste recorte.</Vazio>
  }

  const maior = grupos.reduce((m, g) => Math.max(m, g.co2Kg), 0)
  const total = grupos.reduce((s, g) => s + g.co2Kg, 0)

  return (
    <ul className="space-y-3">
      {grupos.map((grupo) => (
        <li key={grupo.rotulo}>
          <div className="flex items-baseline justify-between gap-4 text-[13px]">
            <span className="text-[var(--color-tinta)]">
              {grupo.rotulo}
              {grupo.agrupadoPorSupressao && (
                <span
                  className="ml-2 rounded bg-[var(--color-folha-300)] px-1.5 py-0.5 text-[11px] text-[var(--color-folha-900)]"
                  title="Recortes pequenos demais para serem exibidos sem identificar quem está neles"
                >
                  recortes agrupados
                </span>
              )}
            </span>
            <span className="shrink-0 text-[var(--color-apoio)] tabular-nums">
              {numero(grupo.co2Kg)} {unidade}
              {total > 0 && (
                <span className="ml-2 text-[var(--color-apoio)]/70">
                  {proporcao(grupo.co2Kg / total)}
                </span>
              )}
            </span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded bg-[#E7EFE5]">
            <div
              className="h-full rounded bg-[var(--color-folha-700)]"
              style={{ width: `${maior > 0 ? (grupo.co2Kg / maior) * 100 : 0}%` }}
            />
          </div>
          {mostrarPessoas && (
            <p className="mt-1 text-[11.5px] text-[var(--color-apoio)]/80">
              {inteiro(grupo.pessoas)} {grupo.pessoas === 1 ? 'pessoa' : 'pessoas'}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}

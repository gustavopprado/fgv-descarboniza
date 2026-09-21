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

/**
 * As grades dos painéis.
 *
 * **Toda uma delas começa por `items-start`, e é a regra que governa a altura:
 * a borda de um painel encosta no conteúdo dele, sempre.** O padrão do CSS é o
 * contrário — item de grade estica até a altura da linha —, e o efeito é que o
 * painel mais curto ganha o tamanho do mais alto e a diferença vira branco
 * dentro de uma caixa branca com borda. Isso não se lê como "este painel é
 * pequeno"; lê-se como dado faltando, que é a pior coisa que um inventário pode
 * insinuar sem querer.
 *
 * Na Mobilidade essa diferença chegava a quase quatrocentos pixels: o painel do
 * radar é alto por natureza e o do gráfico ao lado é baixo, e a grade esticava o
 * segundo até o primeiro.
 *
 * **Vale inclusive para a linha de cartões, e isso é decisão do Gustavo contra a
 * minha recomendação.** Eu havia proposto manter os cartões esticados, porque
 * altura igual numa linha de cartões se lê como deliberado. O argumento que
 * venceu é mais forte: **o conteúdo do cartão é estático** — rótulo, número,
 * nota e etiqueta, e a nota não muda de tamanho entre uma carga e outra. Altura
 * igual comprada com um gap grande num cartão pequeno paga um preço certo por um
 * risco que não existe.
 *
 * O preço aceito é a borda inferior da linha ficar serrilhada quando as notas
 * têm comprimentos diferentes. Em tela estreita não existe: as três grades viram
 * uma coluna só.
 *
 * **E toda uma delas zera o `min-width` dos próprios itens, que é o que impede a
 * grade de crescer por dentro.** O mínimo automático de um item de grade é o
 * min-content dele, e um item que contém algo com largura mínima declarada —
 * como o envoltório de rolagem do `Rolavel` — arrasta esse mínimo para a
 * coluna. A coluna cresce, a grade passa do contêiner e **a página inteira
 * ganha rolagem lateral**, com o envoltório de rolagem nunca chegando a rolar:
 * ele não precisa, porque tudo cedeu para ele.
 *
 * Medido num aparelho de 390px: o painel saía com 622px e a página com 640 de
 * largura rolável. Com `min-width: 0` no item, painel 354 e página 390 — e o
 * envoltório passando a de fato rolar, com 352 visíveis para 620 de conteúdo.
 * `grid-cols-1` não resolve: o problema é o mínimo do item, não o número de
 * colunas.
 */
const GRADE = {
  /** Três colunas iguais — os cartões de indicador. */
  tres: 'grid items-start gap-4 [&>*]:min-w-0 md:grid-cols-3',
  /** Duas colunas iguais. */
  duas: 'grid items-start gap-4 [&>*]:min-w-0 md:grid-cols-2',
  /**
   * Assimétrica: o desenho grande à esquerda, o gráfico à direita.
   *
   * Divide só a partir de `lg`, e não de `md` como as outras. O que vai à
   * esquerda aqui é largo por natureza — um radar, uma tabela de cinco colunas —,
   * e em 900px a coluna de 1,55fr já é estreita demais para ele: a tabela
   * espreme coluna até número encostar em data. Empilhado é melhor que espremido.
   */
  larga: 'grid items-start gap-4 [&>*]:min-w-0 lg:grid-cols-[1.55fr_1fr]',
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
 * Estado vazio.
 *
 * **A caixa ocupa a largura inteira e o texto dentro dela é que tem medida.**
 * A caixa é um indicador de estado — "não há nada aqui" —, e encolhê-la para a
 * medida do texto faria a ausência parecer menor do que é. Sem a medida no
 * texto, numa casca sem teto (ver `casca.tsx`) a frase vira uma linha de
 * duzentos caracteres.
 */
export function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[11px] border border-dashed border-[var(--color-linha)] px-4 py-6">
      <p className="max-w-[80ch] text-[13px] text-[var(--color-apoio)]">{children}</p>
    </div>
  )
}

/* ------------------------------------------------------------- rolagem */

/**
 * Abaixo de uma largura mínima, o bloco rola em vez de encolher.
 *
 * **É a outra metade do teto do passo 1.** Lá o perigo era o desenho ampliar
 * sem limite num monitor largo; aqui é o contrário, e é pior, porque o que
 * encolhe é o texto: num celular de 360px o painel tem 280px úteis, e a série
 * mensal saía com rótulo de mês a 6,7px e 23px por barra. Texto desse tamanho
 * não é texto pequeno — é sujeira no desenho. Com as duas pontas, cada desenho
 * vive entre 0,9× e 1,25× da própria escala: nunca menor, nunca maior.
 *
 * Tabela é o mesmo problema por outro caminho. Cinco colunas em 280px dão 56px
 * cada, e só a coluna de período precisa de mais que isso — a tabela estoura o
 * painel e **empurra a página inteira para rolar de lado**, que é o defeito que
 * se sente e não se localiza.
 *
 * **A sangria existe para a rolagem não parecer corte.** Sem ela a faixa que
 * rola começa depois do respiro do painel, e o conteúdo some no meio de uma
 * margem branca, como se estivesse quebrado. Com ela, o conteúdo em repouso
 * continua alinhado e, ao rolar, viaja até a borda do painel.
 *
 * **E o mínimo vale só a partir de `sm`, que é a correção mais importante
 * desta peça.** No celular, rolar de lado é o próprio defeito: quem abre a tela
 * precisa ver o que tem nela, e não descobrir por arrasto que existia uma
 * coluna de emissão fora do quadro. Abaixo de 640px o mínimo é zero e nada rola
 * — quem se adapta é o conteúdo: a tabela vira lista (`tabela-empilha`, em
 * `globals.css`) e o desenho esconde o que ficaria ilegível, declarando o que
 * escondeu. **Encolher, rolar e mudar de forma são três respostas diferentes**,
 * e só a terceira serve num telefone.
 *
 * `tabIndex` porque região que rola precisa ser alcançável pelo teclado. Os
 * navegadores novos já fazem isso sozinhos; os outros, não. O custo é uma parada
 * de tabulação a mais no desktop, onde a largura sempre passa do mínimo e nada
 * chega a rolar.
 */
export function Rolavel({
  minimo,
  maximo,
  /** Respiro lateral de quem contém — o padrão é o do `Painel`. */
  sangria = 22,
  children,
}: {
  minimo: number
  maximo?: number
  sangria?: number
  children: React.ReactNode
}) {
  return (
    <div style={maximo === undefined ? undefined : { maxWidth: maximo }}>
      <div
        tabIndex={0}
        className="rolavel overflow-x-auto"
        style={
          {
            marginInline: -sangria,
            paddingInline: sangria,
            '--minimo': `${minimo}px`,
          } as React.CSSProperties
        }
      >
        <div>{children}</div>
      </div>
    </div>
  )
}

/** Larguras mínimas por forma de tabela, para não ficarem soltas no meio da tela. */
export const MINIMO = {
  /** Três colunas, uma delas de texto corrido. */
  tabela3: 420,
  /** Cinco colunas, com a de período — a forma mais comum aqui. */
  tabela5: 520,
} as const

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
 *
 * **A nota do cartão é a única prosa do sistema sem medida de leitura, e é
 * exceção de propósito.** A regra é que toda peça declare o próprio limite; a
 * exceção é prosa dentro de uma caixa que já é o limite. O cartão é um terço da
 * linha, e a nota é o que o preenche: dar-lhe 62ch faria o cartão encolher em
 * altura e abrir vazio à direita do texto, em vez de refluir. Ao alargar a tela
 * o cartão fica mais baixo, não mais vazio.
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
  /**
   * A prosa do cartão. É `ReactNode` porque uma declaração que precisa aparecer
   * em mais de um lugar da tela vira componente — e componente duplicado em
   * string é o jeito de garantir que uma das cópias envelheça.
   */
  nota?: React.ReactNode
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
  tabela: 'tabela-empilha w-full border-collapse text-[13px]',
  th: `border-b border-[var(--color-linha)] pb-2.5 ${FOLGA} text-left text-[11.5px] font-medium text-[var(--color-apoio)]`,
  thNum: `border-b border-[var(--color-linha)] pb-2.5 ${FOLGA} text-right text-[11.5px] font-medium text-[var(--color-apoio)]`,
  td: `border-b border-[#EDF2EB] py-2.5 ${FOLGA}`,
  tdNum: `border-b border-[#EDF2EB] py-2.5 ${FOLGA} text-right tabular-nums`,
} as const

/**
 * Nota de rodapé de painel, acima de uma linha.
 *
 * A linha atravessa o painel inteiro — ela separa —, e o texto tem medida de
 * leitura. Ela aparece em painel de largura inteira (a tabela de rotas), então
 * sem medida seria a peça de prosa mais larga do sistema.
 */
export function Nota({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 border-t border-[var(--color-linha)] pt-3">
      <p className="max-w-[80ch] text-[12px] text-[var(--color-apoio)]">{children}</p>
    </div>
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

  // `max-sm:py-3` leva a pílula de 32 para 44px de altura no celular, que é o
  // alvo de toque mínimo. No desktop a densidade não muda.
  const opcao = (ativo: boolean) =>
    ativo
      ? 'rounded-[7px] bg-[var(--color-superficie)] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--color-tinta)] shadow-[0_1px_3px_rgba(34,51,31,.1)] max-sm:py-3'
      : 'rounded-[7px] px-3.5 py-1.5 text-[13px] text-[var(--color-apoio)] transition-colors duration-150 hover:text-[var(--color-tinta)] max-sm:py-3'

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

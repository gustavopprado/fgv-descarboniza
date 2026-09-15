/**
 * Gráfico de barras vertical — CLAUDE.md §10, comportamento do protótipo.
 *
 * SVG, com eixo de base, valor no topo da barra e rótulo embaixo. As barras
 * crescem da base pela animação de CSS (`crescer`, em `globals.css`), com
 * atraso por barra: como é animação e não transição, ela termina na altura
 * final mesmo sem JavaScript.
 *
 * A geometria mora em `src/lib/barras.ts`, testada — aqui só se desenha. O
 * componente é de servidor e recebe rótulo e valor, nada mais: ele não sabe o
 * que é uma pessoa, um grupo ou um mês, então não há o que vazar por aqui
 * (§3.1). A marcação de supressão e a da troca de fonte chegam como duas
 * variáveis visuais, decididas por quem chama.
 */
import { montarBarras } from '@/lib/barras'
import { numero } from '@/lib/formato'

export type BarraDoGrafico = {
  rotulo: string
  valor: number
  /** Chama atenção para a barra — a troca de fonte na série mensal (§7). */
  destaque?: boolean
  /** Barra que não é uma categoria real: o balde de recortes suprimidos. */
  atenuada?: boolean
}

export function GraficoDeBarras({
  barras,
  unidade,
  casas = 1,
  largura = 420,
  altura = 260,
}: {
  barras: BarraDoGrafico[]
  unidade?: string
  casas?: number
  largura?: number
  altura?: number
}) {
  if (barras.length === 0) return null

  // A geometria preserva a ordem da entrada, então a marcação visual de cada
  // barra é encontrada pelo índice. Por rótulo, duas categorias homônimas
  // colapsariam numa só — e rótulo repetido não é impossível.
  const desenho = montarBarras(barras, { largura, altura })

  return (
    <svg
      viewBox={`0 0 ${largura} ${altura}`}
      className="block h-auto w-full"
      role="img"
      aria-label={`Gráfico de barras com ${barras.length} ${barras.length === 1 ? 'categoria' : 'categorias'}.`}
    >
      <line
        x1={15}
        y1={desenho.base}
        x2={largura - 6}
        y2={desenho.base}
        stroke="var(--color-linha)"
        strokeWidth={1}
      />

      {desenho.barras.map((barra, i) => {
        const estilo = barras[i]
        const meio = barra.x + barra.largura / 2

        return (
          <g key={`${barra.rotulo}-${i}`}>
            <rect
              className="crescer"
              style={{ animationDelay: `${i * 60}ms` }}
              x={barra.x}
              y={barra.y}
              width={barra.largura}
              height={barra.altura}
              rx={4}
              fill={
                estilo?.destaque === true
                  ? 'var(--color-fgv)'
                  : estilo?.atenuada === true
                    ? 'var(--color-folha-500)'
                    : 'var(--color-folha-700)'
              }
            >
              {/* Um filho só, e já montado: o analisador de HTML trata o
                  conteúdo de `title` como texto cru, então vários filhos viram
                  marcadores de comentário no meio do texto e a hidratação
                  falha. */}
              <title>
                {`${barra.rotulo}: ${numero(barra.valor, casas)}${
                  unidade === undefined ? '' : ` ${unidade}`
                }`}
              </title>
            </rect>

            {desenho.mostrarValores && (
              <text
                x={meio}
                y={barra.y - 6}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill="var(--color-tinta)"
              >
                {numero(barra.valor, casas)}
              </text>
            )}

            {i % desenho.saltoDoRotulo === 0 && (
              <text
                x={meio}
                y={desenho.base + 15}
                textAnchor="middle"
                fontSize={10}
                fontWeight={estilo?.destaque === true ? 600 : 400}
                fill={
                  estilo?.destaque === true
                    ? 'var(--color-tinta)'
                    : 'var(--color-apoio)'
                }
              >
                {barra.rotulo}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

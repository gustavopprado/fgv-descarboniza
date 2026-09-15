/**
 * Geometria do gráfico de barras — CLAUDE.md §10.
 *
 * Separado do componente pelo mesmo motivo do radar e do mapa: é aqui que
 * moram as divisões que podem estourar — série toda zerada, uma barra só,
 * valor único — e é isto que dá para testar sem navegador.
 *
 * O módulo só conhece número e rótulo. Não sabe o que é pessoa, grupo ou mês.
 */
export type ValorDaBarra = { rotulo: string; valor: number }

export type BarraDesenhada = {
  rotulo: string
  valor: number
  x: number
  y: number
  largura: number
  altura: number
}

export type Barras = {
  barras: BarraDesenhada[]
  /** Linha de base, onde o eixo é desenhado. */
  base: number
  /** Rótulo em uma barra a cada tantas; série longa não cabe com todos. */
  saltoDoRotulo: number
  /** Valor escrito no topo só quando há espaço para todos. */
  mostrarValores: boolean
}

/** Folga acima da maior barra, para o número no topo não encostar na borda. */
const FOLGA = 1.18

export function montarBarras(
  valores: ValorDaBarra[],
  opcoes: { largura: number; altura: number; recuo?: number },
): Barras {
  const recuo = opcoes.recuo ?? 30
  const base = opcoes.altura - recuo
  const n = valores.length

  if (n === 0) {
    return { barras: [], base, saltoDoRotulo: 1, mostrarValores: false }
  }

  const maior = valores.reduce((m, v) => Math.max(m, v.valor), 0)
  const teto = maior * FOLGA
  const passo = (opcoes.largura - recuo) / n
  const espessura = passo * 0.62
  const alturaUtil = base - 16

  const barras = valores.map((v, i) => {
    // Série inteira zerada não tem escala: todas as barras ficam rentes à
    // base, em vez de virarem NaN ou ocuparem a altura toda.
    const proporcao = teto > 0 ? v.valor / teto : 0
    // Valor pequeno mas não nulo ganha um fio de altura: barra invisível e
    // barra ausente parecem a mesma coisa, e não são.
    const altura = v.valor > 0 ? Math.max(proporcao * alturaUtil, 2) : 0

    return {
      rotulo: v.rotulo,
      valor: v.valor,
      x: recuo / 2 + passo * i + (passo - espessura) / 2,
      y: base - altura,
      largura: espessura,
      altura,
    }
  })

  return {
    barras,
    base,
    saltoDoRotulo: n > 14 ? 2 : 1,
    mostrarValores: n <= 12,
  }
}

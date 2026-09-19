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

/* ------------------------------------------------------ barras empilhadas */

/** Uma coluna da série empilhada: as partes vêm na ordem em que se empilham. */
export type ValorEmpilhado = { rotulo: string; partes: number[] }

export type SegmentoDesenhado = {
  /** Posição da parte na ordem de entrada — é ela que escolhe a cor. */
  parte: number
  valor: number
  y: number
  altura: number
}

export type BarraEmpilhadaDesenhada = {
  rotulo: string
  total: number
  x: number
  largura: number
  /** Da base para cima, na ordem de entrada. */
  segmentos: SegmentoDesenhado[]
}

export type BarrasEmpilhadas = {
  barras: BarraEmpilhadaDesenhada[]
  base: number
  saltoDoRotulo: number
  mostrarValores: boolean
}

/**
 * Geometria da série empilhada — CLAUDE.md §10.0.
 *
 * **Não há altura mínima por segmento, ao contrário da barra simples**, e a
 * diferença é de significado, não de gosto. Na barra simples o fio de dois
 * pixels existe para barra pequena não se confundir com barra ausente, e ele não
 * custa nada porque a barra não é parte de nada. Aqui a altura da coluna **é** o
 * total do mês: dar um mínimo a cada banda faria a pilha somar mais que a
 * própria coluna, e o desenho passaria a afirmar um total que o número ao lado
 * não tem. Banda pequena demais para ser vista continua legível no rótulo de
 * cada segmento e na tabela do módulo.
 *
 * A escala é sobre o **total do mês**, não sobre a maior banda: é a soma que a
 * tela lê, e é ela que precisa caber.
 */
export function montarBarrasEmpilhadas(
  valores: ValorEmpilhado[],
  opcoes: { largura: number; altura: number; recuo?: number },
): BarrasEmpilhadas {
  const recuo = opcoes.recuo ?? 30
  const base = opcoes.altura - recuo
  const n = valores.length

  if (n === 0) {
    return { barras: [], base, saltoDoRotulo: 1, mostrarValores: false }
  }

  const totais = valores.map((v) => v.partes.reduce((s, p) => s + p, 0))
  const maior = totais.reduce((m, t) => Math.max(m, t), 0)
  const teto = maior * FOLGA
  const passo = (opcoes.largura - recuo) / n
  const espessura = passo * 0.62
  const alturaUtil = base - 16

  const barras = valores.map((v, i) => {
    // Série inteira zerada não tem escala: tudo fica rente à base em vez de
    // virar NaN. Mesma guarda da barra simples.
    const escala = teto > 0 ? alturaUtil / teto : 0
    let acumulado = 0

    const segmentos = v.partes.map((valorDaParte, parte) => {
      const altura = Math.max(valorDaParte, 0) * escala
      const y = base - acumulado - altura
      acumulado += altura
      return { parte, valor: valorDaParte, y, altura }
    })

    return {
      rotulo: v.rotulo,
      total: totais[i],
      x: recuo / 2 + passo * i + (passo - espessura) / 2,
      largura: espessura,
      segmentos,
    }
  })

  return {
    barras,
    base,
    saltoDoRotulo: n > 14 ? 2 : 1,
    mostrarValores: n <= 12,
  }
}

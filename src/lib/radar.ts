/**
 * Geometria do radar de mobilidade — CLAUDE.md §3.1 e §10.2.
 *
 * Cada ponto é um funcionário, e **a única coisa que entra aqui é a distância**.
 * A assinatura é `number[]` de propósito: nenhum identificador, nenhum bairro,
 * nenhum modal chega a este módulo, então não há o que vazar para o SVG — nem
 * por atributo, nem por ordem, nem por descuido de quem mexer depois.
 *
 * **O ângulo não tem significado.** A pesquisa não coleta direção, e o cálculo
 * usa distância rodoviária até a fábrica. O ângulo é só um jeito de espalhar os
 * pontos sem que eles se empilhem, e a tela diz isso em texto — sem esse aviso,
 * quem olha lê um mapa onde não há mapa.
 */

/** Ângulo áureo: espalha os pontos sem formar braços nem coincidir. */
const PASSO_ANGULAR = Math.PI * (3 - Math.sqrt(5))

/**
 * Valores de anel considerados "redondos", em quilômetros.
 *
 * O anel precisa dizer um número que alguém reconheça — 5, 10, 20 km —, não o
 * quarto de uma distância máxima qualquer.
 */
const ESCADA = [1, 2, 5, 10, 15, 20, 25, 50, 100, 150, 200]

export type PontoDoRadar = {
  x: number
  y: number
  /**
   * Ângulo do ponto, em radianos de 0 a 2π.
   *
   * **Não é direção.** Ele existe por um motivo de desenho: é o que permite a
   * varredura revelar cada ponto no instante em que passa por ele, com o atraso
   * calculado no servidor em vez de um laço no navegador. Quem consome isto não
   * pode tratá-lo como informação sobre onde a pessoa mora, porque não é.
   */
  angulo: number
}

export type AnelDoRadar = {
  raio: number
  distanciaKm: number
  /**
   * Verdadeiro no anel que fecha o desenho, na distância de quem mora mais
   * longe. Ele não pertence à escada de valores redondos: existe para a borda
   * dizer o que significa, em vez de ser um limite mudo.
   */
  naBorda: boolean
}

export type Radar = {
  pontos: PontoDoRadar[]
  /** Raios dos anéis de referência, no mesmo sistema de coordenadas. */
  aneis: AnelDoRadar[]
  /** A distância que corresponde à borda; define a escala. */
  distanciaMaximaKm: number
}

/**
 * Monta os pontos e os anéis.
 *
 * **A escala é a raiz quadrada da distância**, como no protótipo. A escala
 * linear, que estava aqui antes, é mais fiel ao número mas ilegível com dado
 * real: a maioria mora perto, e todo mundo empilha num borrão no centro
 * enquanto três quartos do desenho ficam vazios. Com a raiz, a área de cada
 * faixa de distância fica proporcional a quantas pessoas ela costuma conter, e
 * a nuvem se distribui.
 *
 * O preço é que **a distância não é mais lida pelo raio na régua** — quem quer
 * o número lê o anel, que é rotulado em quilômetros. Por isso os anéis não são
 * decorativos aqui: sem eles a escala comprimida enganaria.
 */
export function montarRadar(
  distanciasKm: number[],
  opcoes: { raio: number; aneis?: number } = { raio: 100 },
): Radar {
  const quantosAneis = opcoes.aneis ?? 3
  const maior = distanciasKm.reduce((m, d) => Math.max(m, d), 0)

  // Sem ninguém, ou com todo mundo na distância zero, não há escala: o raio de
  // todos vira zero em vez de NaN.
  const raioDe = (km: number): number =>
    maior > 0 ? Math.sqrt(km / maior) * opcoes.raio : 0

  const pontos = distanciasKm.map((distancia, indice) => {
    const bruto = indice * PASSO_ANGULAR
    // Normalizado para uma volta: é assim que o ângulo vira atraso de animação.
    const angulo = ((bruto % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
    const raio = raioDe(distancia)
    return { x: Math.cos(angulo) * raio, y: Math.sin(angulo) * raio, angulo }
  })

  // Os anéis dobram de valor: 5, 10, 20, 40. O menor sai de uma escada de
  // números redondos, para o rótulo dizer algo reconhecível.
  const menor = ESCADA.find((v) => v * 2 ** (quantosAneis - 1) >= maior)
  const base = menor ?? Math.max(1, maior / 2 ** (quantosAneis - 1))
  const aneis: AnelDoRadar[] = Array.from(
    { length: quantosAneis },
    (_, i) => base * 2 ** i,
  )
    .filter((km) => km <= maior || maior === 0)
    .map((km) => ({ raio: raioDe(km), distanciaKm: km, naBorda: false }))

  // A borda fica sem anel sempre que o maior valor redondo cai bem antes dela,
  // e aí o limite do desenho não diz nada. Um anel na distância de quem mora
  // mais longe resolve — a não ser que já exista um anel praticamente ali.
  const ultimo = aneis[aneis.length - 1]
  if (maior > 0 && (ultimo === undefined || ultimo.raio < opcoes.raio * 0.92)) {
    aneis.push({ raio: opcoes.raio, distanciaKm: maior, naBorda: true })
  }

  return { pontos, aneis, distanciaMaximaKm: maior }
}

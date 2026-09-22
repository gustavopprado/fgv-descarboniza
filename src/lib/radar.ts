/**
 * Geometria do radar de mobilidade — CLAUDE.md §3.1 e §11.2.
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

/**
 * Quantos anéis o radar desenha.
 *
 * **Mora aqui porque o desenho e o agregado precisam do mesmo número.** O anel
 * delimita a faixa que se clica (§3.1.1), então um literal em cada ponta seria
 * a tela oferecendo uma faixa que o agregado não mediu — e o erro apareceria
 * como número, nunca como falha.
 */
export const ANEIS_DO_RADAR = 4

/**
 * Fração da borda a partir da qual o anel mais externo já a representa.
 *
 * É o quadrado de 0,92 porque a escala do raio é a raiz da distância: um anel
 * a 92% do raio está a 84,6% da distância máxima. Escrito em distância, e não
 * em raio, o limite não depende do tamanho em que o radar é desenhado.
 */
const FRACAO_MINIMA_DA_BORDA = 0.92 ** 2

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

/** Um intervalo de distância entre dois anéis, em quilômetros. */
export type FaixaDeDistancia = { deKm: number; ateKm: number }

/**
 * As distâncias dos anéis, em quilômetros, do mais interno ao da borda.
 *
 * Separado de `montarRadar` porque **quem agrega precisa dos mesmos limites que
 * quem desenha**, e só isso: a camada de consulta monta a faixa clicável a
 * partir daqui, sem saber em que tamanho o radar vai ser desenhado.
 */
export function limitesDeAnel(
  maiorKm: number,
  quantosAneis = ANEIS_DO_RADAR,
): { distanciaKm: number; naBorda: boolean }[] {
  // Os anéis dobram de valor: 5, 10, 20, 40. O menor sai de uma escada de
  // números redondos, para o rótulo dizer algo reconhecível.
  const menor = ESCADA.find((v) => v * 2 ** (quantosAneis - 1) >= maiorKm)
  const base = menor ?? Math.max(1, maiorKm / 2 ** (quantosAneis - 1))
  const aneis = Array.from({ length: quantosAneis }, (_, i) => base * 2 ** i)
    .filter((km) => km <= maiorKm || maiorKm === 0)
    .map((km) => ({ distanciaKm: km, naBorda: false }))

  // A borda fica sem anel sempre que o maior valor redondo cai bem antes dela,
  // e aí o limite do desenho não diz nada. Um anel na distância de quem mora
  // mais longe resolve — a não ser que já exista um anel praticamente ali.
  const ultimo = aneis[aneis.length - 1]
  if (
    maiorKm > 0 &&
    (ultimo === undefined || ultimo.distanciaKm < maiorKm * FRACAO_MINIMA_DA_BORDA)
  ) {
    aneis.push({ distanciaKm: maiorKm, naBorda: true })
  }
  return aneis
}

/**
 * As faixas entre os anéis, da mais próxima à mais distante.
 *
 * A primeira começa no zero — a fábrica —, e a última **fecha na distância de
 * quem mora mais longe, e não no anel**: quando o anel externo já representa a
 * borda, ele pode cair alguns quilômetros antes dela, e quem morasse nesse vão
 * ficaria sem faixa nenhuma. É o tipo de sobra que não quebra: ela some da
 * contagem e o total deixa de bater sem nada acusar.
 */
export function faixasDeDistancia(
  maiorKm: number,
  quantosAneis = ANEIS_DO_RADAR,
): FaixaDeDistancia[] {
  if (!(maiorKm > 0)) return []

  const limites = limitesDeAnel(maiorKm, quantosAneis).map((a) => a.distanciaKm)
  return limites.map((ateKm, i) => ({
    deKm: i === 0 ? 0 : limites[i - 1],
    ateKm: i === limites.length - 1 ? Math.max(ateKm, maiorKm) : ateKm,
  }))
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

  const aneis: AnelDoRadar[] = limitesDeAnel(maior, quantosAneis).map((anel) => ({
    ...anel,
    // A borda é o raio inteiro por definição, e não o resultado da conta: com
    // ela derivada, o anel externo ficaria um fio de pixel para dentro.
    raio: anel.naBorda ? opcoes.raio : raioDe(anel.distanciaKm),
  }))

  return { pontos, aneis, distanciaMaximaKm: maior }
}

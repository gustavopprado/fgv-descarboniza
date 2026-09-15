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

export type Radar = {
  pontos: PontoDoRadar[]
  /** Raios dos anéis de referência, no mesmo sistema de coordenadas. */
  aneis: { raio: number; distanciaKm: number }[]
  /** A distância que corresponde à borda; define a escala. */
  distanciaMaximaKm: number
}

/**
 * Monta os pontos e os anéis.
 *
 * A escala é linear na distância: o que a tela precisa mostrar é que as pessoas
 * moram a distâncias diferentes, e uma escala que comprime a cauda esconderia
 * exatamente quem mora longe.
 */
export function montarRadar(
  distanciasKm: number[],
  opcoes: { raio: number; aneis?: number } = { raio: 100 },
): Radar {
  const quantosAneis = opcoes.aneis ?? 3
  const maior = distanciasKm.reduce((m, d) => Math.max(m, d), 0)
  // Sem ninguém, ou com todo mundo na distância zero, a escala não existe: o
  // denominador vira 1 para não produzir NaN nem dividir por zero.
  const escala = maior > 0 ? opcoes.raio / maior : 1

  const pontos = distanciasKm.map((distancia, indice) => {
    const bruto = indice * PASSO_ANGULAR
    // Normalizado para uma volta: é assim que o ângulo vira atraso de animação.
    const angulo = ((bruto % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
    const raio = distancia * escala
    return { x: Math.cos(angulo) * raio, y: Math.sin(angulo) * raio, angulo }
  })

  const aneis = Array.from({ length: quantosAneis }, (_, i) => {
    const fracao = (i + 1) / quantosAneis
    return { raio: opcoes.raio * fracao, distanciaKm: maior * fracao }
  })

  return { pontos, aneis, distanciaMaximaKm: maior }
}

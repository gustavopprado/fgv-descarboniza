/**
 * Recorte de polígono no retângulo do enquadramento — Sutherland–Hodgman.
 *
 * O contorno dos continentes vem em anéis inteiros: a América do Sul são
 * milhares de vértices, e num mapa de rotas domésticas quase todos caem fora da
 * moldura. Sem recorte, eles viajam no HTML a cada abertura de tela para o
 * navegador descartar em seguida — medido, davam dezenas de quilobytes de
 * caminho invisível.
 *
 * O recorte é feito em grau, antes de projetar, e devolve um anel fechado que
 * continua preenchível: o algoritmo corta o polígono contra um lado do
 * retângulo de cada vez, acompanhando a borda quando a aresta sai e volta.
 */
export type Caixa = { oeste: number; sul: number; leste: number; norte: number }

export type Ponto = [number, number]

type Lado = 'oeste' | 'leste' | 'sul' | 'norte'

function dentro(ponto: Ponto, lado: Lado, caixa: Caixa): boolean {
  switch (lado) {
    case 'oeste':
      return ponto[0] >= caixa.oeste
    case 'leste':
      return ponto[0] <= caixa.leste
    case 'sul':
      return ponto[1] >= caixa.sul
    case 'norte':
      return ponto[1] <= caixa.norte
  }
}

/** Onde a aresta cruza a reta do lado. */
function cruzamento(a: Ponto, b: Ponto, lado: Lado, caixa: Caixa): Ponto {
  const [x1, y1] = a
  const [x2, y2] = b

  if (lado === 'oeste' || lado === 'leste') {
    const x = lado === 'oeste' ? caixa.oeste : caixa.leste
    // Aresta vertical não cruza uma reta vertical num ponto só; devolver a
    // ponta evita produzir NaN.
    const t = x2 === x1 ? 0 : (x - x1) / (x2 - x1)
    return [x, y1 + (y2 - y1) * t]
  }

  const y = lado === 'sul' ? caixa.sul : caixa.norte
  const t = y2 === y1 ? 0 : (y - y1) / (y2 - y1)
  return [x1 + (x2 - x1) * t, y]
}

function recortarLado(anel: Ponto[], lado: Lado, caixa: Caixa): Ponto[] {
  if (anel.length === 0) return anel

  const saida: Ponto[] = []
  for (let i = 0; i < anel.length; i++) {
    const atual = anel[i]
    const anterior = anel[(i - 1 + anel.length) % anel.length]
    const atualDentro = dentro(atual, lado, caixa)
    const anteriorDentro = dentro(anterior, lado, caixa)

    if (atualDentro) {
      if (!anteriorDentro) saida.push(cruzamento(anterior, atual, lado, caixa))
      saida.push(atual)
    } else if (anteriorDentro) {
      saida.push(cruzamento(anterior, atual, lado, caixa))
    }
  }
  return saida
}

/**
 * O anel recortado, ou lista vazia se ele está inteiro fora da caixa.
 *
 * Vértices consecutivos que coincidem depois do recorte são descartados: eles
 * não mudam o desenho e só engordam o caminho.
 */
export function recortarAnel(anel: Ponto[], caixa: Caixa): Ponto[] {
  let atual = anel
  for (const lado of ['oeste', 'leste', 'sul', 'norte'] as const) {
    atual = recortarLado(atual, lado, caixa)
    if (atual.length === 0) return []
  }

  const limpo: Ponto[] = []
  for (const ponto of atual) {
    const anterior = limpo[limpo.length - 1]
    if (
      anterior === undefined ||
      Math.abs(anterior[0] - ponto[0]) > 1e-9 ||
      Math.abs(anterior[1] - ponto[1]) > 1e-9
    ) {
      limpo.push(ponto)
    }
  }

  // Menos de três vértices não delimita área nenhuma.
  return limpo.length >= 3 ? limpo : []
}

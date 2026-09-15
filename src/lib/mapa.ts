/**
 * Projeção do mapa de rotas — CLAUDE.md §10.3.
 *
 * Equirretangular, enquadrada no que há para desenhar: longitude vira x,
 * latitude vira y invertido, e o conjunto é escalado para caber na moldura sem
 * distorcer a proporção entre os dois eixos.
 *
 * **Não é um mapa de navegação e não tem base cartográfica.** Ele mostra a
 * geometria relativa das rotas — quem está longe de quem, que par se repete —, e
 * é isso que a tela declara. Uma projeção honesta e sem base é melhor que uma
 * base bonita com projeção que ninguém sabe qual é.
 *
 * O módulo é puro e não conhece rota, emissão nem pessoa: entra coordenada,
 * sai ponto na moldura.
 */
export type Coordenada = { latitude: number; longitude: number }

export type Ponto = { x: number; y: number }

export type Moldura = {
  largura: number
  altura: number
  /** Margem interna, para o ponto na borda não ficar cortado pela metade. */
  margem: number
}

export type Projecao = {
  projetar: (coordenada: Coordenada) => Ponto
  largura: number
  altura: number
  /**
   * O retângulo do mundo que a moldura enquadra, em graus.
   *
   * Serve para descartar o contorno de continente que está fora do
   * enquadramento antes de desenhá-lo: sem isso, o mapa de rotas domésticas
   * levaria os anéis do mundo inteiro no HTML para o navegador recortar.
   */
  limites: { oeste: number; leste: number; sul: number; norte: number }
}

/**
 * Monta a projeção a partir do conjunto que vai ser desenhado.
 *
 * Um conjunto com um ponto só, ou com pontos na mesma latitude e longitude, não
 * tem extensão: a escala cairia em divisão por zero, então ele é centralizado.
 */
export function projetar(
  coordenadas: Coordenada[],
  moldura: Moldura,
): Projecao {
  const { largura, altura, margem } = moldura
  const util = { largura: largura - margem * 2, altura: altura - margem * 2 }

  if (coordenadas.length === 0) {
    return {
      projetar: () => ({ x: largura / 2, y: altura / 2 }),
      largura,
      altura,
      limites: { oeste: 0, leste: 0, sul: 0, norte: 0 },
    }
  }

  const longitudes = coordenadas.map((c) => c.longitude)
  const latitudes = coordenadas.map((c) => c.latitude)
  const oeste = Math.min(...longitudes)
  const leste = Math.max(...longitudes)
  const sul = Math.min(...latitudes)
  const norte = Math.max(...latitudes)

  const extensaoX = leste - oeste
  const extensaoY = norte - sul

  // Uma escala só para os dois eixos: escalas diferentes esticariam o mapa e
  // fariam uma rota curta parecer longa por acidente de enquadramento.
  const escala =
    extensaoX === 0 && extensaoY === 0
      ? 1
      : Math.min(
          extensaoX === 0 ? Infinity : util.largura / extensaoX,
          extensaoY === 0 ? Infinity : util.altura / extensaoY,
        )

  const centroX = (oeste + leste) / 2
  const centroY = (sul + norte) / 2

  // Quanto de mundo cabe na moldura inteira, a partir do centro. Com escala
  // infinita — um ponto só —, o enquadramento é o próprio ponto.
  const metadeX = Number.isFinite(escala) && escala > 0 ? largura / 2 / escala : 0
  const metadeY = Number.isFinite(escala) && escala > 0 ? altura / 2 / escala : 0

  return {
    largura,
    altura,
    limites: {
      oeste: centroX - metadeX,
      leste: centroX + metadeX,
      sul: centroY - metadeY,
      norte: centroY + metadeY,
    },
    projetar: ({ latitude, longitude }) => ({
      x: largura / 2 + (longitude - centroX) * escala,
      // Latitude cresce para o norte e y cresce para baixo: o sinal inverte,
      // senão o mapa sai de cabeça para baixo.
      y: altura / 2 - (latitude - centroY) * escala,
    }),
  }
}

/** Verdadeiro só quando a coordenada é utilizável para desenhar. */
export function coordenadaValida(
  latitude: number | null,
  longitude: number | null,
): boolean {
  return (
    latitude !== null &&
    longitude !== null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    // (0, 0) é coordenada válida no Golfo da Guiné e é o que um cadastro
    // incompleto costuma trazer. Aeroporto no oceano é dado faltando, não rota.
    !(latitude === 0 && longitude === 0)
  )
}

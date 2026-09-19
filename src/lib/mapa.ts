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

/**
 * Um lugar no mapa — CLAUDE.md §10.3.
 *
 * **O tipo mora aqui, e não na camada de consulta, porque o desenho é
 * compartilhado e o dado não é** (§0.1, §7.5). O inventário e o programa de
 * viagens usam o mesmo mapa e não se tocam: se o componente falasse o tipo de
 * uma das duas consultas, a outra tela teria que importar o módulo do lado
 * errado para desenhar — e é exatamente isso que a fronteira proíbe.
 *
 * `chave` é a identidade do lugar e `rotulo` é o que aparece. Elas são campos
 * separados porque nem sempre coincidem: uma região tem nome curto, um município
 * carrega a UF junto, e é a chave que decide se dois extremos são o mesmo ponto.
 *
 * `domestico` vem **declarado, não deduzido do rótulo**. Quem monta o dado sabe
 * se o lugar é do Brasil — pela classificação gravada no cadastro do aeroporto,
 * ou por ser município do IBGE. Reconhecer isso pelo texto do rótulo seria uma
 * lista de nomes escrita dentro do desenho.
 */
export type PontoDoMapa = {
  chave: string
  rotulo: string
  latitude: number
  longitude: number
  domestico: boolean
}

/**
 * Uma ligação entre dois lugares, com o peso que ela carrega.
 *
 * Não tem sentido: ida e volta são a mesma ligação, então não há seta a
 * desenhar. Ligação cujos dois extremos são o mesmo lugar vira anel, porque um
 * ponto não tem direção.
 */
export type LigacaoDoMapa = {
  chave: string
  origem: PontoDoMapa
  destino: PontoDoMapa
  co2Kg: number
}

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

/**
 * Quais rótulos cabem — CLAUDE.md §10.4.
 *
 * **Um mapa cujos pontos se aglomeram não cabe todos os nomes**, e escrever o
 * que não se lê é sujeira, não informação. Foi o defeito que o inserto resolveu
 * para o conjunto brasileiro em 16/09; o mapa marítimo trouxe a forma geral do
 * problema, com **dois** aglomerados — os portos de origem num delta e os de
 * destino no sul do país —, e aglomerado que não é o Brasil não tem inserto.
 *
 * A regra é de caixa, não de raio: o rótulo é escrito à direita do ponto, então
 * dois deles se atrapalham quando as linhas de base estão perto **e** as caixas
 * de texto se sobrepõem. Medir a caixa, e não a distância entre âncoras, é a
 * correção da medição que deu alarme falso dentro do inserto — ali tudo tem um
 * terço da largura, e um limiar em pixels da moldura grande acusa sobreposição
 * onde não há.
 *
 * **Quem chega primeiro fica.** A ordem é a das ligações, que vêm ordenadas por
 * emissão: quando dois nomes disputam o mesmo lugar, o do corredor mais pesado é
 * o que aparece. Os outros estão nas tabelas, e a legenda diz isso.
 */
export function rotulosQueCabem(
  lugares: PontoDoMapa[],
  projecao: Projecao,
  escala: number,
): Set<string> {
  /** Meia-entrelinha: abaixo disso as duas linhas de base se tocam. */
  const ALTURA = 10 * escala
  /** Largura média de um caractere no corpo em que o rótulo é desenhado. */
  const LARGURA_DO_CARACTERE = 5.1 * escala
  /** O recuo do rótulo em relação ao ponto, como `Pontos` o escreve. */
  const RECUO = 9 * escala

  const aceitos: { x: number; y: number; largura: number }[] = []
  const cabe = new Set<string>()

  for (const lugar of lugares) {
    const ponto = projecao.projetar(lugar)
    const caixa = {
      x: ponto.x + RECUO,
      y: ponto.y - 6 * escala,
      largura: lugar.rotulo.length * LARGURA_DO_CARACTERE,
    }
    const colide = aceitos.some(
      (a) =>
        Math.abs(a.y - caixa.y) < ALTURA &&
        caixa.x < a.x + a.largura &&
        a.x < caixa.x + caixa.largura,
    )
    if (colide) continue
    aceitos.push(caixa)
    cabe.add(lugar.chave)
  }

  return cabe
}

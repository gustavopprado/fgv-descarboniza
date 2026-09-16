/**
 * Gera o contorno dos continentes usado no mapa de rotas (§10.3).
 *
 * **Por que existe um script, e não um caminho colado no repositório.** Dado
 * geográfico tem procedência e tem licença, e um `path` gigante colado num
 * arquivo é exatamente o tipo de coisa que entra sem ninguém olhar de onde
 * veio. Este script deixa a origem explícita e o resultado reprodutível: quem
 * duvidar do contorno roda de novo e compara.
 *
 * **Origem:** Natural Earth, 1:110m, "land" — domínio público, sem exigência de
 * atribuição (naturalearthdata.com/about/terms-of-use). Chega aqui pelo pacote
 * `world-atlas`, de Mike Bostock, sob licença ISC.
 *
 * **O que o script faz com o dado:** descarta as ilhas menores que o limite de
 * área, porque no tamanho em que este mapa é desenhado elas não chegam a um
 * pixel, e arredonda a coordenada para uma casa decimal — cerca de onze
 * quilômetros, bem abaixo da espessura da linha. As duas coisas existem para o
 * arquivo caber: sem elas seriam dezenas de milhares de vértices viajando no
 * HTML a cada abertura de tela.
 *
 * **Descarta os furos**, ficando só com o anel externo de cada polígono: lago e
 * mar interior recortados da terra viram, se coletados, uma forma desenhada por
 * cima do continente e com contorno próprio — é fronteira que não existe.
 *
 * **E corta os anéis no antimeridiano**, que é a última coisa e a outra que
 * conserta um erro em vez de encolher o arquivo. A origem representa a costura
 * de ±180° com vértices dos dois lados da linha — para a esfera é o mesmo
 * lugar, mas numa projeção equirretangular a aresta entre eles é desenhada
 * atravessando o mapa inteiro. Sem o corte, três anéis viram **faixas
 * horizontais de ponta a ponta**, que quem olha lê como rota, como grade ou
 * como defeito de carga, e que são apenas a volta do mundo pelas costas.
 *
 * Uso:
 *   npx tsx scripts/gerar-contorno.ts
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { feature } from 'topojson-client'
import type { Topology } from 'topojson-specification'

import { ehEntrada } from './_comum'

const ORIGEM = 'node_modules/world-atlas/land-110m.json'
/**
 * Mesma origem e mesma licença do contorno de terra, outro recorte: as
 * fronteiras nacionais do Natural Earth 1:110m. Só o Brasil é extraído — é o
 * único país que o mapa precisa situar, e trazer os 177 restantes seria pagar o
 * arquivo inteiro por uma linha.
 */
const ORIGEM_PAISES = 'node_modules/world-atlas/countries-110m.json'

/** Código ISO numérico do Brasil, que é como o Natural Earth identifica o país. */
const ISO_BRASIL = '076'

/**
 * Divisas das cinco regiões — **IBGE, malhas territoriais**, na qualidade
 * mínima, que é a mais grosseira que a API oferece e a única que faz sentido
 * aqui: o inserto tem pouco mais de duzentos pixels de largura.
 *
 * Dado público do IBGE (Lei 12.527/2011), reutilizável com atribuição à fonte —
 * ela está no cabeçalho do arquivo gerado, e não só aqui.
 *
 * **É a única coisa neste gerador que vem da rede**, e não de `node_modules`.
 * Não havia alternativa embarcada: o `world-atlas` traz países e terra, e a
 * divisão interna do Brasil não está em nenhum pacote já instalado. O resultado
 * é versionado, então a rede só é necessária para regerar.
 */
const ORIGEM_REGIOES =
  'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR' +
  '?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=regiao'

/**
 * Código de região do IBGE para o nome usado no cadastro de aeroportos.
 *
 * O nome precisa bater com `REGIOES_DO_BRASIL` de `src/lib/regiao.ts`: é por ele
 * que a tela liga o desenho da região ao corredor que sai dela. Código que não
 * estiver aqui derruba a geração, em vez de virar um polígono sem nome.
 */
const REGIAO_POR_CODIGO: Record<string, string> = {
  '1': 'Norte',
  '2': 'Nordeste',
  '3': 'Sudeste',
  '4': 'Sul',
  '5': 'Centro-Oeste',
}
const DESTINO = 'src/lib/mundo.ts'

/** Em graus quadrados. Abaixo disso a ilha não chega a um pixel no desenho. */
const AREA_MINIMA = 1.2

/** Uma casa decimal ≈ 11 km, bem abaixo da espessura de uma linha do mapa. */
const CASAS = 1

type Anel = [number, number][]
type Caixa = [number, number, number, number]

/**
 * O retângulo envolvente vem pronto no arquivo para a tela poder descartar, sem
 * conta nenhuma, o que está fora do enquadramento das rotas.
 */
function comCaixa(anel: Anel): { caixa: Caixa; pontos: Anel } {
  const longitudes = anel.map((p) => p[0])
  const latitudes = anel.map((p) => p[1])
  return {
    caixa: [
      Math.min(...longitudes),
      Math.min(...latitudes),
      Math.max(...longitudes),
      Math.max(...latitudes),
    ],
    pontos: anel,
  }
}

function area(anel: Anel): number {
  let soma = 0
  for (let i = 0; i < anel.length; i++) {
    const [x1, y1] = anel[i]
    const [x2, y2] = anel[(i + 1) % anel.length]
    soma += x1 * y2 - x2 * y1
  }
  return Math.abs(soma / 2)
}

function arredondar(anel: Anel): Anel {
  const fator = 10 ** CASAS
  const limpo: Anel = []
  for (const [x, y] of anel) {
    const ponto: [number, number] = [
      Math.round(x * fator) / fator,
      Math.round(y * fator) / fator,
    ]
    // Vértices que colapsaram no mesmo ponto depois do arredondamento não
    // acrescentam nada ao desenho e só ocupam espaço.
    const anterior = limpo[limpo.length - 1]
    if (anterior === undefined || anterior[0] !== ponto[0] || anterior[1] !== ponto[1]) {
      limpo.push(ponto)
    }
  }
  return limpo
}

/**
 * Corta um anel que cruza o antimeridiano, devolvendo um ou mais anéis.
 *
 * A regra é local e não precisa saber geografia: **aresta que salta mais de
 * 180° de longitude não é aresta** — é a costura de ±180°, onde a origem
 * escreveu o mesmo ponto dos dois lados da linha. O anel é quebrado em cadeias
 * nessas arestas, e cada cadeia se fecha sozinha, do lado do mundo onde ela
 * mora.
 *
 * Cadeia com menos de três pontos é descartada: sobra da costura, sem área.
 *
 * **Uma travessia só é o caso que engana.** Quebrar ali devolve o mesmo anel
 * girado, e o salto passa da aresta explícita para o fechamento implícito — a
 * faixa reaparece igual. Anel que cruza a costura uma vez só é anel que
 * **envolve um polo** (é o que a topologia obriga), e o fechamento certo é
 * subir ou descer pela costura, dar a volta pelo polo e voltar. É o que faz a
 * Antártida ser uma calota e não uma tira.
 */
function cortarNoAntimeridiano(anel: Anel): Anel[] {
  const salta = (a: [number, number], b: [number, number]) => Math.abs(b[0] - a[0]) > 180

  const quebras: number[] = []
  for (let i = 0; i < anel.length; i++) {
    if (salta(anel[i], anel[(i + 1) % anel.length])) quebras.push(i)
  }
  if (quebras.length === 0) return [anel]

  const cadeias: Anel[] = []
  for (let k = 0; k < quebras.length; k++) {
    const de = (quebras[k] + 1) % anel.length
    const ate = quebras[(k + 1) % quebras.length]
    const cadeia: Anel = []
    for (let i = de; ; i = (i + 1) % anel.length) {
      cadeia.push(anel[i])
      if (i === ate) break
    }
    if (cadeia.length < 3) continue

    const primeiro = cadeia[0]
    const ultimo = cadeia[cadeia.length - 1]
    if (salta(ultimo, primeiro)) {
      // Extremos em lados opostos da costura: fecha pelo polo do hemisfério
      // onde o anel mora, em vez de atravessar o mapa.
      const latMedia =
        cadeia.reduce((soma, ponto) => soma + ponto[1], 0) / cadeia.length
      const polo = latMedia < 0 ? -90 : 90
      const bordaFinal = ultimo[0] < 0 ? -180 : 180
      const bordaInicial = -bordaFinal
      cadeia.push([bordaFinal, ultimo[1]], [bordaFinal, polo])
      cadeia.push([bordaInicial, polo], [bordaInicial, primeiro[1]])
    }
    cadeias.push(cadeia)
  }
  return cadeias
}

/** Anéis externos de uma geometria de polígono, sem os furos. */
function aneisExternos(geometria: unknown): Anel[] {
  const g = geometria as { type: string; coordinates: unknown }
  if (g.type === 'Polygon') return [(g.coordinates as Anel[])[0]]
  if (g.type === 'MultiPolygon') {
    return (g.coordinates as Anel[][]).map((poligono) => poligono[0])
  }
  return []
}

/**
 * Baixa a malha das regiões.
 *
 * Por `curl`, e não por `fetch`: o cliente HTTP do Node quebra a resposta deste
 * servidor ao decodificá-la, e `curl` a lê sem reclamar. É ferramenta que já
 * vem no Windows 10 e em qualquer Unix; faltando ela, a mensagem diz o que
 * fazer em vez de devolver um erro de rede solto.
 */
function baixarRegioes(): string {
  try {
    return execFileSync('curl', ['-sS', '--compressed', '--fail', ORIGEM_REGIOES], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch (erro) {
    throw new Error(
      `não consegui baixar a malha das regiões do IBGE (${(erro as Error).message}). ` +
        'É preciso rede e o comando curl disponível no PATH.',
    )
  }
}

/**
 * As divisas das cinco regiões, cada uma com o nome que o cadastro usa.
 *
 * Elas são **linha**, como a fronteira do Brasil, e pelo mesmo motivo ficam em
 * constante própria. O nome viaja junto porque é ele que liga o desenho ao
 * corredor: clicar num ponto do mapa acende a região correspondente.
 */
function contornoDasRegioes(): { regiao: string; caixa: Caixa; pontos: Anel }[] {
  const colecao = JSON.parse(baixarRegioes()) as {
    features: { properties: { codarea: string }; geometry: unknown }[]
  }

  const saida: { regiao: string; caixa: Caixa; pontos: Anel }[] = []
  for (const feicao of colecao.features) {
    const codigo = String(feicao.properties.codarea)
    const regiao = REGIAO_POR_CODIGO[codigo]
    if (regiao === undefined) {
      throw new Error(`região ${codigo} sem nome em REGIAO_POR_CODIGO`)
    }
    for (const anel of aneisExternos(feicao.geometry)
      .filter((a) => area(a) >= AREA_MINIMA)
      .map(arredondar)
      .filter((a) => a.length >= 4)) {
      saida.push({ regiao, ...comCaixa(anel) })
    }
  }

  const nomes = new Set(saida.map((r) => r.regiao))
  if (nomes.size !== Object.keys(REGIAO_POR_CODIGO).length) {
    throw new Error(`a malha trouxe ${nomes.size} regiões; esperava cinco`)
  }
  return saida
}

/**
 * O contorno do Brasil, para o mapa situar o país.
 *
 * Sai de um arquivo diferente do resto — fronteira é dado de país, não de terra
 * —, e por isso é exportado separado: no desenho ele é **linha, não área**. Se
 * entrasse junto dos anéis de terra, seria pintado como um continente a mais em
 * cima do que já está lá.
 */
function contornoDoBrasil(): { caixa: Caixa; pontos: Anel }[] {
  const topologia = JSON.parse(readFileSync(ORIGEM_PAISES, 'utf8')) as Topology
  const paises = feature(topologia, topologia.objects.countries)
  const lista =
    paises.type === 'FeatureCollection' ? paises.features : [paises]
  const brasil = lista.find((f) => String(f.id) === ISO_BRASIL)
  if (brasil === undefined) {
    throw new Error(`país ${ISO_BRASIL} não encontrado em ${ORIGEM_PAISES}`)
  }

  return aneisExternos(brasil.geometry)
    .filter((anel) => area(anel) >= AREA_MINIMA)
    .map(arredondar)
    .flatMap(cortarNoAntimeridiano)
    .filter((anel) => anel.length >= 4)
    .map(comCaixa)
}

function principal(): void {
  const topologia = JSON.parse(readFileSync(ORIGEM, 'utf8')) as Topology
  const terra = feature(topologia, topologia.objects.land)

  // **Só o anel externo de cada polígono.** Do segundo em diante são furos —
  // lago e mar interior recortados da terra —, e este mapa pinta terra numa cor
  // chapada, sem água nenhuma. Coletado como anel comum, o furo vira uma forma
  // desenhada **por cima** do continente, com contorno próprio, e quem olha lê
  // como fronteira de país. Era o mar Cáspio aparecendo no meio da Ásia.
  //
  // Preencher o furo de verde é erro menor que desenhá-lo: num mapa que já
  // declara servir para situar e não para medir, o lago somido não muda nada, e
  // a forma fantasma muda a leitura.
  const brutos: Anel[] = []
  const coletar = (geometria: unknown): void => {
    brutos.push(...aneisExternos(geometria))
  }

  if (terra.type === 'FeatureCollection') {
    for (const f of terra.features) coletar(f.geometry)
  } else {
    coletar(terra.geometry)
  }

  const aneis = brutos
    .filter((anel) => area(anel) >= AREA_MINIMA)
    .map(arredondar)
    // O corte vem **depois** do arredondamento: é ele que às vezes empurra um
    // vértice da costura para o outro lado da linha, criando o salto.
    .flatMap(cortarNoAntimeridiano)
    .filter((anel) => anel.length >= 4)
    .map(comCaixa)
    .sort((a, b) => b.pontos.length - a.pontos.length)

  const brasil = contornoDoBrasil()
  const regioes = contornoDasRegioes()
  const vertices = aneis.reduce((s, a) => s + a.pontos.length, 0)
  const verticesBrasil = brasil.reduce((s, a) => s + a.pontos.length, 0)
  const verticesRegioes = regioes.reduce((s, a) => s + a.pontos.length, 0)

  const conteudo = `/**
 * Contorno geográfico do mapa de rotas — ARQUIVO GERADO, não editar à mão.
 *
 * Gerado por \`scripts/gerar-contorno.ts\`, que documenta a origem e o
 * tratamento. Em resumo: Natural Earth 1:110m, domínio público, chegando pelo
 * pacote \`world-atlas\` (ISC); só o anel externo de cada polígono, ilhas
 * menores que o limite de área descartadas, coordenadas arredondadas para uma
 * casa decimal e anéis cortados no antimeridiano, senão a costura de ±180° vira
 * uma faixa atravessando o mapa.
 *
 * São **coisas diferentes no desenho**, e por isso vêm em constantes separadas:
 * a terra é área pintada; o Brasil e as cinco regiões são linha. Juntos, o país
 * seria pintado como um continente a mais em cima do que já está lá.
 *
 * As divisas das regiões vêm das **malhas territoriais do IBGE**, na qualidade
 * mínima — dado público, reutilizável com atribuição à fonte. O nome de cada
 * região é o mesmo de \`src/lib/regiao.ts\`, que é o que liga o desenho ao
 * corredor.
 *
 * Cada anel traz o retângulo que o envolve, em [oeste, sul, leste, norte], para
 * a tela descartar de imediato o que está fora do enquadramento.
 */
export type AnelDoMundo = {
  caixa: [number, number, number, number]
  pontos: [number, number][]
}

/** Terra, como área. ${aneis.length} anéis, ${vertices} vértices. */
export const CONTORNO_DO_MUNDO: AnelDoMundo[] = ${JSON.stringify(aneis)}

/** Fronteira do Brasil, como linha. ${brasil.length} anéis, ${verticesBrasil} vértices. */
export const CONTORNO_DO_BRASIL: AnelDoMundo[] = ${JSON.stringify(brasil)}

export type AnelDeRegiao = AnelDoMundo & { regiao: string }

/** Divisas das cinco regiões (IBGE). ${regioes.length} anéis, ${verticesRegioes} vértices. */
export const CONTORNO_DAS_REGIOES: AnelDeRegiao[] = ${JSON.stringify(regioes)}
`

  writeFileSync(DESTINO, conteudo, 'utf8')
  console.log(
    `${DESTINO}: ${aneis.length} anéis de terra com ${vertices} vértices, ` +
      `mais o Brasil com ${verticesBrasil} e as regiões com ${verticesRegioes}, ` +
      `${Math.round(conteudo.length / 1024)} KB.`,
  )
}

if (ehEntrada(import.meta.url)) {
  principal()
}

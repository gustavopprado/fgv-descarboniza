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
 * Uso:
 *   npx tsx scripts/gerar-contorno.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { feature } from 'topojson-client'
import type { Topology } from 'topojson-specification'

import { ehEntrada } from './_comum'

const ORIGEM = 'node_modules/world-atlas/land-110m.json'
const DESTINO = 'src/lib/mundo.ts'

/** Em graus quadrados. Abaixo disso a ilha não chega a um pixel no desenho. */
const AREA_MINIMA = 1.2

/** Uma casa decimal ≈ 11 km, bem abaixo da espessura de uma linha do mapa. */
const CASAS = 1

type Anel = [number, number][]

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

function principal(): void {
  const topologia = JSON.parse(readFileSync(ORIGEM, 'utf8')) as Topology
  const terra = feature(topologia, topologia.objects.land)

  const brutos: Anel[] = []
  const coletar = (geometria: unknown): void => {
    const g = geometria as { type: string; coordinates: unknown }
    if (g.type === 'Polygon') {
      brutos.push(...(g.coordinates as Anel[]))
    } else if (g.type === 'MultiPolygon') {
      for (const poligono of g.coordinates as Anel[][]) brutos.push(...poligono)
    }
  }

  if (terra.type === 'FeatureCollection') {
    for (const f of terra.features) coletar(f.geometry)
  } else {
    coletar(terra.geometry)
  }

  const aneis = brutos
    .filter((anel) => area(anel) >= AREA_MINIMA)
    .map(arredondar)
    .filter((anel) => anel.length >= 4)
    .map((anel) => {
      const longitudes = anel.map((p) => p[0])
      const latitudes = anel.map((p) => p[1])
      return {
        // O retângulo envolvente vem pronto para a tela poder descartar, sem
        // conta nenhuma, o que está fora do enquadramento das rotas.
        caixa: [
          Math.min(...longitudes),
          Math.min(...latitudes),
          Math.max(...longitudes),
          Math.max(...latitudes),
        ] as [number, number, number, number],
        pontos: anel,
      }
    })
    .sort((a, b) => b.pontos.length - a.pontos.length)

  const vertices = aneis.reduce((s, a) => s + a.pontos.length, 0)

  const conteudo = `/**
 * Contorno dos continentes — ARQUIVO GERADO, não editar à mão.
 *
 * Gerado por \`scripts/gerar-contorno.ts\`, que documenta a origem e o
 * tratamento. Em resumo: Natural Earth 1:110m "land", domínio público, chegando
 * pelo pacote \`world-atlas\` (ISC); ilhas menores que o limite de área
 * descartadas e coordenadas arredondadas para uma casa decimal.
 *
 * Cada anel traz o retângulo que o envolve, em [oeste, sul, leste, norte], para
 * a tela descartar de imediato o que está fora do enquadramento.
 */
export type AnelDoMundo = {
  caixa: [number, number, number, number]
  pontos: [number, number][]
}

/** ${aneis.length} anéis, ${vertices} vértices. */
export const CONTORNO_DO_MUNDO: AnelDoMundo[] = ${JSON.stringify(aneis)}
`

  writeFileSync(DESTINO, conteudo, 'utf8')
  console.log(
    `${DESTINO}: ${aneis.length} anéis, ${vertices} vértices, ` +
      `${Math.round(conteudo.length / 1024)} KB.`,
  )
}

if (ehEntrada(import.meta.url)) {
  principal()
}

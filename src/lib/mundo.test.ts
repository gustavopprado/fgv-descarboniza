/**
 * Invariante do contorno gerado — CLAUDE.md §10.3.
 *
 * O arquivo é gerado, então não se revisa: ele tem 86 anéis e milhares de
 * vértices, e ninguém vai ler isso num diff. O que dá para prender é a
 * propriedade que o gerador promete.
 *
 * **Aresta que salta mais de 180° de longitude não é aresta.** Numa projeção
 * equirretangular ela é desenhada atravessando o mapa inteiro, e foi
 * exatamente assim que três faixas horizontais apareceram sobre o mapa de
 * rotas — lidas como grade, como rota ou como defeito de carga, quando eram só
 * a costura de ±180° que a origem escreve dos dois lados da linha.
 *
 * A única exceção é a aresta no polo: anel que envolve um polo se fecha
 * passando por lá, e em latitude ±90 a travessia é a borda do mundo, não uma
 * linha no meio do desenho.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  CONTORNO_DAS_REGIOES,
  CONTORNO_DO_BRASIL,
  CONTORNO_DO_MUNDO,
} from './mundo'
import { REGIOES_DO_BRASIL } from './regiao'

const TUDO = [
  ...CONTORNO_DO_MUNDO.map((a) => ['terra', a] as const),
  ...CONTORNO_DO_BRASIL.map((a) => ['brasil', a] as const),
  ...CONTORNO_DAS_REGIOES.map((a) => ['regiao', a] as const),
]

test('nenhum anel atravessa o mapa pela costura do antimeridiano', () => {
  const atravessam: string[] = []

  for (const [i, [origem, anel]] of TUDO.entries()) {
    for (let j = 0; j < anel.pontos.length; j++) {
      const de = anel.pontos[j]
      const para = anel.pontos[(j + 1) % anel.pontos.length]
      if (Math.abs(para[0] - de[0]) <= 180) continue
      if (Math.abs(de[1]) === 90 && Math.abs(para[1]) === 90) continue
      atravessam.push(`${origem} ${i}: ${JSON.stringify(de)} → ${JSON.stringify(para)}`)
    }
  }

  assert.deepEqual(
    atravessam,
    [],
    'aresta saltando o antimeridiano vira faixa de ponta a ponta no mapa; ' +
      'gere o contorno de novo com scripts/gerar-contorno.ts',
  )
})

test('a caixa de cada anel envolve os pontos dele', () => {
  // A tela descarta anel fora do enquadramento só pela caixa, sem olhar ponto.
  // Caixa menor que o anel faria sumir do desenho algo que estava dentro.
  for (const [i, [origem, anel]] of TUDO.entries()) {
    const [oeste, sul, leste, norte] = anel.caixa
    for (const [x, y] of anel.pontos) {
      assert.equal(
        x >= oeste && x <= leste && y >= sul && y <= norte,
        true,
        `${origem} ${i} tem ponto fora da própria caixa: ${x},${y}`,
      )
    }
  }
})

/**
 * **O furo não é terra.** O anel interno de um polígono é lago ou mar interior
 * recortado da terra; coletado como anel comum, ele é desenhado por cima do
 * continente, com contorno próprio, e se lê como fronteira de país — foi o mar
 * Cáspio aparecendo no meio da Ásia.
 *
 * O que separa furo de ilha é o **sentido de giro**, não a posição: ilha dentro
 * do retângulo envolvente de um continente é comum e legítima, e um teste por
 * caixa acusaria todas elas.
 *
 * A conferência é **dentro de cada origem, nunca entre elas**. O sentido é
 * convenção de quem publicou o arquivo, e as regiões vêm do IBGE enquanto o
 * resto vem do Natural Earth: exigir o mesmo giro dos dois seria prender uma
 * coincidência, e o teste reprovaria uma malha correta.
 */
test('dentro de cada origem, todo anel gira para o mesmo lado', () => {
  const areaAssinada = (anel: [number, number][]): number => {
    let soma = 0
    for (let i = 0; i < anel.length; i++) {
      const [x1, y1] = anel[i]
      const [x2, y2] = anel[(i + 1) % anel.length]
      soma += x1 * y2 - x2 * y1
    }
    return soma / 2
  }

  const origens = [
    ['terra', CONTORNO_DO_MUNDO],
    ['brasil', CONTORNO_DO_BRASIL],
    ['regiões', CONTORNO_DAS_REGIOES],
  ] as const

  for (const [nome, lista] of origens) {
    const sentidos = lista.map((a) => Math.sign(areaAssinada(a.pontos)))
    assert.notEqual(sentidos[0], 0, `${nome}: o primeiro anel não tem área`)
    assert.deepEqual(
      sentidos.map((s, i) => (s === sentidos[0] ? null : i)).filter((i) => i !== null),
      [],
      `${nome}: anel girando ao contrário é furo entrando como contorno; ` +
        'o gerador deve ficar só com o anel externo de cada polígono',
    )
  }
})

test('o Brasil existe, e é um desenho e não o mundo inteiro', () => {
  assert.equal(CONTORNO_DO_BRASIL.length > 0, true)
  const [oeste, sul, leste, norte] = CONTORNO_DO_BRASIL[0].caixa
  // O país cabe no quadrante sudoeste; caixa maior que isso é o país errado.
  assert.equal(oeste > -80 && leste < -30, true, `longitudes: ${oeste}..${leste}`)
  assert.equal(sul > -40 && norte < 10, true, `latitudes: ${sul}..${norte}`)
})

/**
 * As cinco regiões existem, e com o nome que o resto do sistema usa.
 *
 * **O nome é o vínculo**, não um rótulo: é por ele que clicar num ponto do mapa
 * acende o desenho da região certa. Um nome fora do conjunto de
 * `REGIOES_DO_BRASIL` não estoura em lugar nenhum — o desenho simplesmente
 * nunca acende, que é defeito calado.
 */
test('as divisas cobrem as cinco regiões, com os nomes do cadastro', () => {
  const desenhadas = new Set(CONTORNO_DAS_REGIOES.map((a) => a.regiao))
  assert.deepEqual(
    [...desenhadas].sort(),
    [...REGIOES_DO_BRASIL].sort(),
    'o nome da divisa precisa ser o mesmo que classifica o aeroporto',
  )

  // Cada divisa cabe no Brasil, com uma folga de arredondamento.
  const [oeste, sul, leste, norte] = CONTORNO_DO_BRASIL[0].caixa
  for (const anel of CONTORNO_DAS_REGIOES) {
    assert.equal(
      anel.caixa[0] >= oeste - 1 &&
        anel.caixa[1] >= sul - 1 &&
        anel.caixa[2] <= leste + 1 &&
        anel.caixa[3] <= norte + 1,
      true,
      `a divisa de ${anel.regiao} sai do país: ${JSON.stringify(anel.caixa)}`,
    )
  }
})

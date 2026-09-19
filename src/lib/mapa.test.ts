/**
 * Testes da projeção do mapa de rotas — CLAUDE.md §10.3.
 *
 * **Toda a massa aqui é fictícia, inventada do zero** (§2.2): as coordenadas
 * são pontos redondos escolhidos para a conta ser conferível na mão.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { coordenadaValida, projetar, rotulosQueCabem } from './mapa'

const MOLDURA = { largura: 200, altura: 200, margem: 10 }

test('o norte fica em cima', () => {
  const { projetar: p } = projetar(
    [
      { latitude: 10, longitude: 0 },
      { latitude: -10, longitude: 0 },
    ],
    MOLDURA,
  )
  const norte = p({ latitude: 10, longitude: 0 })
  const sul = p({ latitude: -10, longitude: 0 })
  assert.ok(norte.y < sul.y, 'latitude maior precisa desenhar mais para cima')
})

test('o leste fica à direita', () => {
  const { projetar: p } = projetar(
    [
      { latitude: 0, longitude: -10 },
      { latitude: 0, longitude: 10 },
    ],
    MOLDURA,
  )
  assert.ok(p({ latitude: 0, longitude: -10 }).x < p({ latitude: 0, longitude: 10 }).x)
})

test('o conjunto cabe dentro da moldura, com margem', () => {
  const coordenadas = [
    { latitude: -30, longitude: -60 },
    { latitude: -5, longitude: -35 },
    { latitude: -23, longitude: -46 },
  ]
  const { projetar: p } = projetar(coordenadas, MOLDURA)

  for (const c of coordenadas) {
    const ponto = p(c)
    assert.ok(ponto.x >= MOLDURA.margem - 1e-9 && ponto.x <= MOLDURA.largura - MOLDURA.margem + 1e-9)
    assert.ok(ponto.y >= MOLDURA.margem - 1e-9 && ponto.y <= MOLDURA.altura - MOLDURA.margem + 1e-9)
  }
})

test('os dois eixos usam a mesma escala', () => {
  // Um grau de latitude e um de longitude precisam virar a mesma distância na
  // tela; escalas separadas esticariam o mapa e uma rota curta pareceria longa.
  const { projetar: p } = projetar(
    [
      { latitude: -20, longitude: -50 },
      { latitude: -10, longitude: -10 },
    ],
    MOLDURA,
  )
  const origem = p({ latitude: -20, longitude: -50 })
  const umGrauAoNorte = p({ latitude: -19, longitude: -50 })
  const umGrauALeste = p({ latitude: -20, longitude: -49 })

  assert.ok(
    Math.abs(Math.abs(origem.y - umGrauAoNorte.y) - Math.abs(origem.x - umGrauALeste.x)) < 1e-9,
  )
})

test('ponto único e conjunto vazio não viram NaN', () => {
  const unico = projetar([{ latitude: -23, longitude: -46 }], MOLDURA)
  const ponto = unico.projetar({ latitude: -23, longitude: -46 })
  assert.ok(Number.isFinite(ponto.x) && Number.isFinite(ponto.y))

  const vazio = projetar([], MOLDURA)
  const centro = vazio.projetar({ latitude: 0, longitude: 0 })
  assert.deepEqual(centro, { x: 100, y: 100 })
})

test('coordenada ausente, fora de faixa ou no ponto zero não é desenhável', () => {
  assert.equal(coordenadaValida(-23, -46), true)
  assert.equal(coordenadaValida(null, -46), false)
  assert.equal(coordenadaValida(-23, null), false)
  assert.equal(coordenadaValida(91, 0), false)
  assert.equal(coordenadaValida(0, 181), false)
  // Aeroporto em (0, 0) é cadastro incompleto, não rota para o Golfo da Guiné.
  assert.equal(coordenadaValida(0, 0), false)
})

/* ------------------------------------------------------- rótulo que cabe */

function lugar(chave: string, rotulo: string, latitude: number, longitude: number) {
  return { chave, rotulo, latitude, longitude, domestico: false }
}

const MOLDURA_DO_TESTE = { largura: 640, altura: 420, margem: 40 }

test('rótulo que se sobrepõe a outro não é escrito, e quem chega primeiro fica', () => {
  // Dois lugares a uma fração de grau um do outro: no enquadramento eles caem a
  // poucos pixels de distância, e escrever os dois nomes produz sujeira.
  const lugares = [
    lugar('a', 'Lugar Fictício A', 10, 20),
    lugar('b', 'Lugar Fictício B', 10.02, 20.02),
    lugar('c', 'Lugar Fictício C', -30, -50),
  ]
  const projecao = projetar(lugares, MOLDURA_DO_TESTE)
  const cabem = rotulosQueCabem(lugares, projecao, 1)

  assert.ok(cabem.has('a'), 'o primeiro da ordem fica')
  assert.ok(!cabem.has('b'), 'o que colide com ele sai')
  assert.ok(cabem.has('c'), 'quem está longe continua nomeado')
})

/**
 * Uma escala fixa, dada por dois cantos distantes.
 *
 * **O enquadramento sai do conjunto desenhado**, então medir colisão sobre dois
 * pontos vizinhos sozinhos não mede nada: a moldura amplia o par até ele ocupar
 * a tela inteira. Os cantos prendem a escala para o teste falar de rótulo, e
 * não de enquadramento.
 */
const CANTOS = [lugar('canto1', '', -40, -60), lugar('canto2', '', 40, 60)]

test('a ordem decide quem fica, e ela é a do peso', () => {
  // A lista chega ordenada por emissão, então o nome que sobrevive à disputa é
  // o do corredor mais pesado. Invertendo a ordem, o vencedor inverte.
  const a = lugar('a', 'Lugar Fictício A', 10, 20)
  const b = lugar('b', 'Lugar Fictício B', 10.2, 20.2)
  const projecao = projetar(CANTOS, MOLDURA_DO_TESTE)

  assert.deepEqual([...rotulosQueCabem([a, b], projecao, 1)], ['a'])
  assert.deepEqual([...rotulosQueCabem([b, a], projecao, 1)], ['b'])
})

test('a medida é a caixa do texto, não a distância entre âncoras', () => {
  // Foi o alarme falso de 18/09: um limiar de raio calibrado para a moldura
  // grande acusava sobreposição dentro do inserto, que tem um terço da largura.
  // Os mesmos dois pontos, na mesma distância: com nome curto os dois cabem,
  // com nome longo um deles sai.
  const projecao = projetar(CANTOS, MOLDURA_DO_TESTE)
  const curto = [lugar('a', 'Aa', 0, 0), lugar('b', 'Bb', 0, 12)]
  const longo = [
    lugar('a', 'Nome Fictício Bastante Longo', 0, 0),
    lugar('b', 'Outro Nome Fictício Longo', 0, 12),
  ]
  assert.equal(rotulosQueCabem(curto, projecao, 1).size, 2)
  assert.equal(rotulosQueCabem(longo, projecao, 1).size, 1)
})

test('sem nenhum lugar não há rótulo, e isso não é erro', () => {
  const projecao = projetar([], MOLDURA_DO_TESTE)
  assert.equal(rotulosQueCabem([], projecao, 1).size, 0)
})

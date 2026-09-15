/**
 * Testes da projeção do mapa de rotas — CLAUDE.md §10.3.
 *
 * **Toda a massa aqui é fictícia, inventada do zero** (§2.2): as coordenadas
 * são pontos redondos escolhidos para a conta ser conferível na mão.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { coordenadaValida, projetar } from './mapa'

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

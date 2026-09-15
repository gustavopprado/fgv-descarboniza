/**
 * Testes do recorte de polígono.
 *
 * **Toda a massa aqui é fictícia, inventada do zero** (§2.2): quadrados e
 * triângulos com coordenadas redondas, para a conta ser conferível na mão.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { recortarAnel, type Caixa, type Ponto } from './recorte'

const CAIXA: Caixa = { oeste: 0, sul: 0, leste: 10, norte: 10 }

function dentroDaCaixa(pontos: Ponto[], caixa: Caixa): boolean {
  return pontos.every(
    ([x, y]) =>
      x >= caixa.oeste - 1e-9 &&
      x <= caixa.leste + 1e-9 &&
      y >= caixa.sul - 1e-9 &&
      y <= caixa.norte + 1e-9,
  )
}

test('anel inteiramente dentro não é alterado', () => {
  const anel: Ponto[] = [
    [2, 2],
    [8, 2],
    [8, 8],
    [2, 8],
  ]
  assert.deepEqual(recortarAnel(anel, CAIXA), anel)
})

test('anel inteiramente fora some', () => {
  const anel: Ponto[] = [
    [20, 20],
    [30, 20],
    [30, 30],
  ]
  assert.deepEqual(recortarAnel(anel, CAIXA), [])
})

test('anel que atravessa é cortado na borda', () => {
  // Um quadrado que vaza pela direita e por baixo.
  const anel: Ponto[] = [
    [5, 5],
    [20, 5],
    [20, 20],
    [5, 20],
  ]
  const recortado = recortarAnel(anel, CAIXA)

  assert.ok(recortado.length >= 3)
  assert.ok(dentroDaCaixa(recortado, CAIXA), 'sobrou vértice fora da caixa')
  // O canto que estava dentro continua lá.
  assert.ok(recortado.some(([x, y]) => x === 5 && y === 5))
})

test('anel maior que a caixa vira a própria caixa', () => {
  const anel: Ponto[] = [
    [-50, -50],
    [50, -50],
    [50, 50],
    [-50, 50],
  ]
  const recortado = recortarAnel(anel, CAIXA)

  assert.equal(recortado.length, 4)
  assert.ok(dentroDaCaixa(recortado, CAIXA))
  for (const canto of [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ]) {
    assert.ok(
      recortado.some(([x, y]) => x === canto[0] && y === canto[1]),
      `faltou o canto ${canto.join(',')}`,
    )
  }
})

test('o recorte encolhe mesmo — é para isso que ele existe', () => {
  // Anel comprido, com muitos vértices, quase todo fora do enquadramento.
  const anel: Ponto[] = Array.from({ length: 200 }, (_, i) => [i, i % 3] as Ponto)
  const recortado = recortarAnel(anel, CAIXA)
  assert.ok(
    recortado.length < anel.length / 4,
    'o recorte precisa derrubar a maior parte dos vértices de fora',
  )
})

test('aresta paralela à borda não produz NaN', () => {
  const anel: Ponto[] = [
    [-5, 5],
    [15, 5],
    [15, 6],
    [-5, 6],
  ]
  const recortado = recortarAnel(anel, CAIXA)
  assert.ok(recortado.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)))
  assert.ok(dentroDaCaixa(recortado, CAIXA))
})

test('anel degenerado não vira polígono', () => {
  assert.deepEqual(recortarAnel([], CAIXA), [])
  assert.deepEqual(
    recortarAnel(
      [
        [5, 5],
        [5, 5],
      ],
      CAIXA,
    ),
    [],
  )
})

/**
 * Testes do radar de mobilidade — CLAUDE.md §3.1.
 *
 * A garantia que importa não é geométrica: é que **só distância entra**. O
 * teste fixa a assinatura e os invariantes que fazem o desenho ser legível sem
 * dizer quem é quem.
 *
 * **Toda a massa aqui é fictícia, inventada do zero** (§2.2).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { montarRadar } from './radar'

const RAIO = 100

function comprimento(ponto: { x: number; y: number }): number {
  return Math.sqrt(ponto.x ** 2 + ponto.y ** 2)
}

test('um ponto por pessoa, e nada além de coordenada em cada um', () => {
  const { pontos } = montarRadar([5, 10, 20], { raio: RAIO })
  assert.equal(pontos.length, 3)
  for (const ponto of pontos) {
    assert.deepEqual(Object.keys(ponto).sort(), ['x', 'y'])
  }
})

test('quem mora mais longe fica mais longe do centro', () => {
  const { pontos } = montarRadar([5, 10, 40], { raio: RAIO })
  const raios = pontos.map(comprimento)
  assert.ok(raios[0] < raios[1])
  assert.ok(raios[1] < raios[2])
  // O mais distante encosta na borda: a escala usa o raio inteiro.
  assert.ok(Math.abs(raios[2] - RAIO) < 1e-9)
})

test('distâncias iguais não viram o mesmo ponto', () => {
  const { pontos } = montarRadar([12, 12, 12, 12], { raio: RAIO })
  const chaves = new Set(pontos.map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`))
  assert.equal(chaves.size, 4, 'pontos empilhados escondem quantas pessoas são')
})

test('conjunto vazio não vira NaN', () => {
  const radar = montarRadar([], { raio: RAIO })
  assert.deepEqual(radar.pontos, [])
  assert.equal(radar.distanciaMaximaKm, 0)
  assert.ok(radar.aneis.every((a) => Number.isFinite(a.raio)))
})

test('todo mundo na distância zero não divide por zero', () => {
  const { pontos } = montarRadar([0, 0], { raio: RAIO })
  assert.ok(pontos.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)))
})

test('o desenho é determinístico', () => {
  const primeiro = montarRadar([3, 9, 27], { raio: RAIO })
  const segundo = montarRadar([3, 9, 27], { raio: RAIO })
  assert.deepEqual(primeiro, segundo)
})

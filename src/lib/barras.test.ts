/**
 * Testes da geometria do gráfico de barras.
 *
 * **Toda a massa aqui é fictícia, inventada do zero** (§2.2).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { montarBarras } from './barras'

const MOLDURA = { largura: 420, altura: 260 }

function valores(...pares: [string, number][]) {
  return pares.map(([rotulo, valor]) => ({ rotulo, valor }))
}

test('a barra maior é a mais alta, e nenhuma passa da base', () => {
  const { barras, base } = montarBarras(valores(['a', 10], ['b', 40], ['c', 25]), MOLDURA)

  assert.ok(barras[1].altura > barras[2].altura)
  assert.ok(barras[2].altura > barras[0].altura)
  for (const barra of barras) {
    assert.ok(barra.altura >= 0)
    assert.ok(barra.y >= 0, 'barra estourou o topo da moldura')
    assert.ok(barra.y + barra.altura <= base + 1e-9, 'barra passou da linha de base')
  }
})

test('série inteira zerada não vira NaN nem barra cheia', () => {
  const { barras } = montarBarras(valores(['a', 0], ['b', 0]), MOLDURA)
  for (const barra of barras) {
    assert.equal(barra.altura, 0)
    assert.ok(Number.isFinite(barra.x) && Number.isFinite(barra.y))
  }
})

test('valor pequeno não some: barra ausente e barra invisível não são a mesma coisa', () => {
  const { barras } = montarBarras(valores(['grande', 10000], ['minusculo', 1]), MOLDURA)
  assert.equal(barras[0].valor > 0 && barras[0].altura > 0, true)
  assert.ok(
    barras[1].altura >= 2,
    'valor não nulo precisa de um fio de altura para não parecer ausente',
  )
})

test('valor zero continua com altura zero', () => {
  const { barras } = montarBarras(valores(['tem', 10], ['nao tem', 0]), MOLDURA)
  assert.equal(barras[1].altura, 0)
})

test('as barras não se sobrepõem e ficam dentro da largura', () => {
  const { barras } = montarBarras(
    valores(['a', 1], ['b', 2], ['c', 3], ['d', 4], ['e', 5]),
    MOLDURA,
  )
  for (let i = 1; i < barras.length; i++) {
    assert.ok(
      barras[i].x >= barras[i - 1].x + barras[i - 1].largura,
      'barras se sobrepondo',
    )
  }
  const ultima = barras[barras.length - 1]
  assert.ok(ultima.x + ultima.largura <= MOLDURA.largura)
})

test('série longa rareia o rótulo e esconde o valor no topo', () => {
  const curta = montarBarras(valores(...Array.from({ length: 6 }, (_, i) => [`m${i}`, i + 1] as [string, number])), MOLDURA)
  assert.equal(curta.saltoDoRotulo, 1)
  assert.equal(curta.mostrarValores, true)

  const longa = montarBarras(
    valores(...Array.from({ length: 24 }, (_, i) => [`m${i}`, i + 1] as [string, number])),
    MOLDURA,
  )
  assert.equal(longa.saltoDoRotulo, 2)
  assert.equal(longa.mostrarValores, false)
})

test('lista vazia não estoura', () => {
  const vazio = montarBarras([], MOLDURA)
  assert.deepEqual(vazio.barras, [])
  assert.equal(vazio.base, MOLDURA.altura - 30)
})

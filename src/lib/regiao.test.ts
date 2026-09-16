/**
 * Testes da classificação de região.
 *
 * **Toda a massa aqui é fictícia, inventada do zero** (§2.2): siglas de UF e
 * coordenadas escolhidas para exercitar a regra, não tiradas do cadastro.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { classificarRegiao, corredor, ehDoBrasil } from './regiao'

test('o uf tem precedência sobre a coordenada', () => {
  // Coordenada no meio do Atlântico, uf informado: vale o uf, que é dado.
  const r = classificarRegiao({ uf: 'PR', latitude: 0, longitude: -20 })
  assert.equal(r.regiao, 'Sul')
  assert.equal(r.criterio, 'uf')
})

test('cada uf cai na região do IBGE', () => {
  const casos: [string, string][] = [
    ['AM', 'Norte'],
    ['PE', 'Nordeste'],
    ['DF', 'Centro-Oeste'],
    ['SP', 'Sudeste'],
    ['SC', 'Sul'],
  ]
  for (const [uf, esperado] of casos) {
    assert.equal(classificarRegiao({ uf, latitude: null, longitude: null }).regiao, esperado)
  }
})

test('sem uf, a coordenada classifica — e o critério diz que foi inferência', () => {
  const casos: [number, number, string][] = [
    [50, 8, 'Europa'],
    [9, 38, 'África'],
    [23, 113, 'Ásia'],
    [25, -80, 'América do Norte'],
    [-34, -58, 'América do Sul'],
  ]
  for (const [latitude, longitude, esperado] of casos) {
    const r = classificarRegiao({ uf: null, latitude, longitude })
    assert.equal(r.regiao, esperado, `${latitude},${longitude}`)
    assert.equal(r.criterio, 'coordenada')
  }
})

test('sem uf e sem coordenada, a região fica indefinida em vez de chutada', () => {
  const r = classificarRegiao({ uf: null, latitude: null, longitude: null })
  assert.equal(r.criterio, 'indefinida')
  assert.equal(ehDoBrasil(r.regiao), false)
})

test('uf desconhecido não vira região', () => {
  const r = classificarRegiao({ uf: 'ZZ', latitude: null, longitude: null })
  assert.equal(r.criterio, 'indefinida')
})

test('coordenada fora de todas as faixas fica indefinida', () => {
  // Meio do Pacífico sul: nenhuma faixa continental cobre.
  const r = classificarRegiao({ uf: null, latitude: -40, longitude: -140 })
  assert.equal(r.criterio, 'indefinida')
})

test('o corredor não tem direção: ida e volta são o mesmo', () => {
  assert.equal(corredor('Sul', 'Sudeste'), corredor('Sudeste', 'Sul'))
  assert.equal(corredor('Sul', 'Sul'), 'Sul ↔ Sul')
})

test('só as cinco regiões do Brasil contam como Brasil', () => {
  for (const r of ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul']) {
    assert.equal(ehDoBrasil(r), true)
  }
  for (const r of ['Europa', 'Ásia', 'América do Sul', 'Região indefinida']) {
    assert.equal(ehDoBrasil(r), false, r)
  }
})

/**
 * Testes do cálculo de distância e do tratamento de limite de taxa.
 *
 * O provedor gratuito recusa quando se passa do limite por minuto, e essa
 * recusa é transitória: tratá-la como erro de dado custaria a carga inteira.
 *
 * **Toda a massa aqui é fictícia, inventada do zero** (§2.2).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { distanciaOrtodromicaKm, esperaPedida, LimiteDeTaxaError } from './distancia'

test('distância ortodrômica entre o mesmo ponto é zero', () => {
  const ponto = { latitude: -10, longitude: -50 }
  assert.equal(distanciaOrtodromicaKm(ponto, ponto), 0)
})

test('distância ortodrômica é simétrica e cresce com a separação', () => {
  const a = { latitude: -10, longitude: -50 }
  const b = { latitude: -11, longitude: -50 }
  const c = { latitude: -12, longitude: -50 }

  assert.equal(
    distanciaOrtodromicaKm(a, b).toFixed(6),
    distanciaOrtodromicaKm(b, a).toFixed(6),
  )
  assert.ok(distanciaOrtodromicaKm(a, c) > distanciaOrtodromicaKm(a, b))

  // Um grau de latitude são cerca de 111 km em qualquer longitude.
  assert.ok(Math.abs(distanciaOrtodromicaKm(a, b) - 111) < 1)
})

test('Retry-After em segundos vira espera em milissegundos', () => {
  const resposta = { headers: new Headers({ 'retry-after': '30' }) }
  assert.equal(esperaPedida(resposta), 30000)
})

test('Retry-After como data HTTP vira espera positiva', () => {
  const daquiAPouco = new Date(Date.now() + 20000).toUTCString()
  const resposta = { headers: new Headers({ 'retry-after': daquiAPouco }) }
  const espera = esperaPedida(resposta)
  assert.ok(espera !== null && espera > 0 && espera <= 20000)
})

test('sem Retry-After, quem chama decide a espera', () => {
  assert.equal(esperaPedida({ headers: new Headers() }), null)
})

test('Retry-After no passado não vira espera negativa', () => {
  const jaPassou = new Date(Date.now() - 60000).toUTCString()
  assert.equal(esperaPedida({ headers: new Headers({ 'retry-after': jaPassou }) }), 0)
})

test('o erro de limite de taxa carrega a espera pedida', () => {
  const comPedido = new LimiteDeTaxaError('Provedor Fictício', 5000)
  assert.equal(comPedido.esperarMs, 5000)
  assert.match(comPedido.message, /limite de taxa/)

  const semPedido = new LimiteDeTaxaError('Provedor Fictício', null)
  assert.equal(semPedido.esperarMs, null)
})

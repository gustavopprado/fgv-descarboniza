/**
 * Testes do período exibido nas tabelas de viagem.
 *
 * Existem por causa de uma lição repetida: **data neste sistema é texto**
 * (§9.1), e o caminho mais curto para formatá-la — passar por `Date` — devolve o
 * dia anterior em São Paulo. O teste prende o dia exato, que é onde esse erro
 * apareceria.
 *
 * **Massa fictícia, inventada do zero** (§2.2).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { periodo } from './formato'

test('um dia só sai como data única, com o dia que está na string', () => {
  assert.equal(periodo('2031-03-01', '2031-03-01'), '01/03/2031')
  // O primeiro dia do ano é onde converter para `Date` viraria 31/12 do anterior.
  assert.equal(periodo('2031-01-01', '2031-01-01'), '01/01/2031')
})

test('intervalo no mesmo ano não repete o ano', () => {
  assert.equal(periodo('2031-02-03', '2031-11-28'), '03/02–28/11/2031')
})

test('intervalo que atravessa o ano traz os dois', () => {
  assert.equal(periodo('2031-12-27', '2032-01-05'), '27/12/2031–05/01/2032')
})

test('recorte sem data não inventa uma', () => {
  assert.equal(periodo(null, null), '—')
  assert.equal(periodo('2031-05-05', null), '—')
  assert.equal(periodo(null, '2031-05-05'), '—')
})

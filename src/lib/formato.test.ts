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

import { escalaDeMassa, numero, periodo } from './formato'

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

/* --------------------------------------------- a escala do rótulo da barra */

/**
 * **A guarda é de largura, não de aparência.** O rótulo do topo tem orçamento de
 * glifos — doze meses numa coluna de painel dão pouco mais de trinta e seis
 * pixels cada —, e foi estourá-lo que motivou a escala. Um teste que só
 * conferisse o número devolvido passaria com um rótulo de oito dígitos.
 */
function escrito(maiorKg: number, valorKg: number): string {
  const escala = escalaDeMassa(maiorKg)
  return numero(valorKg / escala.divisor, escala.casas)
}

test('série grande escreve tonelada inteira, e não seis dígitos de quilo', () => {
  assert.equal(escalaDeMassa(150_000).unidade, 't CO₂e')
  assert.equal(escrito(150_000, 141_924), '142')
})

test('série média ganha uma casa, para os meses não virarem o mesmo número', () => {
  assert.equal(escrito(48_000, 21_400), '21,4')
  assert.notEqual(escrito(48_000, 21_400), escrito(48_000, 21_900))
})

test('série pequena ganha duas casas, em vez de uma coluna de zeros', () => {
  assert.equal(escrito(4_000, 2_130), '2,13')
})

test('abaixo de uma tonelada a unidade continua sendo o quilo', () => {
  // Em tonelada, trezentos quilos viraria "0,30" — o rótulo diria zero enquanto
  // a barra diz outra coisa.
  const escala = escalaDeMassa(900)
  assert.equal(escala.unidade, 'kg CO₂')
  assert.equal(escala.divisor, 1)
  assert.equal(escrito(900, 300), '300')
})

test('série vazia, zerada ou indefinida não vira NaN nem tonelada', () => {
  for (const maior of [0, Number.NaN, -1]) {
    assert.equal(escalaDeMassa(maior).unidade, 'kg CO₂')
    assert.equal(escrito(maior, 0), '0')
  }
})

test('o rótulo do maior mês nunca passa de cinco glifos', () => {
  // De um quilo a mil toneladas por mês, que é a faixa em que este inventário
  // vive. Acima disso o rótulo cresce um glifo por ordem de grandeza, e aí o
  // orçamento volta a ser discussão — não é o caso hoje.
  for (let kg = 1; kg <= 1_000_000; kg *= 1.7) {
    const rotulo = escrito(kg, kg)
    assert.ok(
      rotulo.length <= 5,
      `"${rotulo}" tem ${rotulo.length} glifos: o rótulo do topo volta a se ` +
        'sobrepor ao do mês vizinho, que é o defeito que a escala existe para ' +
        'desfazer.',
    )
  }
})

/**
 * Testes dos primitivos de planilha — `src/lib/planilha.ts`.
 *
 * As duas conversões de data novas são as que mais podem errar em silêncio: um
 * número que não é data viraria 1903, e `10/03` lido como mês e dia jogaria a
 * entrega para outubro. **Massa fictícia** (§2.2).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  dataBrOuNulo,
  dataDeSerieOuNulo,
  dataOuNulo,
  numeroOuNulo,
  texto,
} from './planilha'

test('número de série do Excel vira data, na origem de 1900', () => {
  // A origem é 1899-12-30: o Excel herdou do Lotus o ano de 1900 como bissexto.
  assert.equal(dataDeSerieOuNulo(45658), '2025-01-01')
  assert.equal(dataDeSerieOuNulo(45726), '2025-03-10')
  // Fração é hora do dia, e o inventário agrupa por dia (§10.1).
  assert.equal(dataDeSerieOuNulo(45726.75), '2025-03-10')
})

/**
 * **A faixa é a guarda que separa data de "qualquer número na coluna de data".**
 * Um código, uma quantidade ou um valor viraria 1902 ou 2153 sem nada parecer
 * errado — e o documento entraria no inventário com o período errado.
 */
test('número fora da faixa de datas não é data', () => {
  assert.equal(dataDeSerieOuNulo(1234), null)
  assert.equal(dataDeSerieOuNulo(0), null)
  assert.equal(dataDeSerieOuNulo(-45658), null)
  assert.equal(dataDeSerieOuNulo(999999), null)
  assert.equal(dataDeSerieOuNulo('45658'), null)
  assert.equal(dataDeSerieOuNulo(null), null)
})

test('data em DD/MM/AAAA é lida com o dia antes do mês', () => {
  assert.equal(dataBrOuNulo('10/03/2025'), '2025-03-10')
  assert.equal(dataBrOuNulo('1/2/2025'), '2025-02-01')
  // Dia que não existe no mês não passa: o Date normalizaria em silêncio.
  assert.equal(dataBrOuNulo('31/02/2025'), null)
  assert.equal(dataBrOuNulo('2025-03-10'), null)
  assert.equal(dataBrOuNulo('qualquer coisa'), null)
})

test('data já em AAAA-MM-DD atravessa sem passar por fuso', () => {
  assert.equal(dataOuNulo('2025-03-10'), '2025-03-10')
  assert.equal(dataOuNulo(new Date('2025-03-10T00:00:00Z')), '2025-03-10')
  assert.equal(dataOuNulo(new Date('data inválida')), null)
  assert.equal(dataOuNulo(45726), null)
})

/**
 * O aviso que mora junto de `numeroOuNulo`, em forma de teste: a limpeza de
 * separador de milhar lê `"1.701"` como mil setecentos e um. É correto onde o
 * número chega digitado à mão em quilos, e é **por isso** que o leitor de
 * entregas rodoviárias exige célula numérica em vez de reaproveitá-la (§9.3).
 */
test('a limpeza de separador brasileiro é para milhar, não para decimal', () => {
  assert.equal(numeroOuNulo('1.701'), 1701)
  assert.equal(numeroOuNulo('1,701'), 1.701)
  assert.equal(numeroOuNulo(1.701), 1.701)
  assert.equal(numeroOuNulo(''), null)
  assert.equal(numeroOuNulo('nada'), null)
})

test('texto de célula chega sem espaço nas pontas, e data inválida some', () => {
  assert.equal(texto('  algo  '), 'algo')
  assert.equal(texto(null), '')
  assert.equal(texto(new Date('data inválida')), '')
})

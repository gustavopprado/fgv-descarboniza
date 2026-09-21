/**
 * Testes da conta da distribuição rodoviária — §9.2.
 *
 * **Toda massa é fictícia** (§2.2), e o fator usado aqui é um número redondo
 * inventado: o valor real mora em `fatorEmissao`, com fonte e vigência, e não
 * entra em teste (§10.8).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { co2DaEntrega, toneladasQuilometro } from './rodoviario'

test('tonelada-quilômetro converte o peso de kg e multiplica pela distância', () => {
  // Mil quilos por dez quilômetros é uma tonelada-quilômetro por quilômetro.
  assert.equal(toneladasQuilometro(1000, 10), 10)
  assert.equal(toneladasQuilometro(500, 4), 2)
  assert.equal(toneladasQuilometro(0, 100), 0)
  assert.equal(toneladasQuilometro(100, 0), 0)
})

test('a emissão da entrega é tonelada-quilômetro vezes o fator', () => {
  assert.equal(co2DaEntrega({ pesoKg: 1000, distanciaKm: 10 }, 0.2), 2)
  assert.equal(co2DaEntrega({ pesoKg: 2000, distanciaKm: 50 }, 0.1), 10)
})

/**
 * **A distância é o trecho único filial → cliente** (§9.3): a conta não dobra
 * nada para supor retorno, porque a origem não registra o retorno e o fator médio
 * de carga já embute a operação típica do setor.
 */
test('a conta não supõe ida e volta', () => {
  const ida = co2DaEntrega({ pesoKg: 1000, distanciaKm: 100 }, 0.1)
  const idaEVolta = co2DaEntrega({ pesoKg: 1000, distanciaKm: 200 }, 0.1)
  assert.equal(ida, 10)
  assert.equal(idaEVolta, 2 * ida)
})

test('peso pequeno não vira zero por arredondamento', () => {
  // Três gramas por dois quilômetros: número pequeno, e não zero.
  const co2 = co2DaEntrega({ pesoKg: 0.003, distanciaKm: 2 }, 0.1)
  assert.ok(co2 > 0, 'a entrega leve tem emissão pequena, não emissão nenhuma')
})

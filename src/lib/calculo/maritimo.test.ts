/**
 * Testes da cascata de qualidade do dado marítimo — §8.1.1, §8.2.
 *
 * **Toda a massa é fictícia, inventada do zero** (§2.2): nenhum corredor,
 * contagem ou emissão sai de base real.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  CATEGORIA_MEDIA_CORREDOR,
  CATEGORIA_MEDIA_GERAL,
  CATEGORIA_MEDIA_PESO,
  detectarAtipico,
  ehImpossivel,
  estimar,
  montarReferencias,
  UNIDADE_POR_CONTAINER,
  type EmbarqueParaEstimar,
} from './maritimo'

const CORREDOR_A = 'XAAAA-XBBBB'
const CORREDOR_B = 'XCCCC-XDDDD'

function medido(
  corredor: string | null,
  co2Kg: number,
  containers: number | null,
  pesoKg = 1000,
  destino: string | null = null,
): EmbarqueParaEstimar {
  return { corredor, co2Kg, containers, pesoKg, destino }
}

/* ----------------------------------------------------------- referências */

test('a média do corredor sai só dos medidos, e declara o tamanho da amostra', () => {
  const refs = montarReferencias(
    [
      medido(CORREDOR_A, 1000, 1),
      medido(CORREDOR_A, 4000, 2),
      medido(CORREDOR_A, 3000, 1),
      // Sem CO₂: não é medido, não entra na média de nada.
      { corredor: CORREDOR_A, co2Kg: null, containers: 5, pesoKg: 100, destino: null },
      // Sem contagem: não diz nada sobre CO₂ por contêiner.
      medido(CORREDOR_A, 500, null),
    ],
    { amostraMinimaDoCorredor: 2 },
  )

  const doCorredor = refs.porCorredor.get(CORREDOR_A)
  // (1000/1 + 4000/2 + 3000/1) / 3 = 2000
  assert.equal(doCorredor?.valor, 2000)
  assert.equal(doCorredor?.amostra, 3)
  assert.equal(doCorredor?.categoria, CATEGORIA_MEDIA_CORREDOR)
  assert.equal(doCorredor?.unidade, UNIDADE_POR_CONTAINER)
  assert.equal(doCorredor?.chave, CORREDOR_A)
})

test('corredor abaixo da amostra mínima não produz média', () => {
  // Um corredor com um medido tem, como "média do corredor", esse único
  // embarque. Chamar isso de média daria ao número uma confiança que ele não
  // tem, e a cascata já tem o degrau seguinte.
  const refs = montarReferencias([medido(CORREDOR_A, 1000, 1)], {
    amostraMinimaDoCorredor: 3,
  })
  assert.equal(refs.porCorredor.get(CORREDOR_A), undefined)
  // A média geral, essa, existe.
  assert.equal(refs.geral?.valor, 1000)
})

test('sem nenhum medido não há referência nenhuma, e não há zero no lugar', () => {
  const refs = montarReferencias([], { amostraMinimaDoCorredor: 1 })
  assert.equal(refs.geral, null)
  assert.equal(refs.porPeso, null)
  assert.equal(refs.porCorredor.size, 0)
})

/* -------------------------------------------------------------- estimativa */

test('a cascata desce do corredor para a média geral e só então para o peso', () => {
  const refs = montarReferencias(
    [
      medido(CORREDOR_A, 2000, 1, 1000),
      medido(CORREDOR_A, 2000, 1, 1000),
      medido(CORREDOR_B, 6000, 1, 1000),
    ],
    { amostraMinimaDoCorredor: 2 },
  )

  // 1. corredor com referência própria
  const noCorredor = estimar(
    { co2Kg: null, containers: 3, pesoKg: 500, corredor: CORREDOR_A, destino: null },
    refs,
  )
  assert.equal(noCorredor?.nivel, 'estimado_corredor')
  assert.equal(noCorredor?.co2Kg, 6000)
  assert.equal(noCorredor?.referencia.amostra, 2)

  // 2. corredor sem referência própria — só um medido, abaixo da amostra
  //    mínima — cai na média geral: (2000 + 2000 + 6000) / 3 por contêiner.
  const naMedia = estimar(
    { co2Kg: null, containers: 2, pesoKg: 500, corredor: CORREDOR_B, destino: null },
    refs,
  )
  assert.equal(naMedia?.nivel, 'estimado_media')
  assert.equal(naMedia?.referencia.valor, 10000 / 3)
  assert.equal(naMedia?.co2Kg, (10000 / 3) * 2)
  assert.equal(naMedia?.referencia.categoria, CATEGORIA_MEDIA_GERAL)

  // 3. sem contagem de contêiner, o último recurso é o peso
  const noPeso = estimar(
    { co2Kg: null, containers: null, pesoKg: 500, corredor: CORREDOR_A, destino: null },
    refs,
  )
  assert.equal(noPeso?.nivel, 'estimado_peso')
  assert.equal(noPeso?.referencia.categoria, CATEGORIA_MEDIA_PESO)

  // 4. sem contagem e sem peso, não há estimativa — e não há zero no lugar
  assert.equal(
    estimar(
      { co2Kg: null, containers: null, pesoKg: null, corredor: CORREDOR_A, destino: null },
      refs,
    ),
    null,
  )
})

test('corredor nulo não impede a estimativa: ele cai na média geral', () => {
  const refs = montarReferencias(
    [medido(CORREDOR_A, 1000, 1), medido(CORREDOR_A, 3000, 1)],
    { amostraMinimaDoCorredor: 2 },
  )
  const estimativa = estimar(
    { co2Kg: null, containers: 1, pesoKg: 100, corredor: null, destino: null },
    refs,
  )
  assert.equal(estimativa?.nivel, 'estimado_media')
  assert.equal(estimativa?.co2Kg, 2000)
})

/* ---------------------------------------------------------- linha atípica */

test('linha atípica é sinalizada nos dois sentidos, e o limiar é folgado', () => {
  const medianas = new Map([[CORREDOR_A, { mediana: 1000, amostra: 10 }]])
  const opcoes = { limiar: 4, amostraMinima: 3 }

  const acima = detectarAtipico(
    { co2Kg: 5000, containers: 1, corredor: CORREDOR_A },
    medianas,
    opcoes,
  )
  assert.equal(acima?.razao, 5)

  const abaixo = detectarAtipico(
    { co2Kg: 100, containers: 1, corredor: CORREDOR_A },
    medianas,
    opcoes,
  )
  assert.equal(abaixo?.razao, 0.1)

  // Dentro da banda, nada é sinalizado: alerta que dispara em boa parte das
  // linhas é alerta que se aprende a ignorar.
  for (const co2 of [300, 1000, 3900]) {
    assert.equal(
      detectarAtipico({ co2Kg: co2, containers: 1, corredor: CORREDOR_A }, medianas, opcoes),
      null,
    )
  }
})

test('corredor com poucas linhas não sinaliza nada', () => {
  // A mediana de um corredor de uma linha só é a própria linha, e nada nunca
  // destoaria dela — sinalizar ali seria ruído garantido.
  const medianas = new Map([[CORREDOR_A, { mediana: 1000, amostra: 2 }]])
  assert.equal(
    detectarAtipico(
      { co2Kg: 100000, containers: 1, corredor: CORREDOR_A },
      medianas,
      { limiar: 4, amostraMinima: 3 },
    ),
    null,
  )
})

test('sem contagem, sem corredor ou sem emissão não há atípico a medir', () => {
  const medianas = new Map([[CORREDOR_A, { mediana: 1000, amostra: 10 }]])
  const opcoes = { limiar: 4, amostraMinima: 3 }
  assert.equal(
    detectarAtipico({ co2Kg: 50000, containers: null, corredor: CORREDOR_A }, medianas, opcoes),
    null,
  )
  assert.equal(
    detectarAtipico({ co2Kg: 50000, containers: 1, corredor: null }, medianas, opcoes),
    null,
  )
  assert.equal(
    detectarAtipico({ co2Kg: null, containers: 1, corredor: CORREDOR_A }, medianas, opcoes),
    null,
  )
  assert.equal(
    detectarAtipico({ co2Kg: 50000, containers: 1, corredor: CORREDOR_B }, medianas, opcoes),
    null,
  )
})

/* -------------------------------------------------------- linha impossível */

test('linha impossível é medida contra a mediana geral, com limiar muito maior', () => {
  // Uma linha cuja ordem de grandeza não pertence ao módulo: o sintoma típico é
  // fórmula errada na origem, peso multiplicado por distância.
  assert.ok(ehImpossivel(2_000_000, 1000, 1000))
  assert.ok(!ehImpossivel(500_000, 1000, 1000))
  // O limiar do atípico deixaria passar o impossível, e o do impossível não
  // morderia o atípico: são duas regras, com dois limiares.
  assert.ok(!ehImpossivel(5000, 1000, 1000))
})

test('sem mediana geral não há como decidir, e nada é recusado por engano', () => {
  assert.ok(!ehImpossivel(2_000_000, null, 1000))
  assert.ok(!ehImpossivel(2_000_000, 0, 1000))
  assert.ok(!ehImpossivel(null, 1000, 1000))
})

test('a regra do impossível é só para cima', () => {
  // Emissão muito pequena é carga pequena, que é comum e verdadeira. Recusar
  // por baixo apagaria emissão real, que é o que a §8.1.1 separa do atípico.
  assert.ok(!ehImpossivel(0.001, 1000, 1000))
})

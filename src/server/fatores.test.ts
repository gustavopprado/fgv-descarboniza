/**
 * Testes do resolvedor de fatores e da política de fator ausente.
 *
 * A regra da §9.8 é que **nunca se assume um valor**. A granularidade da falha é
 * o registro, não a carga: combinação sem fator vira exceção sinalizada e o
 * processamento segue, porque uma linha ruim não pode derrubar as outras.
 *
 * **Toda a massa aqui é fictícia, inventada do zero** (§2.2).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Firestore } from 'firebase-admin/firestore'

import { carregarFatores, FatorAusenteError } from './fatores'
import type { DocFatorEmissao } from './documentos/tipos'

/** Firestore de mentira, para exercitar o resolvedor de produção sem banco. */
function bancoCom(fatores: DocFatorEmissao[]): Firestore {
  return {
    collection: () => ({
      get: async () => ({
        size: fatores.length,
        docs: fatores.map((f) => ({ data: () => f })),
      }),
    }),
  } as unknown as Firestore
}

function fator(parcial: Partial<DocFatorEmissao>): DocFatorEmissao {
  return {
    categoria: 'mobilidade_moto',
    chave: 'gasolina',
    valor: 0.1,
    unidade: 'kg CO2e por km',
    fonte: 'fonte fictícia',
    versao: 'FICT-2031',
    vigenciaInicio: '2031-01-01',
    vigenciaFim: null,
    ...parcial,
  }
}

test('devolve o fator vigente na data', async () => {
  const fatores = await carregarFatores(bancoCom([fator({})]))
  const encontrado = fatores.vigente('mobilidade_moto', 'gasolina', '2031-12-31')
  assert.equal(encontrado.valor, 0.1)
  assert.equal(encontrado.versao, 'FICT-2031')
})

test('combinação sem fator lança, em vez de devolver aproximação', () => {
  // Moto a diesel e moto elétrica não têm fator de propósito: são combinações
  // que indicam erro de preenchimento.
  return carregarFatores(bancoCom([fator({})])).then((fatores) => {
    assert.throws(
      () => fatores.vigente('mobilidade_moto', 'diesel', '2031-12-31'),
      FatorAusenteError,
    )
    assert.throws(
      () => fatores.vigente('mobilidade_moto', 'eletrico', '2031-12-31'),
      FatorAusenteError,
    )
  })
})

test('fator fora de vigência não é usado como substituto', async () => {
  const fatores = await carregarFatores(
    bancoCom([fator({ vigenciaInicio: '2031-01-01', vigenciaFim: '2031-06-30' })]),
  )
  fatores.vigente('mobilidade_moto', 'gasolina', '2031-03-01')
  assert.throws(
    () => fatores.vigente('mobilidade_moto', 'gasolina', '2031-12-31'),
    FatorAusenteError,
  )
})

test('havendo duas vigências, vence a de início mais recente', async () => {
  const fatores = await carregarFatores(
    bancoCom([
      fator({ versao: 'FICT-2031', vigenciaInicio: '2031-01-01', valor: 0.1 }),
      fator({ versao: 'FICT-2032', vigenciaInicio: '2032-01-01', valor: 0.2 }),
    ]),
  )
  assert.equal(fatores.vigente('mobilidade_moto', 'gasolina', '2031-06-01').valor, 0.1)
  assert.equal(fatores.vigente('mobilidade_moto', 'gasolina', '2032-06-01').valor, 0.2)
})

test('coleção vazia não vira fator zero', async () => {
  const fatores = await carregarFatores(bancoCom([]))
  assert.equal(fatores.total, 0)
  assert.throws(
    () => fatores.vigente('mobilidade_carro', 'gasolina', '2031-06-01'),
    FatorAusenteError,
  )
})

/**
 * O que a carga faz com a recusa: sinaliza a linha, tira da média e segue.
 *
 * O laço de produção está dentro do script de ingestão; aqui o que se garante é
 * a forma do resultado, que é o que o resto do sistema consome — exceção com
 * motivo, alerta registrado, fator nulo e emissão zero. A validação de escrita
 * já exige que fator nulo venha com emissão zero.
 */
test('a recusa é por registro: os demais continuam sendo calculados', async () => {
  const fatores = await carregarFatores(bancoCom([fator({})]))

  const respostas = [
    { transporte: 'mobilidade_moto', combustivel: 'gasolina' },
    { transporte: 'mobilidade_moto', combustivel: 'diesel' },
    { transporte: 'mobilidade_moto', combustivel: 'gasolina' },
  ]

  const processados = respostas.map((r) => {
    try {
      const f = fatores.vigente(r.transporte, r.combustivel, '2031-06-01')
      return { excecao: false, motivo: null as string | null, fator: f, co2: 100 }
    } catch (erro) {
      if (!(erro instanceof FatorAusenteError)) throw erro
      return {
        excecao: true,
        motivo: `sem fator para a combinação: ${r.transporte} com ${r.combustivel}`,
        fator: null,
        co2: 0,
      }
    }
  })

  assert.equal(processados.length, 3, 'nenhum registro pode se perder na recusa')
  assert.equal(processados.filter((p) => !p.excecao).length, 2)

  const recusado = processados[1]
  assert.equal(recusado.excecao, true)
  assert.ok(recusado.motivo, 'exceção sem motivo não aparece na tela de método')
  assert.equal(recusado.fator, null)
  assert.equal(recusado.co2, 0, 'sem fator não se inventa emissão')
})

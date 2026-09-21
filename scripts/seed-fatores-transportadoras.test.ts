/**
 * Guardas do seed do fator de frete rodoviário — `seed-fatores-transportadoras.ts`.
 *
 * O seed não traz valor nenhum: ele valida a forma do arquivo que quem assina o
 * relatório monta. **A guarda que mais importa é a da unidade**, e o motivo é a
 * fonte: a mesma tabela publica o fator por quilômetro na coluna ao lado do
 * fator por tonelada-quilômetro. Trocar uma pela outra produz um número
 * centenas de vezes errado **com tudo parecendo funcionar** — a carga roda, o
 * total fecha com a soma das entregas e a tela desenha.
 *
 * **Massa fictícia** (§2.2): os valores aqui são números redondos inventados, e
 * o fator real não entra em teste nem no repositório (§9.2, §10.8).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { montarLinhas } from './seed-fatores-transportadoras'

type Arquivo = Parameters<typeof montarLinhas>[0]

function arquivo(fatores: Arquivo['fatores'], resto: Partial<Arquivo> = {}): Arquivo {
  return {
    versao: 'ficticia-1',
    fonte: 'Fonte fictícia, tabela fictícia, ano fictício.',
    vigencia_inicio: '2031-01-01',
    vigencia_fim: null,
    fatores,
    ...resto,
  }
}

const VALIDO = { chave: 'geral', valor: 0.1, unidade: 'kg CO2e por tonelada-quilometro' }

test('fator bem formado vira linha com categoria, fonte, versão e vigência', () => {
  const [linha] = montarLinhas(arquivo([VALIDO]))

  assert.equal(linha.categoria, 'frete_rodoviario_tkm')
  assert.equal(linha.chave, 'geral')
  assert.equal(linha.valor, 0.1)
  assert.equal(linha.versao, 'ficticia-1')
  assert.equal(linha.vigenciaInicio, '2031-01-01')
  assert.equal(linha.vigenciaFim, null)
})

/**
 * As três grafias dizem a mesma unidade. A primeira versão da guarda só tirava
 * espaço e ponto da comparação, então **ela reprovou a grafia com hífen** — que
 * é a do arquivo real. Alarme falso é como uma guarda começa a ser ignorada, e
 * por isso o conserto foi alargar a grafia aceita, nunca afrouxar o que ela
 * exige.
 */
test('a unidade é aceita em qualquer grafia de tonelada-quilômetro', () => {
  for (const unidade of [
    'kg CO2e por tonelada-quilometro',
    'kg CO2e por tonelada quilômetro',
    'kg CO2e / t.km',
    'kgCO2e/tkm',
  ]) {
    const [linha] = montarLinhas(arquivo([{ ...VALIDO, unidade }]))
    assert.equal(linha.unidade, unidade)
  }
})

test('unidade que não é por tonelada-quilômetro é recusada', () => {
  // O erro que esta guarda existe para pegar: a coluna vizinha na fonte.
  assert.throws(
    () => montarLinhas(arquivo([{ ...VALIDO, unidade: 'kg CO2e por km' }])),
    /tonelada-quilômetro/,
  )
  assert.throws(() => montarLinhas(arquivo([{ ...VALIDO, unidade: '' }])), /sem unidade/)
})

/**
 * Zero zeraria o módulo inteiro **em silêncio**: a carga gravaria, o total
 * fecharia e a tela desenharia um inventário sem emissão nenhuma de
 * distribuição.
 */
test('valor não positivo é recusado', () => {
  for (const valor of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => montarLinhas(arquivo([{ ...VALIDO, valor }])), /Valor inválido/)
  }
})

test('vigência fora do formato de data é recusada', () => {
  assert.throws(
    () => montarLinhas(arquivo([VALIDO], { vigencia_inicio: '01/01/2031' })),
    /AAAA-MM-DD/,
  )
  assert.throws(
    () => montarLinhas(arquivo([VALIDO], { vigencia_fim: 'quando acabar' })),
    /AAAA-MM-DD/,
  )
})

/**
 * Sem a chave que a carga procura, o seed "funcionaria" e a carga pararia depois
 * reclamando de fator ausente — erro no lugar errado, longe da causa.
 */
test('arquivo sem a chave que a carga procura é recusado', () => {
  assert.throws(
    () => montarLinhas(arquivo([{ ...VALIDO, chave: 'refrigerado' }])),
    /"geral"/,
  )
  assert.throws(() => montarLinhas(arquivo([{ ...VALIDO, chave: '' }])), /chave/)
})

test('campo obrigatório ausente é recusado pelo nome', () => {
  for (const campo of ['versao', 'fonte', 'vigencia_inicio', 'fatores'] as const) {
    const incompleto = arquivo([VALIDO])
    delete (incompleto as Record<string, unknown>)[campo]
    assert.throws(() => montarLinhas(incompleto), new RegExp(campo))
  }
})

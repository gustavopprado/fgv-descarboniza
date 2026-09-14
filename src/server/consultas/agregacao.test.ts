/**
 * Testes das garantias da camada de consulta — supressão de grupos pequenos,
 * nulo como categoria visível e o invariante do total (§3.1 e §9.10).
 *
 * São as regras que o banco relacional cumpria dentro das views. Agora elas só
 * existem porque estão no código, então têm teste.
 *
 * **Toda a massa aqui é fictícia, inventada do zero** (§2.2).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  AcessoNegadoError,
  exigirModulo,
  exigirPainel,
  limiteDeEmpresa,
  podeVerQuemRegistrou,
  type ContextoDeAcesso,
} from './acesso'
import { agrupar, emToneladas, media, serieMensal, somar } from './agregacao'
import type { Papel } from '../documentos/tipos'

type Registro = { bairro: string | null; empresa: string | null; pessoa: string; co2: number }

function registros(...linhas: [string | null, string, number][]): Registro[] {
  return linhas.map(([bairro, pessoa, co2]) => ({ bairro, empresa: null, pessoa, co2 }))
}

const chave = (r: Registro) => r.bairro
const valor = (r: Registro) => r.co2
const pessoa = (r: Registro) => r.pessoa

/* ------------------------------------------------------------- supressão */

test('recorte com menos pessoas que o limite vira "outros"', () => {
  const dados = registros(
    ['Bairro A', 'p1', 10],
    ['Bairro A', 'p2', 10],
    ['Bairro A', 'p3', 10],
    ['Bairro B', 'p4', 5],
    ['Bairro C', 'p5', 7],
  )

  const grupos = agrupar(dados, { chave, valor, pessoa, rotuloNulo: 'Sem bairro', limite: 3 })

  const a = grupos.find((g) => g.rotulo === 'Bairro A')
  const outros = grupos.find((g) => g.agrupadoPorSupressao)
  assert.equal(a?.pessoas, 3)
  assert.ok(outros, 'os bairros pequenos precisam virar um grupo "outros"')
  assert.equal(outros.pessoas, 2)
  assert.equal(outros.co2Kg, 12)
  // O balde de suprimidos não diz onde ninguém mora.
  assert.ok(!grupos.some((g) => g.rotulo === 'Bairro B' || g.rotulo === 'Bairro C'))
})

test('a supressão conta PESSOAS, não documentos', () => {
  // Uma pessoa só, com muitas viagens para o mesmo destino, continua sendo uma
  // pessoa — e o recorte continua identificando ela.
  const dados = registros(
    ['Destino X', 'p1', 1],
    ['Destino X', 'p1', 1],
    ['Destino X', 'p1', 1],
    ['Destino X', 'p1', 1],
    ['Destino X', 'p1', 1],
  )
  const grupos = agrupar(dados, { chave, valor, pessoa, rotuloNulo: 'n/d', limite: 3 })
  assert.equal(grupos.length, 1)
  assert.equal(grupos[0].agrupadoPorSupressao, true)
  assert.equal(grupos[0].documentos, 5)
  assert.equal(grupos[0].pessoas, 1)
})

test('sem limite não há supressão', () => {
  const dados = registros(['Bairro A', 'p1', 1], ['Bairro B', 'p2', 2])
  const grupos = agrupar(dados, { chave, valor, pessoa, rotuloNulo: 'n/d' })
  assert.equal(grupos.length, 2)
  assert.ok(!grupos.some((g) => g.agrupadoPorSupressao))
})

/* --------------------------------------------------------- nulo visível */

test('nulo é fatia própria, com rótulo, e não some do total', () => {
  const dados = registros(
    ['Bairro A', 'p1', 10],
    [null, 'p2', 4],
    [null, 'p3', 6],
  )
  const grupos = agrupar(dados, { chave, valor, pessoa, rotuloNulo: 'Sem bairro' })

  const semBairro = grupos.find((g) => g.rotulo === 'Sem bairro')
  assert.ok(semBairro, 'a ausência precisa aparecer como categoria')
  assert.equal(semBairro.documentos, 2)
  assert.equal(semBairro.co2Kg, 10)
  assert.equal(
    grupos.reduce((s, g) => s + g.co2Kg, 0),
    20,
  )
})

test('o total sempre bate com a contagem de documentos', () => {
  const dados = registros(
    ['Bairro A', 'p1', 1],
    [null, 'p2', 1],
    ['Bairro B', 'p3', 1],
    ['Bairro C', 'p4', 1],
  )
  for (const limite of [undefined, 1, 2, 5, 99]) {
    const grupos = agrupar(dados, { chave, valor, pessoa, rotuloNulo: 'n/d', limite })
    assert.equal(
      grupos.reduce((s, g) => s + g.documentos, 0),
      dados.length,
      `documento sumiu com limite ${limite}`,
    )
  }
})

test('lista vazia agrega para vazio sem estourar', () => {
  assert.deepEqual(agrupar([] as Registro[], { chave, valor, pessoa, rotuloNulo: 'n/d' }), [])
})

/* -------------------------------------------------------------- auxiliares */

test('série mensal ordena e ignora documento sem mês', () => {
  const itens = [
    { mes: '2031-03', co2: 2 },
    { mes: '2031-01', co2: 1 },
    { mes: null, co2: 99 },
    { mes: '2031-03', co2: 3 },
  ]
  const serie = serieMensal(itens, (i) => i.mes, (i) => i.co2)
  assert.deepEqual(serie, [
    { mes: '2031-01', co2Kg: 1, documentos: 1 },
    { mes: '2031-03', co2Kg: 5, documentos: 2 },
  ])
})

test('soma, média e conversão para toneladas', () => {
  const itens = [{ v: 1000 }, { v: 3000 }]
  assert.equal(somar(itens, (i) => i.v), 4000)
  assert.equal(media(itens, (i) => i.v), 2000)
  assert.equal(media([] as { v: number }[], (i) => i.v), 0)
  assert.equal(emToneladas(2500), 2.5)
})

/* ------------------------------------------------------------ autorização */

function contexto(papel: Papel, empresa: string | null = null): ContextoDeAcesso {
  return { uid: 'uid-ficticio', email: 'pessoa@exemplo.invalid', papel, empresa }
}

test('colaborador não abre o painel nem módulo nenhum', () => {
  assert.throws(() => exigirPainel(contexto('colaborador')), AcessoNegadoError)
  assert.throws(() => exigirModulo(contexto('colaborador'), 'viagens'), AcessoNegadoError)
  assert.throws(() => exigirModulo(contexto('colaborador'), 'maritimo'), AcessoNegadoError)
})

test('importacao só alcança o módulo marítimo', () => {
  exigirModulo(contexto('importacao'), 'maritimo')
  assert.throws(() => exigirModulo(contexto('importacao'), 'mobilidade'), AcessoNegadoError)
  assert.throws(() => exigirModulo(contexto('importacao'), 'viagens'), AcessoNegadoError)
})

test('importacao pode ser limitado por empresa; os outros veem todas', () => {
  assert.equal(limiteDeEmpresa(contexto('importacao', 'Empresa Fictícia')), 'Empresa Fictícia')
  assert.equal(limiteDeEmpresa(contexto('importacao', null)), null)
  assert.equal(limiteDeEmpresa(contexto('admin', 'Empresa Fictícia')), null)
  assert.equal(limiteDeEmpresa(contexto('gestor', 'Empresa Fictícia')), null)
})

test('gestor vê o inventário inteiro, mas nunca quem registrou', () => {
  exigirModulo(contexto('gestor'), 'mobilidade')
  exigirModulo(contexto('gestor'), 'viagens')
  exigirModulo(contexto('gestor'), 'maritimo')
  assert.equal(podeVerQuemRegistrou(contexto('gestor')), false)
  assert.equal(podeVerQuemRegistrou(contexto('admin')), true)
  assert.equal(podeVerQuemRegistrou(contexto('sustentabilidade')), true)
  assert.equal(podeVerQuemRegistrou(contexto('colaborador')), false)
})

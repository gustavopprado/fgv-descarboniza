/**
 * Testes da leitura da planilha do cartão.
 *
 * **Toda a massa aqui é fictícia, inventada do zero** (§2.2). Os formatos
 * exercitados são os que uma planilha digitada à mão produz — código e nome na
 * mesma célula, separador irregular, data só na primeira linha —, mas nenhum
 * valor vem da planilha real.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ALERTA_NOME_COMO_COMPANHIA,
  ALERTA_CODIGO_POR_APELIDO,
  ALERTA_DATA_HERDADA,
  ALERTA_SEQUENCIA_QUEBRADA,
  lerCartao,
  resolverCodigo,
  separarRota,
  type LinhaDoCartao,
} from './cartao'

function linha(parcial: Partial<LinhaDoCartao>): LinhaDoCartao {
  return { usuario: '', data: null, rota: '', vazia: false, ...parcial }
}

/* --------------------------------------------------------------- códigos */

test('código de três letras é lido como está', () => {
  assert.deepEqual(resolverCodigo('CWB'), { codigo: 'CWB', porApelido: false })
  assert.deepEqual(resolverCodigo(' gru '), { codigo: 'GRU', porApelido: false })
})

test('nome de lugar resolve por apelido, e isso fica marcado', () => {
  assert.deepEqual(resolverCodigo('BRASILIA'), { codigo: 'BSB', porApelido: true })
  assert.deepEqual(resolverCodigo('Manaus'), { codigo: 'MAO', porApelido: true })
})

test('o apelido é consultado antes do código de três letras', () => {
  // Sem essa ordem, "BOA VISTA" viraria "BOA" — um código que não existe.
  assert.deepEqual(resolverCodigo('BOA VISTA'), { codigo: 'BVB', porApelido: true })
})

test('parênteses e espaço sobrando não atrapalham', () => {
  assert.deepEqual(resolverCodigo('GRU (GUARULHOS)'), {
    codigo: 'GRU',
    porApelido: true,
  })
})

test('texto que não resolve devolve nulo, em vez de chutar', () => {
  assert.equal(resolverCodigo(''), null)
  assert.equal(resolverCodigo('   '), null)
  assert.equal(resolverCodigo('ALGUM LUGAR DESCONHECIDO'), null)
})

/* ----------------------------------------------------------------- rotas */

test('o lugar repetido por extenso não vira escala', () => {
  // "GRU- FRA- FRANKFURT" é Guarulhos para Frankfurt, não três paradas.
  assert.deepEqual(separarRota('GRU- FRA- FRANKFURT'), {
    origem: 'GRU',
    destino: 'FRA',
    porApelido: false,
  })
})

test('o destino é o último pedaço legível', () => {
  assert.deepEqual(separarRota('ADD- ADDIS ABABA - CAN GUANGZHOU'), {
    origem: 'ADD',
    destino: 'CAN',
    porApelido: true,
  })
})

test('separador irregular não quebra a leitura', () => {
  assert.deepEqual(separarRota('GRU-  CWB'), {
    origem: 'GRU',
    destino: 'CWB',
    porApelido: false,
  })
})

test('rota sem dois lados legíveis é recusada', () => {
  assert.equal(separarRota('CWB'), null)
  assert.equal(separarRota(''), null)
  assert.equal(separarRota('LUGAR X - LUGAR Y'), null)
})

/* ---------------------------------------------------------------- blocos */

test('a linha em branco separa viagens', () => {
  const { trechos } = lerCartao([
    linha({ usuario: 'Pessoa Fictícia', data: '2031-03-01', rota: 'CWB- GRU' }),
    linha({ rota: 'GRU- CWB' }),
    linha({ vazia: true }),
    linha({ usuario: 'Outra Pessoa', data: '2031-05-02', rota: 'CWB- BSB' }),
  ])

  assert.equal(trechos.length, 3)
  assert.deepEqual(
    trechos.map((t) => t.bloco),
    [1, 1, 2],
  )
  assert.deepEqual(
    trechos.map((t) => t.ordem),
    [1, 2, 1],
  )
})

test('nome e data valem para o bloco, e não atravessam a linha em branco', () => {
  const { trechos, descartadas } = lerCartao([
    linha({ usuario: 'Pessoa Fictícia', data: '2031-03-01', rota: 'CWB- GRU' }),
    linha({ rota: 'GRU- CWB' }),
    linha({ vazia: true }),
    // Bloco novo sem nome nem data: não herda nada do anterior.
    linha({ rota: 'CWB- BSB' }),
  ])

  assert.equal(trechos.length, 2)
  assert.equal(trechos[1].usuario, 'Pessoa Fictícia')
  assert.equal(trechos[1].data, '2031-03-01')
  assert.equal(descartadas.length, 1)
  assert.match(descartadas[0].motivo, /sem data/)
})

test('a linha só com data e nome é cabeçalho do bloco, não trecho', () => {
  const { trechos, descartadas } = lerCartao([
    linha({ usuario: 'Pessoa Fictícia', data: '2031-03-01' }),
    linha({ rota: 'CWB- GRU' }),
  ])

  assert.equal(trechos.length, 1)
  assert.equal(trechos[0].data, '2031-03-01')
  assert.equal(descartadas.length, 0)
})

/* --------------------------------------------------------------- alertas */

test('data herdada, apelido e sequência quebrada viram alerta', () => {
  const { trechos } = lerCartao([
    linha({ usuario: 'Pessoa Fictícia', data: '2031-03-01', rota: 'CWB- GRU' }),
    linha({ rota: 'MANAUS- BOA VISTA' }),
  ])

  const segundo = trechos[1]
  const tipos = segundo.alertas.map((a) => a.tipo)
  assert.ok(tipos.includes(ALERTA_DATA_HERDADA))
  assert.ok(tipos.includes(ALERTA_CODIGO_POR_APELIDO))
  assert.ok(
    tipos.includes(ALERTA_SEQUENCIA_QUEBRADA),
    'trecho que não começa onde o anterior terminou precisa ser sinalizado',
  )
})

test('o primeiro nome do bloco é o viajante; o segundo é a companhia', () => {
  // Foi este caso que atribuiu uma viagem inteira a uma empresa aérea: o nome
  // mais recente vencia, e o nome mais recente era o da companhia.
  const { trechos } = lerCartao([
    linha({ usuario: 'Pessoa Fictícia', data: '2031-03-01', rota: 'CWB- GRU' }),
    linha({ usuario: 'Companhia Fictícia', rota: 'GRU- BSB' }),
    linha({ rota: 'BSB- CWB' }),
  ])

  assert.deepEqual(
    trechos.map((t) => t.usuario),
    ['Pessoa Fictícia', 'Pessoa Fictícia', 'Pessoa Fictícia'],
  )
  assert.equal(trechos[0].companhia, null)
  assert.equal(trechos[1].companhia, 'Companhia Fictícia')
  assert.equal(trechos[2].companhia, 'Companhia Fictícia')
  assert.ok(
    trechos[1].alertas.some((a) => a.tipo === ALERTA_NOME_COMO_COMPANHIA),
    'a suposição de que o segundo nome é companhia precisa ficar visível',
  )
})

test('o viajante do bloco não vaza para o bloco seguinte', () => {
  const { trechos, descartadas } = lerCartao([
    linha({ usuario: 'Pessoa Fictícia', data: '2031-03-01', rota: 'CWB- GRU' }),
    linha({ vazia: true }),
    linha({ usuario: 'Outra Pessoa', data: '2031-04-01', rota: 'CWB- BSB' }),
  ])

  assert.deepEqual(
    trechos.map((t) => t.usuario),
    ['Pessoa Fictícia', 'Outra Pessoa'],
  )
  assert.equal(descartadas.length, 0)
})

test('linha ilegível é descartada com motivo, não some', () => {
  const { trechos, descartadas } = lerCartao([
    linha({ usuario: 'Pessoa Fictícia', data: '2031-03-01', rota: 'CWB- GRU' }),
    linha({ rota: 'ALGUMA COISA SEM SENTIDO' }),
  ])

  assert.equal(trechos.length, 1)
  assert.equal(descartadas.length, 1)
  assert.equal(descartadas[0].linha, 2)
  assert.match(descartadas[0].motivo, /origem e destino/)
})

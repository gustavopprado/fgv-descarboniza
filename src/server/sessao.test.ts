/**
 * Teste da duração da sessão — CLAUDE.md §11.10.
 *
 * Não é um teste que repete a constante: é o limite que o Firebase impõe a
 * `createSessionCookie`, e estourá-lo derruba **todo** login, em produção, com
 * um erro que só aparece na hora de entrar. O teto de quatorze dias também é
 * uma tentação de conveniência, e este teste é o que torna a escolha de encurtar
 * uma decisão visível em vez de um número que alguém aumenta sem pensar.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DURACAO_MAXIMA_MS,
  DURACAO_MINIMA_MS,
  DURACAO_SESSAO_MS,
} from './sessao'

test('a sessão cabe nos limites que o Firebase aceita', () => {
  assert.ok(
    DURACAO_SESSAO_MS >= DURACAO_MINIMA_MS,
    'abaixo do mínimo do Firebase: createSessionCookie recusaria e ninguém entraria',
  )
  assert.ok(
    DURACAO_SESSAO_MS <= DURACAO_MAXIMA_MS,
    'acima do máximo do Firebase: createSessionCookie recusaria e ninguém entraria',
  )
})

test('a sessão não dura mais que um dia de trabalho', () => {
  const umDia = 24 * 60 * 60 * 1000
  assert.ok(
    DURACAO_SESSAO_MS <= umDia,
    'sessão que atravessa a noite mantém viva a de um notebook esquecido aberto',
  )
})

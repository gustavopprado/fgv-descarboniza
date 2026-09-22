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
  exigirModulo,
  exigirProgramaDeViagens,
  exigirVisaoGeral,
  limiteDeEmpresa,
  MODULOS,
  podeVerQuemRegistrou,
} from './consultas/acesso'
import {
  DURACAO_MAXIMA_MS,
  DURACAO_MINIMA_MS,
  DURACAO_SESSAO_MS,
  PAPEL_PADRAO_DO_DOMINIO,
} from './sessao'

/** Contexto fictício com o papel padrão, para exercitar as portas de acesso. */
const padrao = {
  uid: 'uid-ficticio',
  email: 'pessoa.ficticia@exemplo.invalido',
  papel: PAPEL_PADRAO_DO_DOMINIO,
  empresa: null,
  funcionarioId: null,
}

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

/* ------------------------------------------- papel padrão do domínio (§5.2) */

/**
 * Quem é do domínio e não tem perfil cadastrado recebe este papel. Antes ele
 * não recebia nenhum, e a mudança é decisão registrada — o que segue prende as
 * consequências dela, que é onde o descuido apareceria.
 */

test('o padrão vê tudo: a visão geral e os quatro módulos', () => {
  assert.doesNotThrow(() => exigirVisaoGeral(padrao))
  for (const modulo of MODULOS) {
    assert.doesNotThrow(
      () => exigirModulo(padrao, modulo),
      `o padrão precisa alcançar ${modulo}: o pedido foi que todos vejam tudo`,
    )
  }
})

test('o padrão entra no programa, senão ninguém registraria viagem', () => {
  assert.doesNotThrow(
    () => exigirProgramaDeViagens(padrao),
    'sem isto o padrão veria o inventário e não conseguiria registrar a própria viagem',
  )
})

test('o padrão NÃO vê quem registrou cada viagem — é a guarda desta mudança', () => {
  assert.equal(
    podeVerQuemRegistrou(padrao),
    false,
    'nome de quem registrou é a única coisa deste sistema que identifica pessoa ' +
      '(§3.2); um padrão que a exponha entrega dado pessoal à empresa inteira',
  )
})

test('o padrão não é admin nem sustentabilidade, e o motivo é o teste acima', () => {
  assert.ok(
    PAPEL_PADRAO_DO_DOMINIO !== 'admin' &&
      PAPEL_PADRAO_DO_DOMINIO !== 'sustentabilidade',
    'os dois veem quem registrou; como padrão, dariam isso a todo mundo do domínio',
  )
})

test('o padrão não é recortado por empresa', () => {
  assert.equal(
    limiteDeEmpresa(padrao),
    null,
    'só importacao é recortado, e ele nunca é o padrão — um recorte aqui ' +
      'esvaziaria as telas em silêncio',
  )
})

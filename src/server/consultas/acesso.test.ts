/**
 * Testes de autorização — CLAUDE.md §5 e §11.3.
 *
 * A regra que mais custou a existir está aqui: **`importacao` não vê a visão
 * geral.** Ele enxerga um módulo só, e um total que soma um módulo seria um
 * número menor que o inventário apresentado como se fosse o inventário — o erro
 * que a §9.10 existe para impedir. A recusa é o comportamento correto, não um
 * bug a contornar.
 *
 * **Toda a massa aqui é fictícia, inventada do zero** (§2.2).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { Papel } from '../documentos/tipos'
import {
  AcessoNegadoError,
  exigirInventario,
  exigirModulo,
  exigirProgramaDeViagens,
  exigirVisaoGeral,
  limiteDeEmpresa,
  modulosVisiveis,
  podeVerQuemRegistrou,
  type ContextoDeAcesso,
} from './acesso'

function ctx(papel: Papel, empresa: string | null = null): ContextoDeAcesso {
  return {
    uid: 'uid-ficticio',
    email: `pessoa.ficticia@exemplo.invalid`,
    papel,
    empresa,
  }
}

test('importacao não recebe a visão geral', () => {
  assert.throws(() => exigirVisaoGeral(ctx('importacao')), AcessoNegadoError)
})

test('importacao continua entrando no inventário e no módulo marítimo', () => {
  exigirInventario(ctx('importacao'))
  exigirModulo(ctx('importacao'), 'maritimo')
  assert.deepEqual(modulosVisiveis(ctx('importacao')), ['maritimo'])
})

test('importacao não alcança mobilidade nem viagens', () => {
  assert.throws(() => exigirModulo(ctx('importacao'), 'mobilidade'), AcessoNegadoError)
  assert.throws(() => exigirModulo(ctx('importacao'), 'viagens'), AcessoNegadoError)
})

test('admin, sustentabilidade e gestor veem a visão geral e os três módulos', () => {
  for (const papel of ['admin', 'sustentabilidade', 'gestor'] as const) {
    exigirVisaoGeral(ctx(papel))
    assert.deepEqual(modulosVisiveis(ctx(papel)), ['mobilidade', 'viagens', 'maritimo'])
  }
})

test('colaborador não entra em nada do inventário', () => {
  assert.throws(() => exigirInventario(ctx('colaborador')), AcessoNegadoError)
  assert.throws(() => exigirVisaoGeral(ctx('colaborador')), AcessoNegadoError)
  assert.throws(() => exigirModulo(ctx('colaborador'), 'maritimo'), AcessoNegadoError)
  assert.deepEqual(modulosVisiveis(ctx('colaborador')), [])
  // Mas entra no programa de viagens, que é a única porta dele.
  exigirProgramaDeViagens(ctx('colaborador'))
})

test('só importacao é recortado por empresa', () => {
  assert.equal(limiteDeEmpresa(ctx('importacao', 'empresa-ficticia')), 'empresa-ficticia')
  assert.equal(limiteDeEmpresa(ctx('admin', 'empresa-ficticia')), null)
  assert.equal(limiteDeEmpresa(ctx('importacao')), null)
})

test('gestor não vê quem registrou, nem no programa', () => {
  assert.equal(podeVerQuemRegistrou(ctx('gestor')), false)
  assert.equal(podeVerQuemRegistrou(ctx('admin')), true)
  assert.equal(podeVerQuemRegistrou(ctx('sustentabilidade')), true)
})

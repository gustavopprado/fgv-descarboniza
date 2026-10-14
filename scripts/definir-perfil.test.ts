/**
 * Testes da concessão de acesso — CLAUDE.md §5 e §11.11.
 *
 * Este script é o único caminho para dar e tirar acesso. As recusas dele são
 * regra, não conveniência: perfil concedido a uma conta que o login recusaria
 * seria um perfil órfão, e empresa fora do perfil `importacao` seria um recorte
 * que nenhuma consulta aplica.
 *
 * **Toda a massa aqui é fictícia, inventada do zero** (§2.2).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { interpretarComando } from './definir-perfil'

const DOMINIO = 'exemplo.invalid'
const PESSOA = `pessoa.ficticia@${DOMINIO}`

test('concede papel', () => {
  assert.deepEqual(interpretarComando([PESSOA, 'gestor'], DOMINIO), {
    acao: 'conceder',
    email: PESSOA,
    papel: 'gestor',
    empresa: null,
  })
})

test('empresa só existe no perfil de importação', () => {
  assert.deepEqual(
    interpretarComando([PESSOA, 'importacao', 'Empresa Fictícia'], DOMINIO),
    {
      acao: 'conceder',
      email: PESSOA,
      papel: 'importacao',
      empresa: 'Empresa Fictícia',
    },
  )
  assert.throws(
    () => interpretarComando([PESSOA, 'gestor', 'Empresa Fictícia'], DOMINIO),
    /importacao/,
  )
})

test('remover é comando próprio, não um papel', () => {
  assert.deepEqual(interpretarComando([PESSOA, 'remover'], DOMINIO), {
    acao: 'remover',
    email: PESSOA,
  })
  assert.throws(() => interpretarComando([PESSOA, 'remover', 'algo'], DOMINIO))
})

test('fora do domínio só vale o papel de convidado', () => {
  const fora = 'pessoa.ficticia@outro.invalid'
  assert.throws(() => interpretarComando([fora, 'admin'], DOMINIO), /domínio corporativo/)
  assert.throws(() => interpretarComando([fora, 'gestor'], DOMINIO), /domínio corporativo/)
  assert.throws(() => interpretarComando([fora, 'usuario'], DOMINIO), /domínio corporativo/)
  assert.deepEqual(interpretarComando([fora, 'externo'], DOMINIO), {
    acao: 'conceder',
    email: fora,
    papel: 'externo',
    empresa: null,
  })
  assert.deepEqual(interpretarComando([fora, 'remover'], DOMINIO), {
    acao: 'remover',
    email: fora,
  })
})

test('convidado não é papel de quem é do domínio', () => {
  assert.throws(() => interpretarComando([PESSOA, 'externo'], DOMINIO), /colaborador/)
})

test('papel desconhecido não vira padrão silencioso', () => {
  assert.throws(() => interpretarComando([PESSOA, 'diretor'], DOMINIO), /desconhecido/)
  assert.throws(() => interpretarComando([PESSOA], DOMINIO), /Uso:/)
})

test('o e-mail é normalizado para minúsculas', () => {
  const comando = interpretarComando([PESSOA.toUpperCase(), 'admin'], DOMINIO)
  assert.equal(comando.email, PESSOA)
})

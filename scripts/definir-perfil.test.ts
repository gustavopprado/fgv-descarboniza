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

test('conta fora do domínio corporativo é recusada', () => {
  assert.throws(
    () => interpretarComando(['pessoa.ficticia@outro.invalid', 'admin'], DOMINIO),
    /domínio corporativo/,
  )
})

test('papel desconhecido não vira padrão silencioso', () => {
  assert.throws(() => interpretarComando([PESSOA, 'diretor'], DOMINIO), /desconhecido/)
  assert.throws(() => interpretarComando([PESSOA], DOMINIO), /Uso:/)
})

test('o e-mail é normalizado para minúsculas', () => {
  const comando = interpretarComando([PESSOA.toUpperCase(), 'admin'], DOMINIO)
  assert.equal(comando.email, PESSOA)
})

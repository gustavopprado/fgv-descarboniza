/**
 * Testes da navegação — CLAUDE.md §5 e §10.
 *
 * O menu não é controle de acesso; ele é a promessa. Prometer a `importacao`
 * uma visão geral que a consulta vai recusar é oferecer porta fechada — e
 * mandar alguém para uma tela que vai recusá-lo transforma autorização correta
 * em erro aparente.
 *
 * **Toda a massa aqui é fictícia, inventada do zero** (§2.2).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { Papel } from '../documentos/tipos'
import type { ContextoDeAcesso } from './acesso'
import { navegacaoPara, telaInicial } from './navegacao'

function ctx(papel: Papel): ContextoDeAcesso {
  return {
    uid: 'uid-ficticio',
    email: 'pessoa.ficticia@exemplo.invalid',
    papel,
    empresa: null,
    funcionarioId: null,
  }
}

test('importacao não recebe a visão geral no menu', () => {
  const hrefs = navegacaoPara(ctx('importacao')).map((i) => i.href)
  assert.equal(hrefs.includes('/'), false)
  assert.equal(hrefs.includes('/maritimo'), true)
  assert.equal(hrefs.includes('/mobilidade'), false)
  assert.equal(hrefs.includes('/viagens'), false)
})

test('admin recebe as cinco telas do inventário', () => {
  const inventario = navegacaoPara(ctx('admin')).filter((i) => i.secao === 'inventario')
  assert.deepEqual(
    inventario.map((i) => i.href),
    ['/', '/mobilidade', '/viagens', '/maritimo', '/metodo'],
  )
})

test('colaborador só recebe o programa de viagens', () => {
  const itens = navegacaoPara(ctx('colaborador'))
  assert.equal(
    itens.every((i) => i.secao === 'programa'),
    true,
  )
})

test('tela que ainda não existe aparece marcada como não construída', () => {
  const itens = navegacaoPara(ctx('admin'))
  const metodo = itens.find((i) => i.href === '/metodo')
  const visaoGeral = itens.find((i) => i.href === '/')
  assert.equal(metodo?.construida, true)
  assert.equal(visaoGeral?.construida, false)
})

test('a tela inicial é sempre uma que o perfil pode abrir', () => {
  for (const papel of ['admin', 'sustentabilidade', 'gestor', 'importacao'] as const) {
    const destino = telaInicial(ctx(papel))
    const item = navegacaoPara(ctx(papel)).find((i) => i.href === destino)
    assert.notEqual(item, undefined, `${papel} foi mandado para fora do próprio menu`)
  }
  // E nunca para a visão geral de quem não pode vê-la.
  assert.notEqual(telaInicial(ctx('importacao')), '/')
})

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
import { existsSync } from 'node:fs'
import { test } from 'node:test'

import type { Papel } from '../documentos/tipos'
import type { ContextoDeAcesso } from './acesso'
import { navegacaoPara, telaInicial } from './navegacao'

const PAPEIS: Papel[] = [
  'admin',
  'sustentabilidade',
  'gestor',
  'importacao',
  'colaborador',
]

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
  // Distribuição às filiais é frete de saída, não importação (§5).
  assert.equal(hrefs.includes('/transportadoras'), false)
})

test('admin recebe as cinco telas do inventário, na ordem da §11', () => {
  const inventario = navegacaoPara(ctx('admin')).filter((i) => i.secao === 'inventario')
  assert.deepEqual(
    inventario.map((i) => i.href),
    ['/', '/mobilidade', '/viagens', '/maritimo', '/transportadoras'],
  )
})

test('colaborador só recebe o programa de viagens', () => {
  const itens = navegacaoPara(ctx('colaborador'))
  assert.equal(
    itens.every((i) => i.secao === 'programa'),
    true,
  )
})

/**
 * **A promessa do menu virou fato conferido.**
 *
 * Enquanto havia tela por construir, este teste prendia a Visão geral como não
 * construída — o que descreveu a verdade até ela existir e passaria a mentir
 * depois. Com as sete no ar, o que resta a prender é mais forte e não envelhece:
 * **todo item que o menu oferece tem arquivo de tela**, e nenhum aparece
 * apagado. Menu que mostra porta fechada ensina que existe porta; menu que
 * oferece porta inexistente é pior.
 */
test('toda tela oferecida no menu existe em arquivo', () => {
  const arquivoDa = (href: string) =>
    href === '/' ? 'src/app/page.tsx' : `src/app${href}/page.tsx`

  for (const papel of PAPEIS) {
    for (const item of navegacaoPara(ctx(papel))) {
      assert.equal(
        item.construida,
        true,
        `${papel} recebe "${item.href}" apagado, e as sete telas já existem`,
      )
      assert.equal(
        existsSync(arquivoDa(item.href)),
        true,
        `o menu oferece "${item.href}" e não há ${arquivoDa(item.href)}`,
      )
    }
  }
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

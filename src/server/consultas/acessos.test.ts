/**
 * Testes da liberação de convidado externo — ver POS-DEPLOY.md.
 *
 * O que estes testes prendem é o que a tela não pode afrouxar: só `admin` e
 * `gestor` decidem, a tela só concede `externo`, nunca sobrescreve outro papel,
 * conta do domínio não passa por convite, e quem foi recusado não volta sozinho
 * para a fila.
 *
 * **Toda a massa aqui é fictícia, inventada do zero** (§2.2).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { Firestore } from 'firebase-admin/firestore'

import type { DocSolicitacaoAcesso, DocUsuarioPerfil, Papel } from '../documentos/tipos'
import { AcessoNegadoError, type ContextoDeAcesso } from './acesso'
import {
  DecisaoDeAcessoInvalidaError,
  aprovarAcesso,
  consultarAcessos,
  recusarAcesso,
  registrarSolicitacaoDeAcesso,
  revogarAcesso,
} from './acessos'

const DOMINIO = 'empresa-ficticia.invalid'
process.env.GOOGLE_WORKSPACE_DOMINIO = DOMINIO

const CONVIDADO = 'convidado.ficticio@outro.invalid'

/** Banco em memória com o pedaço da API que o módulo usa. */
function bancoFalso() {
  const dados = new Map<string, Map<string, Record<string, unknown>>>()
  const colecao = (nome: string) => {
    if (!dados.has(nome)) dados.set(nome, new Map())
    return dados.get(nome)!
  }
  type Ref = { colecao: string; id: string }
  const instantaneo = (ref: Ref) => {
    const doc = colecao(ref.colecao).get(ref.id)
    return { id: ref.id, exists: doc !== undefined, data: () => (doc ? { ...doc } : undefined) }
  }
  const lista = (nome: string, filtro?: [string, unknown]) => ({
    docs: [...colecao(nome).entries()]
      .filter(([, d]) => filtro === undefined || d[filtro[0]] === filtro[1])
      .map(([id, d]) => ({ id, data: () => ({ ...d }) })),
  })

  const db = {
    collection: (nome: string) => ({
      doc: (id: string): Ref => ({ colecao: nome, id }),
      get: async () => lista(nome),
      where: (campo: string, _op: string, valor: unknown) => ({
        get: async () => lista(nome, [campo, valor]),
      }),
    }),
    runTransaction: async <T>(corpo: (tx: unknown) => Promise<T>): Promise<T> =>
      corpo({
        get: async (ref: Ref) => instantaneo(ref),
        set: (ref: Ref, valor: Record<string, unknown>, opcoes?: { merge?: boolean }) => {
          const atual = colecao(ref.colecao).get(ref.id)
          colecao(ref.colecao).set(
            ref.id,
            opcoes?.merge && atual ? { ...atual, ...valor } : { ...valor },
          )
        },
        update: (ref: Ref, valor: Record<string, unknown>) => {
          colecao(ref.colecao).set(ref.id, { ...colecao(ref.colecao).get(ref.id), ...valor })
        },
        delete: (ref: Ref) => {
          colecao(ref.colecao).delete(ref.id)
        },
      }),
  }
  return { db: db as unknown as Firestore, colecao }
}

function ctx(papel: Papel): ContextoDeAcesso {
  return {
    uid: 'uid-de-quem-decide',
    email: `quem.decide@${DOMINIO}`,
    papel,
    empresa: null,
    funcionarioId: null,
  }
}

const semRevogar = async () => undefined

test('primeira tentativa vira pedido pendente, sem perfil nenhum', async () => {
  const { db, colecao } = bancoFalso()
  assert.equal(await registrarSolicitacaoDeAcesso('uid-1', CONVIDADO, false, db), 'pendente')
  assert.equal(colecao('usuarioPerfil').size, 0)
  const pedido = colecao('solicitacaoAcesso').get('uid-1') as DocSolicitacaoAcesso
  assert.equal(pedido.status, 'pendente')
  // A conta de senha não confirma o e-mail, e a tela precisa saber disso.
  assert.equal(pedido.emailVerificado, false)
  const painel = await consultarAcessos(ctx('gestor'), db)
  assert.equal(painel.pendentes[0]?.emailVerificado, false)
})

test('liberar grava o perfil externo com quem liberou', async () => {
  const { db, colecao } = bancoFalso()
  await registrarSolicitacaoDeAcesso('uid-1', CONVIDADO, false, db)
  await aprovarAcesso(ctx('gestor'), 'uid-1', db)

  const perfil = colecao('usuarioPerfil').get('uid-1') as DocUsuarioPerfil
  assert.equal(perfil.papel, 'externo')
  assert.equal(perfil.aprovadoPor, `quem.decide@${DOMINIO}`)
  const pedido = colecao('solicitacaoAcesso').get('uid-1') as DocSolicitacaoAcesso
  assert.equal(pedido.status, 'aprovada')
})

test('só admin e gestor decidem — usuario e externo são recusados antes de ler', async () => {
  const { db } = bancoFalso()
  await registrarSolicitacaoDeAcesso('uid-1', CONVIDADO, false, db)
  for (const papel of ['usuario', 'externo', 'sustentabilidade', 'colaborador'] as Papel[]) {
    await assert.rejects(aprovarAcesso(ctx(papel), 'uid-1', db), AcessoNegadoError)
    await assert.rejects(consultarAcessos(ctx(papel), db), AcessoNegadoError)
  }
  await aprovarAcesso(ctx('admin'), 'uid-1', db)
})

test('a tela nunca sobrescreve um perfil que não seja externo', async () => {
  const { db, colecao } = bancoFalso()
  await registrarSolicitacaoDeAcesso('uid-1', CONVIDADO, false, db)
  colecao('usuarioPerfil').set('uid-1', { email: CONVIDADO, papel: 'admin' })

  await assert.rejects(
    aprovarAcesso(ctx('gestor'), 'uid-1', db),
    (e: unknown) => e instanceof DecisaoDeAcessoInvalidaError && e.codigo === 'outro-perfil',
  )
  assert.equal((colecao('usuarioPerfil').get('uid-1') as DocUsuarioPerfil).papel, 'admin')
})

test('conta do domínio não passa por convite', async () => {
  const { db, colecao } = bancoFalso()
  await registrarSolicitacaoDeAcesso('uid-1', `alguem@${DOMINIO}`, false, db)
  await assert.rejects(
    aprovarAcesso(ctx('gestor'), 'uid-1', db),
    (e: unknown) => e instanceof DecisaoDeAcessoInvalidaError && e.codigo === 'dominio',
  )
  assert.equal(colecao('usuarioPerfil').size, 0)
})

test('recusado não volta sozinho para a fila, mas pode ser liberado depois', async () => {
  const { db, colecao } = bancoFalso()
  await registrarSolicitacaoDeAcesso('uid-1', CONVIDADO, false, db)
  await recusarAcesso(ctx('gestor'), 'uid-1', db)

  assert.equal(await registrarSolicitacaoDeAcesso('uid-1', CONVIDADO, false, db), 'recusada')
  const painel = await consultarAcessos(ctx('admin'), db)
  assert.equal(painel.pendentes.length, 0)
  assert.equal(painel.encerrados.length, 1)

  await aprovarAcesso(ctx('admin'), 'uid-1', db)
  assert.equal((colecao('usuarioPerfil').get('uid-1') as DocUsuarioPerfil).papel, 'externo')
})

test('revogar apaga o perfil, registra a decisão e derruba a sessão', async () => {
  const { db, colecao } = bancoFalso()
  await registrarSolicitacaoDeAcesso('uid-1', CONVIDADO, false, db)
  await aprovarAcesso(ctx('gestor'), 'uid-1', db)

  const revogados: string[] = []
  await revogarAcesso(ctx('gestor'), 'uid-1', db, async (uid) => {
    revogados.push(uid)
  })

  assert.equal(colecao('usuarioPerfil').has('uid-1'), false)
  assert.equal((colecao('solicitacaoAcesso').get('uid-1') as DocSolicitacaoAcesso).status, 'revogada')
  assert.deepEqual(revogados, ['uid-1'])
})

test('revogar não alcança quem não é convidado', async () => {
  const { db, colecao } = bancoFalso()
  colecao('usuarioPerfil').set('uid-adm', { email: `adm@${DOMINIO}`, papel: 'admin' })
  await assert.rejects(
    revogarAcesso(ctx('gestor'), 'uid-adm', db, semRevogar),
    (e: unknown) => e instanceof DecisaoDeAcessoInvalidaError && e.codigo === 'nao-externo',
  )
  assert.equal(colecao('usuarioPerfil').has('uid-adm'), true)
})

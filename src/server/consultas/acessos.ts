/**
 * Acesso de convidado externo — ver POS-DEPLOY.md.
 *
 * Quem é de fora do domínio corporativo entra pelo link no e-mail. O primeiro
 * login com e-mail verificado e sem perfil **não concede nada**: vira um pedido
 * em `solicitacaoAcesso/{uid}`, e quem decide é `admin` ou `gestor`, na tela de
 * acessos.
 *
 * Três regras que este módulo segura, e que a tela não pode afrouxar:
 *
 *  - **a tela só concede `externo`.** `admin`, `gestor` e os demais papéis
 *    continuam sendo dados por script, fora da aplicação;
 *  - **a tela nunca sobrescreve um perfil que não seja `externo`.** Aprovar um
 *    pedido não pode rebaixar nem promover quem já tem outro papel;
 *  - **revogar revoga no servidor.** Apagar o perfil já fecharia a porta na
 *    requisição seguinte; revogar o token derruba junto a sessão que estiver
 *    aberta.
 */
import type { Firestore } from 'firebase-admin/firestore'

import { dominioWorkspace } from '@/lib/env'
import type {
  DocSolicitacaoAcesso,
  DocUsuarioPerfil,
  StatusDaSolicitacao,
} from '../documentos/tipos'
import { COLECAO, authAdmin, firestore } from '../firestore'
import { exigirLiberarAcessos, type ContextoDeAcesso } from './acesso'

/**
 * Por que uma decisão não pôde ser aplicada.
 *
 * As frases não citam o e-mail de propósito: o código viaja no endereço da tela
 * depois do redirecionamento, e dado de pessoa não vai em URL.
 */
export const MOTIVO_DA_RECUSA = {
  'nao-encontrado': 'Pedido de acesso não encontrado.',
  'ja-liberado': 'Este convidado já está liberado.',
  dominio: 'Conta do domínio corporativo não passa por liberação: ela já entra como usuário.',
  'outro-perfil': 'Esta conta já tem outro perfil, que esta tela não altera.',
  'nao-pendente': 'Só pedido pendente pode ser recusado.',
  'nao-externo': 'Esta tela só revoga convidado externo.',
} as const

export type CodigoDaRecusa = keyof typeof MOTIVO_DA_RECUSA

export class DecisaoDeAcessoInvalidaError extends Error {
  constructor(readonly codigo: CodigoDaRecusa) {
    super(MOTIVO_DA_RECUSA[codigo])
    this.name = 'DecisaoDeAcessoInvalidaError'
  }
}

export function ehDoDominio(email: string, dominio: string = dominioWorkspace()): boolean {
  return email.slice(email.lastIndexOf('@') + 1).toLowerCase() === dominio.toLowerCase()
}

function agora(): string {
  return new Date().toISOString()
}

/**
 * Registra a tentativa de entrada de um e-mail externo sem perfil.
 *
 * Pedido novo nasce `pendente`. Pedido que já existe guarda a decisão que tem:
 * quem foi recusado ou revogado não volta sozinho para a fila tentando de novo,
 * senão recusar seria só adiar. Para reabrir, quem libera aprova pela tela.
 *
 * Devolve o status em que o pedido ficou, para a tela de entrada dizer o certo.
 */
export async function registrarSolicitacaoDeAcesso(
  uid: string,
  email: string,
  db: Firestore = firestore(),
): Promise<StatusDaSolicitacao> {
  const ref = db.collection(COLECAO.solicitacaoAcesso).doc(uid)
  return db.runTransaction(async (tx) => {
    const atual = await tx.get(ref)
    const instante = agora()
    if (atual.exists) {
      const doc = atual.data() as DocSolicitacaoAcesso
      tx.update(ref, { ultimaTentativaEm: instante })
      return doc.status
    }
    const novo: DocSolicitacaoAcesso = {
      email: email.toLowerCase(),
      status: 'pendente',
      pedidoEm: instante,
      ultimaTentativaEm: instante,
      decididoPor: null,
      decididoEm: null,
    }
    tx.set(ref, novo)
    return 'pendente'
  })
}

export type PedidoDeAcesso = {
  uid: string
  email: string
  status: StatusDaSolicitacao
  pedidoEm: string
  ultimaTentativaEm: string
  decididoPor: string | null
  decididoEm: string | null
}

export type ConvidadoAtivo = {
  uid: string
  email: string
  aprovadoPor: string | null
  aprovadoEm: string | null
}

export type PainelDeAcessos = {
  pendentes: PedidoDeAcesso[]
  ativos: ConvidadoAtivo[]
  /** Recusados e revogados, mais recentes primeiro. Podem ser liberados de novo. */
  encerrados: PedidoDeAcesso[]
}

export async function consultarAcessos(
  ctx: ContextoDeAcesso,
  db: Firestore = firestore(),
): Promise<PainelDeAcessos> {
  exigirLiberarAcessos(ctx)

  const [pedidos, externos] = await Promise.all([
    db.collection(COLECAO.solicitacaoAcesso).get(),
    db.collection(COLECAO.usuarioPerfil).where('papel', '==', 'externo').get(),
  ])

  const todos: PedidoDeAcesso[] = pedidos.docs.map((d) => {
    const doc = d.data() as DocSolicitacaoAcesso
    return {
      uid: d.id,
      email: doc.email,
      status: doc.status,
      // Convidado liberado por script e depois revogado tem registro sem pedido.
      pedidoEm: doc.pedidoEm ?? '',
      ultimaTentativaEm: doc.ultimaTentativaEm ?? '',
      decididoPor: doc.decididoPor,
      decididoEm: doc.decididoEm,
    }
  })

  const ativos: ConvidadoAtivo[] = externos.docs
    .map((d) => {
      const doc = d.data() as DocUsuarioPerfil
      return {
        uid: d.id,
        email: doc.email,
        aprovadoPor: doc.aprovadoPor ?? null,
        aprovadoEm: doc.aprovadoEm ?? null,
      }
    })
    .sort((a, b) => a.email.localeCompare(b.email))

  return {
    pendentes: todos
      .filter((p) => p.status === 'pendente')
      .sort((a, b) => a.pedidoEm.localeCompare(b.pedidoEm)),
    ativos,
    encerrados: todos
      .filter((p) => p.status === 'recusada' || p.status === 'revogada')
      .sort((a, b) => (b.decididoEm ?? '').localeCompare(a.decididoEm ?? '')),
  }
}

/**
 * Libera o pedido: grava o perfil `externo` com quem liberou e quando.
 *
 * Vale para pedido pendente e também para recusado ou revogado — é o caminho
 * de devolver o acesso a quem já passou pela fila.
 */
export async function aprovarAcesso(
  ctx: ContextoDeAcesso,
  uid: string,
  db: Firestore = firestore(),
): Promise<void> {
  exigirLiberarAcessos(ctx)

  const refPedido = db.collection(COLECAO.solicitacaoAcesso).doc(uid)
  const refPerfil = db.collection(COLECAO.usuarioPerfil).doc(uid)

  await db.runTransaction(async (tx) => {
    const [pedido, perfil] = await Promise.all([tx.get(refPedido), tx.get(refPerfil)])
    if (!pedido.exists) throw new DecisaoDeAcessoInvalidaError('nao-encontrado')
    const doc = pedido.data() as DocSolicitacaoAcesso
    if (doc.status === 'aprovada') throw new DecisaoDeAcessoInvalidaError('ja-liberado')
    // Conta do domínio não precisa de convite: ela já recebe o padrão. Um
    // perfil `externo` gravado nela a rebaixaria sem ninguém ter decidido isso.
    if (ehDoDominio(doc.email)) throw new DecisaoDeAcessoInvalidaError('dominio')
    if (perfil.exists && (perfil.data() as DocUsuarioPerfil).papel !== 'externo') {
      throw new DecisaoDeAcessoInvalidaError('outro-perfil')
    }

    const instante = agora()
    const novoPerfil: DocUsuarioPerfil = {
      email: doc.email,
      papel: 'externo',
      empresa: null,
      funcionarioId: null,
      aprovadoPor: ctx.email,
      aprovadoEm: instante,
    }
    tx.set(refPerfil, novoPerfil)
    tx.update(refPedido, {
      status: 'aprovada',
      decididoPor: ctx.email,
      decididoEm: instante,
    })
  })
}

export async function recusarAcesso(
  ctx: ContextoDeAcesso,
  uid: string,
  db: Firestore = firestore(),
): Promise<void> {
  exigirLiberarAcessos(ctx)

  const ref = db.collection(COLECAO.solicitacaoAcesso).doc(uid)
  await db.runTransaction(async (tx) => {
    const pedido = await tx.get(ref)
    if (!pedido.exists) throw new DecisaoDeAcessoInvalidaError('nao-encontrado')
    if ((pedido.data() as DocSolicitacaoAcesso).status !== 'pendente') {
      throw new DecisaoDeAcessoInvalidaError('nao-pendente')
    }
    tx.update(ref, { status: 'recusada', decididoPor: ctx.email, decididoEm: agora() })
  })
}

/**
 * Tira o acesso de um convidado: apaga o perfil e revoga a sessão.
 *
 * Só alcança perfil `externo`. Fora do domínio não há padrão a que voltar
 * (POS-DEPLOY.md), então apagar o perfil fecha a porta de verdade.
 */
export async function revogarAcesso(
  ctx: ContextoDeAcesso,
  uid: string,
  db: Firestore = firestore(),
  revogarTokens: (uid: string) => Promise<void> = (u) => authAdmin().revokeRefreshTokens(u),
): Promise<void> {
  exigirLiberarAcessos(ctx)

  const refPerfil = db.collection(COLECAO.usuarioPerfil).doc(uid)
  const refPedido = db.collection(COLECAO.solicitacaoAcesso).doc(uid)

  await db.runTransaction(async (tx) => {
    const perfil = await tx.get(refPerfil)
    if (!perfil.exists || (perfil.data() as DocUsuarioPerfil).papel !== 'externo') {
      throw new DecisaoDeAcessoInvalidaError('nao-externo')
    }
    const { email } = perfil.data() as DocUsuarioPerfil
    const instante = agora()
    tx.delete(refPerfil)
    // `set` com merge, e não `update`: o convidado pode ter sido liberado por
    // script, sem pedido. A revogação precisa ficar registrada mesmo assim.
    tx.set(
      refPedido,
      {
        email,
        status: 'revogada',
        decididoPor: ctx.email,
        decididoEm: instante,
      },
      { merge: true },
    )
  })

  await revogarTokens(uid)
}

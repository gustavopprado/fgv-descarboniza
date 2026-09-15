/**
 * Sessão — CLAUDE.md §11.2, §11.3 e §11.4.
 *
 * Login por Firebase Auth com provedor Google, restrito ao domínio corporativo.
 * O navegador troca o ID token por um **cookie de sessão httpOnly** emitido aqui;
 * daí em diante o cliente não carrega credencial nenhuma e não fala com o
 * Firestore — quem lê é o Admin SDK, no servidor.
 *
 * O papel **nunca vem do cliente**: ele é lido de `usuarioPerfil/{uid}` a cada
 * requisição. Token não carrega papel de propósito — token velho continuaria
 * valendo depois de o acesso ter sido revogado.
 *
 * Conta autenticada sem documento de perfil **não recebe papel nenhum**. Não há
 * padrão, não há "colaborador por enquanto": quem entra sem perfil vê uma tela
 * dizendo que precisa ser liberado. Perfil implícito é privilégio concedido por
 * descuido.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { dominioWorkspace } from '@/lib/env'
import type { ContextoDeAcesso } from './consultas/acesso'
import type { DocUsuarioPerfil } from './documentos/tipos'
import { COLECAO, authAdmin, firestore } from './firestore'

export const COOKIE_SESSAO = 'fgv_sessao'

/** Cinco dias. O Firebase aceita até duas semanas; menos é melhor. */
export const DURACAO_SESSAO_MS = 5 * 24 * 60 * 60 * 1000

export class LoginRecusadoError extends Error {
  constructor(motivo: string) {
    super(motivo)
    this.name = 'LoginRecusadoError'
  }
}

export class PerfilAusenteError extends Error {
  constructor(readonly email: string) {
    super(`A conta ${email} entrou, mas não tem perfil de acesso cadastrado.`)
    this.name = 'PerfilAusenteError'
  }
}

function dominioDe(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).toLowerCase()
}

/**
 * Verifica o ID token recém-emitido e devolve o cookie de sessão.
 *
 * Três recusas, todas antes de qualquer cookie existir: provedor diferente de
 * Google, e-mail não verificado e domínio fora do Workspace corporativo.
 */
export async function criarCookieDeSessao(idToken: string): Promise<string> {
  const auth = authAdmin()
  const token = await auth.verifyIdToken(idToken, true)

  if (token.firebase?.sign_in_provider !== 'google.com') {
    throw new LoginRecusadoError('Entre com a conta Google corporativa.')
  }
  if (token.email === undefined || token.email_verified !== true) {
    throw new LoginRecusadoError('A conta precisa ter e-mail verificado.')
  }

  const permitido = dominioWorkspace().toLowerCase()
  if (dominioDe(token.email) !== permitido) {
    throw new LoginRecusadoError(
      `Este sistema é restrito às contas @${permitido}.`,
    )
  }

  return auth.createSessionCookie(idToken, { expiresIn: DURACAO_SESSAO_MS })
}

/**
 * O contexto de acesso desta requisição, ou `null` se não há sessão válida.
 *
 * `verifySessionCookie` com `checkRevoked` conversa com o Firebase a cada
 * requisição. É uma chamada a mais e é proposital: sem ela, revogar acesso não
 * teria efeito até o cookie expirar sozinho.
 */
export async function sessaoAtual(): Promise<ContextoDeAcesso | null> {
  const cookie = (await cookies()).get(COOKIE_SESSAO)?.value
  if (cookie === undefined || cookie === '') return null

  let uid: string
  let email: string
  try {
    const sessao = await authAdmin().verifySessionCookie(cookie, true)
    uid = sessao.uid
    email = sessao.email ?? ''
  } catch {
    // Cookie expirado, revogado ou adulterado: não há sessão. A tela manda
    // entrar de novo; não há informação a dar sobre qual dos três foi.
    return null
  }

  const perfil = await firestore().collection(COLECAO.usuarioPerfil).doc(uid).get()
  if (!perfil.exists) throw new PerfilAusenteError(email)

  const dados = perfil.data() as DocUsuarioPerfil
  return {
    uid,
    email: dados.email ?? email,
    papel: dados.papel,
    empresa: dados.empresa ?? null,
  }
}

/**
 * O contexto desta requisição, ou a tela de entrada.
 *
 * Toda tela do sistema começa por aqui. A autorização de verdade vem depois,
 * dentro de cada consulta (§11.3) — isto só garante que existe alguém.
 */
export async function exigirSessao(): Promise<ContextoDeAcesso> {
  const ctx = await sessaoAtual()
  if (ctx === null) redirect('/entrar')
  return ctx
}

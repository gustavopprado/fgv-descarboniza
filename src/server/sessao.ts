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

/**
 * Doze horas — CLAUDE.md §11.10.
 *
 * O Firebase aceita de cinco minutos a quatorze dias. Quatorze dias seria
 * conveniente e caro: este sistema mostra dado de pessoa, e a sessão de um
 * notebook esquecido aberto continuaria válida por duas semanas.
 *
 * Doze horas cobrem um dia de trabalho inteiro, de quem começa cedo a quem
 * termina tarde, e expiram antes da manhã seguinte. O custo de renovar é um
 * clique no Google, com a conta já escolhida.
 */
export const DURACAO_SESSAO_MS = 12 * 60 * 60 * 1000

/** Limites que o Firebase impõe a `createSessionCookie`. */
export const DURACAO_MINIMA_MS = 5 * 60 * 1000
export const DURACAO_MAXIMA_MS = 14 * 24 * 60 * 60 * 1000

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
    funcionarioId: dados.funcionarioId ?? null,
  }
}

/**
 * Encerra a sessão **no Firebase**, não só no navegador.
 *
 * Apagar o cookie do navegador não invalida nada: quem tiver copiado o valor
 * continua entrando com ele até expirar. `revokeRefreshTokens` move o marco de
 * validade da conta para agora, e o `verifySessionCookie` com `checkRevoked`
 * da próxima requisição recusa qualquer cookie emitido antes disso.
 *
 * O efeito alcança **todas as sessões daquela pessoa, em todos os dispositivos**.
 * Para este sistema isso é o comportamento desejado: sair é sair.
 *
 * Devolve o uid encerrado, ou `null` se não havia sessão que ainda valesse —
 * nesse caso não há nada a revogar, e o cookie é apagado do mesmo jeito.
 */
export async function encerrarSessao(cookie: string | undefined): Promise<string | null> {
  if (cookie === undefined || cookie === '') return null

  try {
    const auth = authAdmin()
    const sessao = await auth.verifySessionCookie(cookie, false)
    await auth.revokeRefreshTokens(sessao.uid)
    return sessao.uid
  } catch {
    // Cookie já inválido: não há sessão a revogar. Sair nunca falha.
    return null
  }
}

/**
 * O contexto desta requisição, ou a tela de entrada.
 *
 * Toda tela do sistema começa por aqui. A autorização de verdade vem depois,
 * dentro de cada consulta (§11.3) — isto só garante que existe alguém.
 */
export async function exigirSessao(): Promise<ContextoDeAcesso> {
  let ctx: ContextoDeAcesso | null
  try {
    ctx = await sessaoAtual()
  } catch (erro) {
    // Perfil apagado com a sessão aberta: a pessoa vai para a tela de entrada,
    // que explica o que houve. Fechar a porta na cara com erro de servidor
    // esconderia o motivo de quem precisa pedir a liberação.
    if (erro instanceof PerfilAusenteError) redirect('/entrar')
    throw erro
  }
  if (ctx === null) redirect('/entrar')
  return ctx
}

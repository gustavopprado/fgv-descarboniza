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
 * **Conta do domínio corporativo sem documento de perfil recebe o papel padrão**
 * (§5.2), que é `gestor`. Quem tem documento usa o que está nele — o documento
 * manda, para cima e para baixo.
 *
 * A versão anterior desta regra não dava papel nenhum, e o motivo escrito era
 * que perfil implícito é privilégio concedido por descuido. O argumento vale, e
 * é por isso que o padrão é `gestor` e não `admin`: o que se concede aqui é
 * **ver**, e o que fica de fora é a única coisa deste sistema que é dado
 * pessoal — quem registrou cada viagem do programa (§3.2). Conceder por
 * descuido o direito de ler o inventário é outra ordem de problema, e foi
 * decidido que ele não é problema: o inventário não tem pessoa dentro (§3.1).
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { dominioWorkspace } from '@/lib/env'
import type { ContextoDeAcesso } from './consultas/acesso'
import type { DocUsuarioPerfil, Papel } from './documentos/tipos'
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
 * **Papel de quem é do domínio corporativo e não tem perfil cadastrado** (§5.2).
 *
 * `gestor` vê as sete telas, todos os números e registra a própria viagem. O que
 * ele **não** vê é quem registrou cada viagem do programa (§3.2) — a única coisa
 * deste sistema que identifica pessoa. É por isso que o padrão é este e não
 * `admin` ou `sustentabilidade`: o pedido foi que todos vejam tudo, e "tudo"
 * aqui é o inventário inteiro, que não tem pessoa dentro (§3.1).
 *
 * **É constante, e não variável de ambiente, de propósito.** Um valor de exemplo
 * plausível num `.env` viraria papel concedido sem ninguém decidir — é a mesma
 * família do placeholder plausível que o `.env.example` vigia, com a diferença
 * de que aqui o que vaza é acesso e não número. Mudar o padrão passa por editar
 * esta linha, que aparece em revisão.
 */
export const PAPEL_PADRAO_DO_DOMINIO: Papel = 'gestor'

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
  if (!perfil.exists) {
    // Fora do domínio não há padrão que valha: a conta não é da empresa. Isto
    // não deveria acontecer, porque o domínio é conferido antes de o cookie ser
    // emitido — mas o cookie dura doze horas, e uma política pode mudar dentro
    // delas. Conferir aqui custa uma comparação de string.
    if (dominioDe(email) !== dominioWorkspace().toLowerCase()) {
      throw new PerfilAusenteError(email)
    }
    return {
      uid,
      email,
      papel: PAPEL_PADRAO_DO_DOMINIO,
      // Sem documento não há empresa nem vínculo com o cadastro. `empresa` só
      // recorta o perfil `importacao`, que nunca é o padrão; `funcionarioId`
      // nulo é o mesmo estado de quem ainda não foi vinculado.
      empresa: null,
      funcionarioId: null,
    }
  }

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

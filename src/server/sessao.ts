/**
 * Sessão — CLAUDE.md §11.2, §11.3 e §11.4.
 *
 * Login por Firebase Auth: Google para quem é do domínio corporativo, e e-mail e
 * senha para convidado externo — que só entra depois de liberado por `admin` ou
 * `gestor` na tela de acessos (POS-DEPLOY.md).
 * O navegador troca o ID token por um **cookie de sessão httpOnly** emitido aqui;
 * daí em diante o cliente não carrega credencial nenhuma e não fala com o
 * Firestore — quem lê é o Admin SDK, no servidor.
 *
 * O papel **nunca vem do cliente**: ele é lido de `usuarioPerfil/{uid}` a cada
 * requisição. Token não carrega papel de propósito — token velho continuaria
 * valendo depois de o acesso ter sido revogado.
 *
 * **Conta do domínio corporativo sem documento de perfil recebe o papel padrão**
 * (§5.2), que é `usuario`. Quem tem documento usa o que está nele — o documento
 * manda, para cima e para baixo. Fora do domínio não há padrão: só o perfil
 * `externo`, gravado por quem libera.
 *
 * A versão anterior desta regra não dava papel nenhum, e o motivo escrito era
 * que perfil implícito é privilégio concedido por descuido. O argumento vale, e
 * é por isso que o padrão é `usuario` e não `admin`: o que se concede aqui é
 * **ver**, e o que fica de fora é a única coisa deste sistema que é dado
 * pessoal — quem registrou cada viagem do programa (§3.2). Conceder por
 * descuido o direito de ler o inventário é outra ordem de problema, e foi
 * decidido que ele não é problema: o inventário não tem pessoa dentro (§3.1).
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { dominioWorkspace } from '@/lib/env'
import type { ContextoDeAcesso } from './consultas/acesso'
import { registrarSolicitacaoDeAcesso } from './consultas/acessos'
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
 * **Papel de quem é do domínio corporativo e não tem perfil cadastrado** (§5.2,
 * POS-DEPLOY.md).
 *
 * `usuario` vê todas as telas, todos os números e registra a própria viagem. O
 * que ele **não** vê é quem registrou cada viagem do programa (§3.2) — a única
 * coisa deste sistema que identifica pessoa — e não libera acesso de ninguém.
 * Até a mudança pós-deploy este papel se chamava `gestor`; o nome passou a ser
 * de quem libera convidado externo.
 *
 * **É constante, e não variável de ambiente, de propósito.** Um valor de exemplo
 * plausível num `.env` viraria papel concedido sem ninguém decidir — é a mesma
 * família do placeholder plausível que o `.env.example` vigia, com a diferença
 * de que aqui o que vaza é acesso e não número. Mudar o padrão passa por editar
 * esta linha, que aparece em revisão.
 */
export const PAPEL_PADRAO_DO_DOMINIO: Papel = 'usuario'

/**
 * O único papel que uma conta de fora do domínio pode ter.
 *
 * A tela de acessos só concede este, e a sessão recusa qualquer outro fora do
 * domínio — mesmo que alguém o grave por engano no banco. Convidado de fora não
 * vira administrador por um erro de digitação no script.
 */
export const PAPEL_DE_FORA_DO_DOMINIO: Papel = 'externo'

const GOOGLE = 'google.com'
const SENHA = 'password'

/** Recusa que diz à pessoa que o pedido dela está na fila. */
export class AcessoEmAnaliseError extends LoginRecusadoError {
  constructor(motivo: string) {
    super(motivo)
    this.name = 'AcessoEmAnaliseError'
  }
}

/**
 * De onde vem quem está entrando — ou a recusa, antes de qualquer leitura.
 *
 * `dominio` segue para a sessão com o papel do perfil ou o padrão; `convidado`
 * só segue com perfil `externo`. Separada para ser testada sem Firebase: é aqui
 * que mora a regra de que e-mail da empresa com senha não entra.
 */
export function classificarEntrada(
  conta: { email: string | undefined; provedor: string | undefined; emailVerificado: boolean },
  dominio: string,
): 'dominio' | 'convidado' {
  if (conta.email === undefined || conta.email === '') {
    throw new LoginRecusadoError('A conta precisa ter e-mail.')
  }

  if (dominioDe(conta.email) === dominio.toLowerCase()) {
    if (conta.provedor !== GOOGLE || !conta.emailVerificado) {
      throw new LoginRecusadoError(
        'Conta da empresa entra pelo botão "Entrar com a conta corporativa".',
      )
    }
    return 'dominio'
  }

  if (conta.provedor !== GOOGLE && conta.provedor !== SENHA) {
    throw new LoginRecusadoError('Entre com e-mail e senha.')
  }
  if (conta.provedor === GOOGLE && !conta.emailVerificado) {
    throw new LoginRecusadoError('A conta precisa ter e-mail verificado.')
  }
  return 'convidado'
}

/**
 * Verifica o ID token recém-emitido e devolve o cookie de sessão.
 *
 * **Do domínio, só Google com e-mail verificado.** E-mail e senha não provam
 * dono de caixa postal: aceitar senha aqui deixaria qualquer um cadastrar o
 * e-mail de um colega e entrar como `usuario`, sem passar por aprovação.
 *
 * **De fora, Google ou e-mail e senha — e a aprovação é a verificação.** A conta
 * de senha não tem o e-mail confirmado (o link de confirmação caía no spam e foi
 * retirado, ver POS-DEPLOY.md), então o e-mail do pedido é só o que a pessoa
 * digitou. Por isso nada passa sem perfil `externo` gravado por quem libera, e
 * o pedido carrega se o e-mail foi confirmado, para a tela dizer.
 */
export async function criarCookieDeSessao(idToken: string): Promise<string> {
  const auth = authAdmin()
  const token = await auth.verifyIdToken(idToken, true)

  const origem = classificarEntrada(
    {
      email: token.email,
      provedor: token.firebase?.sign_in_provider,
      emailVerificado: token.email_verified === true,
    },
    dominioWorkspace(),
  )

  if (origem === 'convidado' && token.email !== undefined) {
    const perfil = await firestore()
      .collection(COLECAO.usuarioPerfil)
      .doc(token.uid)
      .get()
    const papel = perfil.exists ? (perfil.data() as DocUsuarioPerfil).papel : null
    if (papel !== PAPEL_DE_FORA_DO_DOMINIO) {
      const status = await registrarSolicitacaoDeAcesso(
        token.uid,
        token.email,
        token.email_verified === true,
      )
      throw new AcessoEmAnaliseError(
        status === 'pendente'
          ? 'Seu pedido de acesso foi registrado. Você poderá entrar assim que ele for aprovado.'
          : 'Seu acesso não está liberado. Fale com quem administra o sistema.',
      )
    }
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
    // Do domínio, só sessão aberta pelo Google vale. O login já recusa senha
    // com e-mail da empresa; conferir de novo aqui custa uma comparação.
    if (
      dominioDe(email) === dominioWorkspace().toLowerCase() &&
      sessao.firebase?.sign_in_provider !== GOOGLE
    ) {
      return null
    }
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
  // Fora do domínio só vale o papel de convidado. Qualquer outro ali é engano
  // de gravação, e engano de gravação não pode virar acesso administrativo.
  if (
    dominioDe(email) !== dominioWorkspace().toLowerCase() &&
    dados.papel !== PAPEL_DE_FORA_DO_DOMINIO
  ) {
    throw new PerfilAusenteError(email)
  }
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

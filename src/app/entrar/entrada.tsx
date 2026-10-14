'use client'

/**
 * Entrada — CLAUDE.md §11.4 e POS-DEPLOY.md.
 *
 * Dois caminhos: Google, para quem é do domínio corporativo, e link por e-mail,
 * para convidado externo de qualquer provedor de e-mail. O convidado só passa
 * depois de liberado na tela de acessos; antes disso o servidor registra o
 * pedido e recusa.
 *
 * O único componente de cliente que fala com o Firebase, e só para provar quem
 * é. O ID token é trocado por cookie de sessão no servidor e a sessão do SDK web
 * é encerrada em seguida: sem isso, o navegador guardaria um refresh token de
 * longa duração que não serve para nada aqui — o sistema inteiro roda no
 * cookie httpOnly.
 */
import {
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { authWeb, provedorGoogle } from '@/lib/firebase-cliente'

/**
 * As falhas que o próprio operador resolve, ditas pelo nome.
 *
 * **A mensagem genérica existe por um bom motivo e não vale para estas.** Do
 * lado do servidor, não distinguir token inválido de token expirado é
 * deliberado: quem está adivinhando não ganha pista. Estas três são outra
 * coisa — vêm do SDK no próprio navegador de quem clicou, já estão no console
 * dele, e nenhuma delas depende de quem é a pessoa. Esconder atrás de "tente
 * novamente" só garante que tentar de novo não vai funcionar.
 */
const FALHAS_CONHECIDAS: Record<string, string> = {
  'auth/unauthorized-domain':
    'Este endereço não está autorizado no provedor de autenticação. Quem administra o projeto precisa acrescentá-lo à lista de domínios autorizados — é o que costuma faltar ao abrir o sistema pelo IP da máquina, em vez de localhost.',
  'auth/popup-blocked':
    'O navegador bloqueou a janela de login. Libere o bloqueio de pop-up para este endereço e tente de novo.',
  'auth/operation-not-supported-in-this-environment':
    'Este navegador não permite a janela de login neste endereço. Acontece quando a página é aberta fora de http ou https.',
  'auth/operation-not-allowed':
    'O login por link no e-mail não está habilitado no provedor de autenticação. Quem administra o projeto precisa ativá-lo.',
  'auth/invalid-email': 'Esse endereço de e-mail não é válido.',
  'auth/invalid-action-code':
    'Este link já foi usado ou não é mais válido. Peça um link novo.',
  'auth/expired-action-code': 'Este link expirou. Peça um link novo.',
}

/**
 * Onde o e-mail fica guardado entre pedir o link e clicar nele.
 *
 * O Firebase exige o e-mail de novo ao abrir o link, para o link sozinho não
 * bastar a quem o interceptar. Guardar no navegador poupa digitar de novo quando
 * o link abre no mesmo navegador; em outro, a tela pede.
 */
const CHAVE_DO_EMAIL = 'fgv_email_para_link'

function lerEmailGuardado(): string | null {
  try {
    return window.localStorage.getItem(CHAVE_DO_EMAIL)
  } catch {
    return null
  }
}

function guardarEmail(email: string | null): void {
  try {
    if (email === null) window.localStorage.removeItem(CHAVE_DO_EMAIL)
    else window.localStorage.setItem(CHAVE_DO_EMAIL, email)
  } catch {
    // Sem armazenamento a tela pede o e-mail ao abrir o link. Nada se perde.
  }
}

function mensagemDeFalha(falha: unknown): string {
  const codigo = (falha as { code?: string })?.code
  if (codigo !== undefined && codigo in FALHAS_CONHECIDAS) return FALHAS_CONHECIDAS[codigo]
  return 'Não foi possível entrar. Tente novamente.' + (codigo === undefined ? '' : ` (${codigo})`)
}

/**
 * Troca o usuário recém-autenticado pelo cookie de sessão e encerra a sessão
 * do SDK web. Devolve a mensagem de recusa do servidor, ou `null` se entrou.
 */
async function trocarPorSessao(auth: Auth, usuario: User): Promise<string | null> {
  const idToken = await usuario.getIdToken()
  const resposta = await fetch('/api/sessao', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken }),
  })

  // A sessão que vale é o cookie. A do SDK web não tem mais uso.
  await signOut(auth)

  if (resposta.ok) return null
  const corpo = (await resposta.json().catch(() => ({}))) as { erro?: string }
  return corpo.erro ?? 'Não foi possível entrar.'
}

/** Abaixo disto, quem fechou a janela não foi gente. */
const FECHOU_SOZINHO_MS = 2000

export function Entrada({ destino }: { destino: string }) {
  const router = useRouter()
  const [entrando, setEntrando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function entrar() {
    setEntrando(true)
    setErro(null)

    // **`authWeb()` fica DENTRO do `try`, e isso não é arrumação.** Ele lança
    // quando falta configuração, e fora daqui a rejeição escapava da função
    // inteira: o React não espera o `onClick`, então o `finally` nunca rodava e
    // o botão ficava travado em "Entrando…" — sem mensagem na tela e sem nada no
    // console. Falha silenciosa num botão é o pior lugar para ela estar.
    let auth: Auth | null = null
    const comecou = Date.now()

    try {
      auth = authWeb()
      const credencial = await signInWithPopup(auth, provedorGoogle())
      const recusa = await trocarPorSessao(auth, credencial.user)
      if (recusa !== null) {
        setErro(recusa)
        return
      }

      router.replace(destino)
      router.refresh()
    } catch (falha) {
      // O bruto vai para o console mesmo quando a tela explica: é o que sobra
      // para quem estiver depurando de fora, e custa nada.
      console.error('[entrar] falha ao autenticar', falha)

      const codigo = (falha as { code?: string })?.code
      if (codigo === 'auth/popup-closed-by-user' || codigo === 'auth/cancelled-popup-request') {
        // **Fechar a janela é desistir, e desistir não é erro — mas um popup
        // recusado pela origem fecha sozinho e chega aqui pelo mesmo código.**
        // Calados, os dois casos ficam idênticos na tela: clicar e não acontecer
        // nada. O que os separa é o relógio: ninguém lê a lista de contas do
        // Google e desiste em menos de dois segundos.
        setErro(
          Date.now() - comecou < FECHOU_SOZINHO_MS
            ? 'A janela de login fechou sozinha, sem dar tempo de escolher a conta. Isso costuma ser o endereço de onde a página foi aberta não estar na lista de domínios autorizados do provedor.'
            : null,
        )
      } else {
        // O código vai junto: sem ele, a única pista fica no console, e quem
        // abre o sistema num celular não tem console para abrir.
        setErro(mensagemDeFalha(falha))
      }
      if (auth !== null) await signOut(auth).catch(() => undefined)
    } finally {
      setEntrando(false)
    }
  }

  // ---------------------------------------------------- link por e-mail

  const [email, setEmail] = useState('')
  const [linkEnviado, setLinkEnviado] = useState(false)
  /** Verdadeiro quando a página abriu pelo link e falta confirmar o e-mail. */
  const [confirmandoLink, setConfirmandoLink] = useState(false)

  async function concluirLink(enderecoInformado: string) {
    setEntrando(true)
    setErro(null)
    let auth: Auth | null = null
    try {
      auth = authWeb()
      const credencial = await signInWithEmailLink(
        auth,
        enderecoInformado.trim(),
        window.location.href,
      )
      guardarEmail(null)
      const recusa = await trocarPorSessao(auth, credencial.user)
      setConfirmandoLink(false)
      if (recusa !== null) {
        setErro(recusa)
        // Tira o código do link do endereço: ele já foi gasto.
        window.history.replaceState(null, '', window.location.pathname)
        return
      }
      router.replace(destino)
      router.refresh()
    } catch (falha) {
      console.error('[entrar] falha ao entrar pelo link', falha)
      setErro(mensagemDeFalha(falha))
      if (auth !== null) await signOut(auth).catch(() => undefined)
    } finally {
      setEntrando(false)
    }
  }

  // Ao abrir pelo link do e-mail, conclui sozinho quando o e-mail foi guardado
  // neste navegador; senão, pede o e-mail para conferir.
  useEffect(() => {
    let auth: Auth
    try {
      auth = authWeb()
    } catch {
      return
    }
    if (!isSignInWithEmailLink(auth, window.location.href)) return
    const guardado = lerEmailGuardado()
    if (guardado !== null) {
      void concluirLink(guardado)
    } else {
      setConfirmandoLink(true)
    }
    // Roda uma vez, ao abrir a página.
  }, [])

  async function enviarLink(evento: React.FormEvent) {
    evento.preventDefault()
    if (confirmandoLink) {
      await concluirLink(email)
      return
    }
    setEntrando(true)
    setErro(null)
    try {
      const endereco = email.trim()
      await sendSignInLinkToEmail(authWeb(), endereco, {
        url: `${window.location.origin}/entrar`,
        handleCodeInApp: true,
      })
      guardarEmail(endereco)
      setLinkEnviado(true)
    } catch (falha) {
      console.error('[entrar] falha ao enviar o link', falha)
      setErro(mensagemDeFalha(falha))
    } finally {
      setEntrando(false)
    }
  }

  const campo =
    'w-full rounded-[11px] border border-[var(--color-linha)] bg-white px-3.5 py-3 text-sm text-[var(--color-tinta)] outline-none focus:border-[var(--color-folha-700)] max-sm:text-base'

  return (
    <div className="space-y-4">
      {!confirmandoLink && (
        <button
          type="button"
          onClick={entrar}
          disabled={entrando}
          className="w-full rounded-[11px] bg-[var(--color-folha-900)] px-4 py-3.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#4F6D52] disabled:opacity-60"
        >
          {entrando ? 'Entrando…' : 'Entrar com a conta corporativa'}
        </button>
      )}

      <div className="border-t border-[var(--color-linha)] pt-4">
        {linkEnviado ? (
          <p className="text-[13.5px] text-[var(--color-apoio)]">
            Enviamos um link de acesso para <b className="text-[var(--color-tinta)]">{email}</b>.
            Abra o e-mail e clique no link para entrar. Se não chegar em alguns
            minutos, confira a caixa de spam.
          </p>
        ) : (
          <form onSubmit={enviarLink} className="space-y-2.5">
            <label
              htmlFor="email-convidado"
              className="block text-[13px] text-[var(--color-apoio)]"
            >
              {confirmandoLink
                ? 'Confirme o e-mail para o qual o link foi enviado:'
                : 'Não tem conta corporativa? Receba um link de acesso por e-mail. O primeiro acesso passa por aprovação.'}
            </label>
            <input
              id="email-convidado"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className={campo}
            />
            <button
              type="submit"
              disabled={entrando}
              className="w-full rounded-[11px] border border-[var(--color-folha-700)] px-4 py-3 text-sm font-semibold text-[var(--color-folha-900)] transition-colors duration-150 hover:bg-[var(--color-folha-300)]/40 disabled:opacity-60"
            >
              {confirmandoLink ? 'Entrar' : 'Enviar link de acesso'}
            </button>
          </form>
        )}
      </div>

      {erro !== null && (
        <p role="alert" className="text-[13px] text-red-700">
          {erro}
        </p>
      )}
    </div>
  )
}

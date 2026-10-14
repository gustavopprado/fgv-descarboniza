'use client'

/**
 * Entrada — CLAUDE.md §11.4 e POS-DEPLOY.md.
 *
 * Dois caminhos: Google, para quem é do domínio corporativo, e e-mail e senha,
 * para convidado externo. O convidado cria a senha no primeiro acesso, o pedido
 * aparece na tela de acessos, e ele só passa depois de liberado — antes disso o
 * servidor registra o pedido e recusa.
 *
 * O único componente de cliente que fala com o Firebase, e só para provar quem
 * é. O ID token é trocado por cookie de sessão no servidor e a sessão do SDK web
 * é encerrada em seguida: sem isso, o navegador guardaria um refresh token de
 * longa duração que não serve para nada aqui — o sistema inteiro roda no
 * cookie httpOnly.
 */
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { authWeb, provedorGoogle } from '@/lib/firebase-cliente'

/**
 * As falhas que o próprio operador resolve, ditas pelo nome.
 *
 * **A mensagem genérica existe por um bom motivo e não vale para estas.** Do
 * lado do servidor, não distinguir token inválido de token expirado é
 * deliberado: quem está adivinhando não ganha pista. Estas são outra coisa —
 * vêm do SDK no próprio navegador de quem clicou, já estão no console dele, e
 * nenhuma delas depende de quem é a pessoa. Esconder atrás de "tente
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
    'O login por e-mail e senha não está habilitado no provedor de autenticação. Quem administra o projeto precisa ativá-lo.',
  'auth/invalid-email': 'Esse endereço de e-mail não é válido.',
  'auth/email-already-in-use':
    'Este e-mail já tem cadastro. Use "Entrar" com a senha que você criou.',
  'auth/weak-password': 'A senha precisa ter pelo menos 8 caracteres.',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found':
    'Não há cadastro com este e-mail. No primeiro acesso, use "Primeiro acesso".',
  'auth/too-many-requests':
    'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.',
}

/**
 * Tamanho mínimo da senha do convidado.
 *
 * O Firebase aceita a partir de seis; oito é o piso que a tela exige antes de
 * enviar, para a senha fraca não chegar a virar conta.
 */
const SENHA_MINIMA = 8

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
  /** Recusa que é aviso, não erro: o pedido de acesso foi registrado. */
  const [aviso, setAviso] = useState<string | null>(null)

  async function entrar() {
    setEntrando(true)
    setErro(null)
    setAviso(null)

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

  // ------------------------------------------------ convidado: e-mail e senha

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [primeiroAcesso, setPrimeiroAcesso] = useState(false)

  async function entrarComSenha(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    setAviso(null)

    if (primeiroAcesso && senha.length < SENHA_MINIMA) {
      setErro(FALHAS_CONHECIDAS['auth/weak-password'])
      return
    }

    setEntrando(true)
    let auth: Auth | null = null
    try {
      auth = authWeb()
      const endereco = email.trim()
      const credencial = primeiroAcesso
        ? await createUserWithEmailAndPassword(auth, endereco, senha)
        : await signInWithEmailAndPassword(auth, endereco, senha)
      const recusa = await trocarPorSessao(auth, credencial.user)
      if (recusa !== null) {
        // Depois do cadastro a conta existe: da próxima vez é "Entrar".
        setPrimeiroAcesso(false)
        setSenha('')
        setAviso(recusa)
        return
      }
      router.replace(destino)
      router.refresh()
    } catch (falha) {
      console.error('[entrar] falha ao entrar com e-mail e senha', falha)
      setErro(mensagemDeFalha(falha))
      if (auth !== null) await signOut(auth).catch(() => undefined)
    } finally {
      setEntrando(false)
    }
  }

  const campo =
    'w-full rounded-[11px] border border-[var(--color-linha)] bg-white px-3.5 py-3 text-sm text-[var(--color-tinta)] outline-none focus:border-[var(--color-folha-700)] max-sm:text-base'

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={entrar}
        disabled={entrando}
        className="w-full rounded-[11px] bg-[var(--color-folha-900)] px-4 py-3.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#4F6D52] disabled:opacity-60"
      >
        {entrando ? 'Entrando…' : 'Entrar com a conta corporativa'}
      </button>

      <form
        onSubmit={entrarComSenha}
        className="space-y-2.5 border-t border-[var(--color-linha)] pt-4"
      >
        <p className="text-[13px] text-[var(--color-apoio)]">
          {primeiroAcesso
            ? 'Primeiro acesso de convidado: crie uma senha. Seu pedido vai para aprovação e você entra depois de liberado.'
            : 'Convidado de fora da empresa? Entre com e-mail e senha.'}
        </p>
        <label htmlFor="email-convidado" className="sr-only">
          E-mail
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
        <label htmlFor="senha-convidado" className="sr-only">
          Senha
        </label>
        <input
          id="senha-convidado"
          type="password"
          required
          minLength={primeiroAcesso ? SENHA_MINIMA : undefined}
          autoComplete={primeiroAcesso ? 'new-password' : 'current-password'}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder={primeiroAcesso ? `Senha (mínimo ${SENHA_MINIMA} caracteres)` : 'Senha'}
          className={campo}
        />
        <button
          type="submit"
          disabled={entrando}
          className="w-full rounded-[11px] border border-[var(--color-folha-700)] px-4 py-3 text-sm font-semibold text-[var(--color-folha-900)] transition-colors duration-150 hover:bg-[var(--color-folha-300)]/40 disabled:opacity-60"
        >
          {primeiroAcesso ? 'Criar senha e pedir acesso' : 'Entrar'}
        </button>
        <button
          type="button"
          onClick={() => {
            setPrimeiroAcesso(!primeiroAcesso)
            setErro(null)
            setAviso(null)
          }}
          className="w-full py-1.5 text-[12.5px] text-[var(--color-folha-900)] underline underline-offset-2"
        >
          {primeiroAcesso ? 'Já tenho senha' : 'Primeiro acesso'}
        </button>
      </form>

      {aviso !== null && (
        <p
          role="status"
          className="rounded-[11px] border border-[var(--color-folha-500)] bg-[var(--color-folha-300)]/40 p-3.5 text-[13px] text-[var(--color-tinta)]"
        >
          {aviso}
        </p>
      )}
      {erro !== null && (
        <p role="alert" className="text-[13px] text-red-700">
          {erro}
        </p>
      )}
    </div>
  )
}

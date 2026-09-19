'use client'

/**
 * Botão de entrada — CLAUDE.md §11.4.
 *
 * O único componente de cliente que fala com o Firebase, e só para provar quem
 * é. O ID token é trocado por cookie de sessão no servidor e a sessão do SDK web
 * é encerrada em seguida: sem isso, o navegador guardaria um refresh token de
 * longa duração que não serve para nada aqui — o sistema inteiro roda no
 * cookie httpOnly.
 */
import { signInWithPopup, signOut, type Auth } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

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
      const idToken = await credencial.user.getIdToken()

      const resposta = await fetch('/api/sessao', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken }),
      })

      // A sessão que vale é o cookie. A do SDK web não tem mais uso.
      await signOut(auth)

      if (!resposta.ok) {
        const corpo = (await resposta.json().catch(() => ({}))) as { erro?: string }
        setErro(corpo.erro ?? 'Não foi possível entrar.')
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
      } else if (codigo !== undefined && codigo in FALHAS_CONHECIDAS) {
        setErro(FALHAS_CONHECIDAS[codigo])
      } else {
        // O código vai junto: sem ele, a única pista fica no console, e quem
        // abre o sistema num celular não tem console para abrir.
        setErro(
          'Não foi possível entrar. Tente novamente.' +
            (codigo === undefined ? '' : ` (${codigo})`),
        )
      }
      if (auth !== null) await signOut(auth).catch(() => undefined)
    } finally {
      setEntrando(false)
    }
  }

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

      {erro !== null && (
        <p role="alert" className="text-[13px] text-red-700">
          {erro}
        </p>
      )}
    </div>
  )
}

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
import { signInWithPopup, signOut } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { authWeb, provedorGoogle } from '@/lib/firebase-cliente'

export function Entrada({ destino }: { destino: string }) {
  const router = useRouter()
  const [entrando, setEntrando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function entrar() {
    setEntrando(true)
    setErro(null)
    const auth = authWeb()

    try {
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
      const codigo = (falha as { code?: string })?.code
      if (codigo === 'auth/popup-closed-by-user' || codigo === 'auth/cancelled-popup-request') {
        setErro(null)
      } else {
        setErro('Não foi possível entrar. Tente novamente.')
      }
      await signOut(auth).catch(() => undefined)
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

'use client'

/**
 * Encerra a sessão. O servidor revoga a sessão no Firebase e apaga o cookie
 * (§11.11) — aqui só se dispara e se redireciona.
 */
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function Sair() {
  const router = useRouter()
  const [saindo, setSaindo] = useState(false)

  return (
    <button
      type="button"
      disabled={saindo}
      onClick={async () => {
        setSaindo(true)
        await fetch('/api/sessao', { method: 'DELETE' })
        router.replace('/entrar')
        router.refresh()
      }}
      className="mt-2.5 block underline underline-offset-2 transition-colors hover:text-current/90 disabled:opacity-60"
    >
      {saindo ? 'Saindo…' : 'Sair'}
    </button>
  )
}

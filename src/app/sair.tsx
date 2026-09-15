'use client'

/** Encerra a sessão apagando o cookie no servidor. */
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
      className="mt-3 text-xs text-[var(--color-folha-900)]/60 underline underline-offset-2 hover:text-[var(--color-folha-900)]"
    >
      {saindo ? 'Saindo…' : 'Sair'}
    </button>
  )
}

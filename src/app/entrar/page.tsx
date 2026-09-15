/**
 * Tela de entrada — CLAUDE.md §11.4.
 *
 * Quem já tem sessão válida não passa por aqui: vai direto para a primeira tela
 * do próprio perfil.
 */
import { redirect } from 'next/navigation'

import { telaInicial } from '@/server/consultas/navegacao'
import { PerfilAusenteError, sessaoAtual } from '@/server/sessao'
import { Entrada } from './entrada'

export const dynamic = 'force-dynamic'

export default async function Page() {
  let semPerfil: string | null = null

  try {
    const ctx = await sessaoAtual()
    if (ctx !== null) redirect(telaInicial(ctx))
  } catch (erro) {
    if (erro instanceof PerfilAusenteError) semPerfil = erro.email
    else throw erro
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold text-[var(--color-folha-900)]">
        FGV Descarboniza
      </h1>
      <p className="mt-2 mb-8 text-sm text-[var(--color-folha-900)]/70">
        Inventário de emissões de CO₂. Acesso restrito às contas corporativas.
      </p>

      {semPerfil !== null ? (
        <div className="rounded-md border border-[var(--color-folha-500)] bg-[var(--color-folha-300)]/40 p-4 text-sm">
          <p className="font-medium">Sua conta entrou, mas ainda não tem acesso.</p>
          <p className="mt-2 text-[var(--color-folha-900)]/80">
            {semPerfil} precisa receber um perfil de acesso antes de abrir o
            inventário. Peça a liberação a quem administra o sistema.
          </p>
        </div>
      ) : (
        <Entrada destino="/metodo" />
      )}
    </main>
  )
}

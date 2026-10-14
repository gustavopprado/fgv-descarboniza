'use server'

/**
 * Ações da tela de acessos — liberar, recusar e revogar convidado externo.
 *
 * Cada ação refaz a sessão e a camada de consulta confere o papel de novo:
 * esconder o botão de quem não pode não é controle de acesso.
 */
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import {
  DecisaoDeAcessoInvalidaError,
  aprovarAcesso,
  recusarAcesso,
  revogarAcesso,
} from '@/server/consultas/acessos'
import type { ContextoDeAcesso } from '@/server/consultas/acesso'
import { exigirSessao } from '@/server/sessao'

type Decisao = (ctx: ContextoDeAcesso, uid: string) => Promise<void>

async function decidir(decisao: Decisao, dados: FormData): Promise<void> {
  const ctx = await exigirSessao()
  const uid = dados.get('uid')
  if (typeof uid !== 'string' || uid === '') redirect('/acessos?aviso=nao-encontrado')

  // `redirect` lança, e por isso mora fora do `try`: dentro, o catch o engoliria.
  let aviso: string | null = null
  try {
    await decisao(ctx, uid)
  } catch (erro) {
    if (!(erro instanceof DecisaoDeAcessoInvalidaError)) throw erro
    aviso = erro.codigo
  }

  revalidatePath('/acessos')
  redirect(aviso === null ? '/acessos' : `/acessos?aviso=${aviso}`)
}

export async function aprovarAction(dados: FormData): Promise<void> {
  await decidir(aprovarAcesso, dados)
}

export async function recusarAction(dados: FormData): Promise<void> {
  await decidir(recusarAcesso, dados)
}

export async function revogarAction(dados: FormData): Promise<void> {
  await decidir((ctx, uid) => revogarAcesso(ctx, uid), dados)
}

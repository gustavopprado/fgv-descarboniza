/**
 * Troca de ID token por cookie de sessão — CLAUDE.md §11.2 e §11.4.
 *
 * `POST` cria a sessão, `DELETE` a encerra. É o único lugar em que um token do
 * cliente é aceito, e ele é verificado no servidor antes de virar qualquer
 * coisa.
 */
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import {
  COOKIE_SESSAO,
  DURACAO_SESSAO_MS,
  LoginRecusadoError,
  criarCookieDeSessao,
} from '@/server/sessao'

export async function POST(requisicao: Request): Promise<NextResponse> {
  let idToken: unknown
  try {
    idToken = ((await requisicao.json()) as { idToken?: unknown })?.idToken
  } catch {
    idToken = undefined
  }

  if (typeof idToken !== 'string' || idToken === '') {
    return NextResponse.json({ erro: 'Requisição sem token.' }, { status: 400 })
  }

  try {
    const cookie = await criarCookieDeSessao(idToken)
    ;(await cookies()).set({
      name: COOKIE_SESSAO,
      value: cookie,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: DURACAO_SESSAO_MS / 1000,
    })
    return NextResponse.json({ ok: true })
  } catch (erro) {
    if (erro instanceof LoginRecusadoError) {
      return NextResponse.json({ erro: erro.message }, { status: 403 })
    }
    // Token inválido ou expirado. A mensagem não distingue os casos: quem está
    // tentando adivinhar não ganha pista nenhuma.
    return NextResponse.json({ erro: 'Não foi possível entrar.' }, { status: 401 })
  }
}

export async function DELETE(): Promise<NextResponse> {
  ;(await cookies()).delete(COOKIE_SESSAO)
  return NextResponse.json({ ok: true })
}

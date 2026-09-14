/**
 * Autorização — CLAUDE.md §5 e §11.3.
 *
 * A verificação acontece **na consulta, junto do dado**. Esconder item de menu
 * não é controle de acesso: toda função de consulta exige o contexto e chama a
 * regra antes de ler qualquer coleção.
 *
 * O contexto vem da sessão verificada no servidor. Nada aqui aceita papel vindo
 * do cliente.
 */
import type { Papel } from '../documentos/tipos'

export type ContextoDeAcesso = {
  uid: string
  email: string
  papel: Papel
  /** Preenchido no perfil `importacao` quando ele é limitado a uma empresa. */
  empresa: string | null
}

export type Modulo = 'mobilidade' | 'viagens' | 'maritimo'

export class AcessoNegadoError extends Error {
  constructor(readonly papel: Papel, oQue: string) {
    super(`O perfil "${papel}" não tem acesso a ${oQue}.`)
    this.name = 'AcessoNegadoError'
  }
}

/** Quem pode abrir o painel do inventário. */
const VE_INVENTARIO: ReadonlySet<Papel> = new Set([
  'admin',
  'sustentabilidade',
  'gestor',
  'importacao',
])

/** Quem pode ver cada módulo do inventário. */
const VE_MODULO: Record<Modulo, ReadonlySet<Papel>> = {
  mobilidade: new Set(['admin', 'sustentabilidade', 'gestor']),
  viagens: new Set(['admin', 'sustentabilidade', 'gestor']),
  maritimo: new Set(['admin', 'sustentabilidade', 'gestor', 'importacao']),
}

/**
 * `colaborador` não consulta nada: não abre o painel, não vê dado de terceiro e
 * não vê agregado (§5.1). O acesso dele é só às próprias submissões, por outra
 * porta.
 */
export function exigirPainel(ctx: ContextoDeAcesso): void {
  if (!VE_INVENTARIO.has(ctx.papel)) {
    throw new AcessoNegadoError(ctx.papel, 'ao painel do inventário')
  }
}

export function exigirModulo(ctx: ContextoDeAcesso, modulo: Modulo): void {
  exigirPainel(ctx)
  if (!VE_MODULO[modulo].has(ctx.papel)) {
    throw new AcessoNegadoError(ctx.papel, `ao módulo de ${modulo}`)
  }
}

/**
 * Empresa à qual a consulta fica limitada, ou `null` para ver todas.
 *
 * Só o perfil `importacao` é recortado por empresa, e só quando o perfil dele
 * traz uma. É o filtro que entra na consulta, não um descarte depois da leitura.
 */
export function limiteDeEmpresa(ctx: ContextoDeAcesso): string | null {
  return ctx.papel === 'importacao' ? ctx.empresa : null
}

/**
 * Quem pode ver quem registrou uma viagem no programa (§3.2).
 *
 * `gestor` não vê nome nem aqui: para ele o programa também é agregado. E nas
 * telas de inventário ninguém vê, seja qual for o papel — por isso esta função
 * não vale para lá.
 */
export function podeVerQuemRegistrou(ctx: ContextoDeAcesso): boolean {
  return ctx.papel === 'admin' || ctx.papel === 'sustentabilidade'
}

/** O viajante só enxerga as próprias submissões (§5.1). */
export function exigirProgramaDeViagens(ctx: ContextoDeAcesso): void {
  const permitidos: ReadonlySet<Papel> = new Set([
    'admin',
    'sustentabilidade',
    'gestor',
    'colaborador',
  ])
  if (!permitidos.has(ctx.papel)) {
    throw new AcessoNegadoError(ctx.papel, 'ao programa de viagens')
  }
}

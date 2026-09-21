/**
 * Autorização — CLAUDE.md §5 e §11.3.
 *
 * A verificação acontece **na consulta, junto do dado**. Esconder item de menu
 * não é controle de acesso: toda função de consulta exige o contexto e chama a
 * regra antes de ler qualquer coleção.
 *
 * O contexto vem da sessão verificada no servidor. Nada aqui aceita papel vindo
 * do cliente.
 *
 * Há três portas distintas, e a diferença entre elas importa:
 *
 *  - **inventário** — quem pode abrir alguma tela do inventário;
 *  - **módulo** — quem pode ver mobilidade, viagens ou marítimo;
 *  - **visão geral** — quem pode ver o total consolidado.
 *
 * A terceira é mais estreita que a primeira de propósito. `importacao` vê
 * somente o módulo marítimo (§5), e um total que soma um módulo só seria um
 * número menor que o inventário apresentado como se fosse o inventário — o erro
 * que a §9.10 existe para impedir, agora no rosto da tela.
 */
import type { Papel } from '../documentos/tipos'

export type ContextoDeAcesso = {
  uid: string
  email: string
  papel: Papel
  /** Preenchido no perfil `importacao` quando ele é limitado a uma empresa. */
  empresa: string | null
  /**
   * Vínculo com o cadastro de funcionários, quando o perfil traz um.
   *
   * Serve ao programa de viagens, que grava `funcionarioId` junto de
   * `criadoPorUid` (§9.6.1) — e pode ser nulo, porque quem registra nem sempre
   * já existe no cadastro. **Não é o controle de acesso**: quem decide o que
   * alguém vê é o papel, e quem delimita as próprias submissões é o uid.
   */
  funcionarioId: string | null
}

export type Modulo = 'mobilidade' | 'viagens' | 'maritimo' | 'transportadoras'

export class AcessoNegadoError extends Error {
  /**
   * `oQue` já vem com a preposição contraída — "ao inventário", "à visão
   * geral" —, e o molde **não** acrescenta outra. A versão anterior escrevia
   * `não tem acesso a ${oQue}` e produzia "não tem acesso a ao inventário" em
   * toda recusa. Ficou invisível enquanto a mensagem só aparecia em terminal;
   * ela é o texto da tela de "Sem acesso", que é a única coisa que um perfil
   * recusado lê.
   */
  constructor(readonly papel: Papel, oQue: string) {
    super(`O perfil "${papel}" não tem acesso ${oQue}.`)
    this.name = 'AcessoNegadoError'
  }
}

/** Quem pode abrir alguma tela do inventário. */
const VE_INVENTARIO: ReadonlySet<Papel> = new Set([
  'admin',
  'sustentabilidade',
  'gestor',
  'importacao',
])

/**
 * Quem pode ver o total consolidado.
 *
 * `importacao` fica de fora: ele enxerga um módulo só, e o consolidado que ele
 * poderia ver não seria o consolidado.
 */
const VE_VISAO_GERAL: ReadonlySet<Papel> = new Set([
  'admin',
  'sustentabilidade',
  'gestor',
])

/** Quem pode ver cada módulo do inventário. */
const VE_MODULO: Record<Modulo, ReadonlySet<Papel>> = {
  mobilidade: new Set(['admin', 'sustentabilidade', 'gestor']),
  viagens: new Set(['admin', 'sustentabilidade', 'gestor']),
  maritimo: new Set(['admin', 'sustentabilidade', 'gestor', 'importacao']),
  /**
   * `importacao` fica de fora: o escopo dele é o módulo marítimo (§5), e
   * distribuição rodoviária às filiais é outro assunto — frete de saída, não
   * importação.
   */
  transportadoras: new Set(['admin', 'sustentabilidade', 'gestor']),
}

/** Na ordem das telas (§11). */
export const MODULOS: readonly Modulo[] = [
  'mobilidade',
  'viagens',
  'maritimo',
  'transportadoras',
]

/**
 * `colaborador` não consulta nada do inventário: não abre painel, não vê dado
 * de terceiro e não vê agregado (§5.1). O acesso dele é só às próprias
 * submissões, por outra porta.
 */
export function exigirInventario(ctx: ContextoDeAcesso): void {
  if (!VE_INVENTARIO.has(ctx.papel)) {
    throw new AcessoNegadoError(ctx.papel, 'ao inventário')
  }
}

export function exigirVisaoGeral(ctx: ContextoDeAcesso): void {
  if (!VE_VISAO_GERAL.has(ctx.papel)) {
    throw new AcessoNegadoError(ctx.papel, 'à visão geral do inventário')
  }
}

export function podeVerModulo(ctx: ContextoDeAcesso, modulo: Modulo): boolean {
  return VE_INVENTARIO.has(ctx.papel) && VE_MODULO[modulo].has(ctx.papel)
}

export function exigirModulo(ctx: ContextoDeAcesso, modulo: Modulo): void {
  exigirInventario(ctx)
  if (!VE_MODULO[modulo].has(ctx.papel)) {
    throw new AcessoNegadoError(ctx.papel, `ao módulo de ${modulo}`)
  }
}

/** Os módulos que este perfil enxerga, na ordem das telas (§10). */
export function modulosVisiveis(ctx: ContextoDeAcesso): Modulo[] {
  return MODULOS.filter((modulo) => podeVerModulo(ctx, modulo))
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

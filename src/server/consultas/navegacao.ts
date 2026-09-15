/**
 * Navegação por perfil — CLAUDE.md §5 e §10.
 *
 * **Isto não é controle de acesso.** O controle está na consulta, junto do dado
 * (§11.3): quem chegar a uma rota proibida digitando a URL recebe
 * `AcessoNegadoError`, e é assim que tem que ser. O que este módulo faz é outra
 * coisa — não oferecer a quem não pode. Menu que mostra porta fechada ensina
 * que existe porta.
 *
 * As duas partes do sistema (§1.1) aparecem separadas de propósito: o
 * inventário relata o que já aconteceu, o programa começa a medir daqui para a
 * frente.
 */
import {
  podeVerModulo,
  type ContextoDeAcesso,
  type Modulo,
} from './acesso'

export type Secao = 'inventario' | 'programa'

export type ItemDeNavegacao = {
  rotulo: string
  href: string
  secao: Secao
  /** Falso enquanto a tela não existir; o menu mostra, apagado. */
  construida: boolean
}

/**
 * As telas já construídas. Enquanto uma tela não está aqui, ela aparece no menu
 * desabilitada — o mapa do sistema fica visível sem prometer link que não abre.
 */
const CONSTRUIDAS: ReadonlySet<string> = new Set(['/mobilidade', '/viagens', '/metodo'])

function item(
  rotulo: string,
  href: string,
  secao: Secao,
): ItemDeNavegacao {
  return { rotulo, href, secao, construida: CONSTRUIDAS.has(href) }
}

const TELA_DO_MODULO: Record<Modulo, { rotulo: string; href: string }> = {
  mobilidade: { rotulo: 'Mobilidade', href: '/mobilidade' },
  viagens: { rotulo: 'Viagens', href: '/viagens' },
  maritimo: { rotulo: 'Marítimo', href: '/maritimo' },
}

/**
 * O menu deste perfil.
 *
 * `importacao` não recebe a visão geral: ele enxerga um módulo só, e um total
 * que soma um módulo não é o total do inventário (§5, §9.10). `colaborador` não
 * recebe nada do inventário — só o programa (§5.1).
 */
export function navegacaoPara(ctx: ContextoDeAcesso): ItemDeNavegacao[] {
  const itens: ItemDeNavegacao[] = []

  if (ctx.papel !== 'colaborador') {
    if (ctx.papel !== 'importacao') {
      itens.push(item('Visão geral', '/', 'inventario'))
    }
    for (const modulo of ['mobilidade', 'viagens', 'maritimo'] as Modulo[]) {
      if (podeVerModulo(ctx, modulo)) {
        const tela = TELA_DO_MODULO[modulo]
        itens.push(item(tela.rotulo, tela.href, 'inventario'))
      }
    }
    itens.push(item('Método', '/metodo', 'inventario'))
  }

  if (ctx.papel === 'colaborador') {
    itens.push(item('Registrar viagem', '/programa/registrar', 'programa'))
    itens.push(item('Minhas viagens', '/programa/minhas-viagens', 'programa'))
  } else {
    itens.push(item('Registrar viagem', '/programa/registrar', 'programa'))
    itens.push(item('Emissões registradas', '/programa/emissoes', 'programa'))
  }

  return itens
}

/**
 * Para onde mandar quem acabou de entrar.
 *
 * Sempre uma tela que este perfil pode abrir: mandar alguém para uma rota que
 * vai recusá-lo seria transformar autorização correta em erro aparente.
 */
export function telaInicial(ctx: ContextoDeAcesso): string {
  const itens = navegacaoPara(ctx)
  const construida = itens.find((i) => i.construida)
  return construida?.href ?? itens[0]?.href ?? '/'
}

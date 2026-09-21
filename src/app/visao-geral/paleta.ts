/**
 * A chave de cor dos quatro módulos — CLAUDE.md §10.0.
 *
 * **Uma só, lida pela faixa e pela série.** As duas peças dizem a mesma coisa em
 * formas diferentes — a faixa é a proporção do ano, a série é a proporção mês a
 * mês —, e é a cor que liga uma à outra. Duas listas de cor seriam uma que muda
 * sem a outra, e o leitor passaria a ver duas chaves para um mesmo assunto.
 *
 * O verde da FGV não está aqui: ele é reservado para marca, item ativo de menu e
 * elemento vivo (§4), e um módulo do inventário não é nenhum dos três.
 *
 * **A ordem é a da pilha, de baixo para cima, e ela é decisão.** A mobilidade
 * vai embaixo porque é taxa repetida nos doze meses: uma banda constante só se
 * lê como constante quando o que está sob ela não varia — no meio da pilha, ela
 * subiria e desceria junto com o marítimo e pareceria medição mensal, que é
 * exatamente a leitura que a §10.0 quer impedir.
 *
 * O módulo novo entra no topo, e não no meio: **trocar a ordem dos que já
 * estavam mudaria a leitura de um gráfico que alguém já conhece**, sem nada
 * ganhar. A quarta cor é a mais clara da paleta da §4 — o verde da FGV continua
 * fora, porque é de marca.
 */
export const ORDEM_DA_PILHA = [
  'mobilidade',
  'viagens',
  'maritimo',
  'transportadoras',
] as const

export type ModuloEmpilhado = (typeof ORDEM_DA_PILHA)[number]

export const COR_DO_MODULO: Record<ModuloEmpilhado, string> = {
  mobilidade: 'var(--color-folha-900)',
  viagens: 'var(--color-folha-500)',
  maritimo: 'var(--color-folha-700)',
  transportadoras: 'var(--color-folha-300)',
}

/** Nome curto, para legenda e para o rótulo de cada banda. */
export const NOME_CURTO: Record<ModuloEmpilhado, string> = {
  mobilidade: 'Mobilidade',
  viagens: 'Viagens',
  maritimo: 'Marítimo',
  transportadoras: 'Transportadoras',
}

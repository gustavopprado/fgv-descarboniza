/**
 * Categorias da coleção `fatorEmissao`.
 *
 * Ficam separadas do resolvedor porque são usadas dos dois lados: por quem
 * carrega o fator e por quem calcula com ele. String solta repetida nos dois
 * lugares é como se grava um fator com uma categoria e se procura por outra.
 */

export const CATEGORIA_AEREO_FAIXA = 'viagem_aerea_faixa'
export const CATEGORIA_AEREO_FAIXA_LIMITE = 'viagem_aerea_faixa_limite'
export const CATEGORIA_AEREO_CLASSE = 'viagem_aerea_classe'
export const CATEGORIA_AEREO_UPLIFT = 'viagem_aerea_uplift'

/**
 * Frete rodoviário de carga, em kg CO₂e por tonelada-quilômetro (§9.2).
 *
 * **O valor não mora no código.** Ele vem de fonte pública e citável, é gravado
 * em `fatorEmissao` com fonte e vigência, e sem ele carregado o módulo falha
 * explicitamente (§10.8) — não há número de memória nem aproximação.
 */
export const CATEGORIA_FRETE_RODOVIARIO = 'frete_rodoviario_tkm'

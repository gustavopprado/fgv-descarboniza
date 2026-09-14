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

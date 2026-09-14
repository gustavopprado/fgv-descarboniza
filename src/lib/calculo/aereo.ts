/**
 * Cálculo aéreo — CLAUDE.md §7.2.
 *
 *   kg_co2e = trecho.distancia_km
 *           × fator_da_faixa_de_distancia
 *           × multiplicador_classe
 *           × trecho.passageiros
 *
 * A unidade de cálculo é o trecho, não a reserva. Cada trecho é um passageiro.
 *
 * Sobre o uplift de 8% sobre a ortodrômica: na base histórica ele já está
 * embutido em `distancia_km` e não pode ser aplicado de novo. No formulário a
 * distância é calculada do zero e o uplift precisa ser aplicado — use
 * `aplicarUplift` só nesse caminho.
 */

export type FaixaDistancia = 'curta' | 'media' | 'longa'

export type LimiteDeFaixa = {
  id: FaixaDistancia
  minKm: number
  maxKm: number | null
}

export type EntradaTrechoAereo = {
  distanciaKm: number
  fatorKgPorPassageiroKm: number
  multiplicadorClasse: number
  passageiros: number
}

/** Emissão de um trecho, em kg CO₂e. Sem arredondamento: quem exibe arredonda. */
export function emissaoTrechoAereo(entrada: EntradaTrechoAereo): number {
  const { distanciaKm, fatorKgPorPassageiroKm, multiplicadorClasse, passageiros } =
    entrada

  if (!Number.isFinite(distanciaKm) || distanciaKm < 0) {
    throw new Error(`Distância inválida no trecho: ${distanciaKm}`)
  }
  if (!Number.isFinite(fatorKgPorPassageiroKm) || fatorKgPorPassageiroKm <= 0) {
    throw new Error(`Fator inválido no trecho: ${fatorKgPorPassageiroKm}`)
  }
  if (!Number.isInteger(passageiros) || passageiros < 1) {
    throw new Error(`Número de passageiros inválido no trecho: ${passageiros}`)
  }

  return (
    distanciaKm * fatorKgPorPassageiroKm * multiplicadorClasse * passageiros
  )
}

/**
 * Classifica a distância na faixa correspondente. Os limites vêm da tabela de
 * fatores, não de constante no código.
 */
export function faixaPorDistancia(
  distanciaKm: number,
  limites: readonly LimiteDeFaixa[],
): FaixaDistancia {
  const faixa = limites.find(
    (l) => distanciaKm >= l.minKm && (l.maxKm === null || distanciaKm <= l.maxKm),
  )
  if (!faixa) {
    throw new Error(
      `Nenhuma faixa de distância cobre ${distanciaKm} km. Confira a tabela de fatores.`,
    )
  }
  return faixa.id
}

/**
 * Uplift sobre a distância ortodrômica. Só no caminho do formulário: na base
 * histórica a distância já vem com ele (§7.2).
 *
 * A ortodrômica em si está em `lib/geo/distancia`, compartilhada com a
 * mobilidade.
 */
export function aplicarUplift(
  distanciaOrtodromicaKm: number,
  uplift: number,
): number {
  return distanciaOrtodromicaKm * uplift
}

/** Mês do inventário a partir da data do voo — nunca da data de lançamento. */
export function mesDoVoo(dataVoo: string): string {
  return dataVoo.slice(0, 7)
}

/**
 * Emissão da distribuição rodoviária às filiais — CLAUDE.md §9.2.
 *
 * A conta é curta e as decisões dentro dela não são:
 *
 * ```
 * kg_co2e = (peso_kg / 1000) × distancia_km × fator_por_tkm
 * ```
 *
 * - **Tonelada-quilômetro é a unidade**, porque é o que um fator público de
 *   frete de carga mede. O sistema não sabe o modelo do caminhão, a carga de
 *   retorno nem a taxa de ocupação, e a exigência não é exatidão: é a fonte que
 *   chegue mais perto de um resultado coerente. Um fator específico de veículo
 *   afirmaria um veículo que o relatório não informa.
 * - **A distância é o trecho único filial → cliente, sem ida e volta** (§9.3).
 *   Dobrá-la para supor o retorno inventaria quilometragem que a origem não
 *   registra; o fator médio de carga já embute a operação típica do setor.
 * - **O fator vem da coleção, com fonte e vigência** (§10.8). Não existe valor
 *   embutido aqui: sem fator carregado o cálculo falha, em vez de usar um número
 *   de memória.
 */

/** Quilogramas por tonelada. Existe nomeado para a conta se ler sozinha. */
const KG_POR_TONELADA = 1000

/**
 * Tonelada-quilômetro de uma entrega.
 *
 * Peso e distância não negativos são exigidos pela validação de escrita (§10.9);
 * aqui a conta só não tem como inventar sinal.
 */
export function toneladasQuilometro(pesoKg: number, distanciaKm: number): number {
  return (pesoKg / KG_POR_TONELADA) * distanciaKm
}

/**
 * Emissão de uma entrega, em kg CO₂e.
 *
 * `fatorPorTkm` é o valor já resolvido da coleção `fatorEmissao` — quem o resolve
 * é o script de carga, que também o carimba no documento com versão e vigência.
 */
export function co2DaEntrega(
  entrega: { pesoKg: number; distanciaKm: number },
  fatorPorTkm: number,
): number {
  return toneladasQuilometro(entrega.pesoKg, entrega.distanciaKm) * fatorPorTkm
}

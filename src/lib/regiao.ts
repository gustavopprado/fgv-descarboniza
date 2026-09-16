/**
 * Região de um aeroporto — CLAUDE.md §10.3.
 *
 * Existe para o mapa poder desenhar **corredor** em vez de rota par-a-par. A
 * troca é de unidade, não de regra: a supressão da §3.1 continua contando
 * pessoas, e o corredor só junta gente suficiente para que mais recortes
 * sobrevivam a ela. **Agregar não cria população** — corredor voado por uma
 * pessoa continua suprimido.
 *
 * A classificação tem duas metades, e elas não têm a mesma confiança:
 *
 *  - **Aeroporto brasileiro sai do `uf`**, que o cadastro já traz, pelas cinco
 *    regiões do IBGE. É dado, não inferência.
 *  - **Aeroporto estrangeiro sai da coordenada**, por faixa continental. É a
 *    metade frágil: são caixas retangulares sobre um mundo que não é retangular,
 *    e perto de uma borda a classificação pode sair errada. Por isso o valor é
 *    **gravado no cadastro**, não calculado na consulta — assim ele é visível,
 *    revisável e corrigível à mão, e trocar a regra depois não muda em silêncio
 *    um mapa já publicado.
 */
export const REGIOES_DO_BRASIL = [
  'Norte',
  'Nordeste',
  'Centro-Oeste',
  'Sudeste',
  'Sul',
] as const

export type RegiaoDoBrasil = (typeof REGIOES_DO_BRASIL)[number]

/** As cinco regiões do IBGE, por unidade da federação. */
const REGIAO_POR_UF: Readonly<Record<string, RegiaoDoBrasil>> = {
  AC: 'Norte', AP: 'Norte', AM: 'Norte', PA: 'Norte',
  RO: 'Norte', RR: 'Norte', TO: 'Norte',
  AL: 'Nordeste', BA: 'Nordeste', CE: 'Nordeste', MA: 'Nordeste',
  PB: 'Nordeste', PE: 'Nordeste', PI: 'Nordeste', RN: 'Nordeste', SE: 'Nordeste',
  DF: 'Centro-Oeste', GO: 'Centro-Oeste', MT: 'Centro-Oeste', MS: 'Centro-Oeste',
  ES: 'Sudeste', MG: 'Sudeste', RJ: 'Sudeste', SP: 'Sudeste',
  PR: 'Sul', RS: 'Sul', SC: 'Sul',
}

/**
 * Faixas continentais, em [oeste, sul, leste, norte].
 *
 * Grosseiras de propósito: o mapa agrega em continente, e precisão maior não
 * mudaria o desenho. A ordem importa — a primeira faixa que contém o ponto
 * ganha —, e por isso as mais específicas vêm antes.
 */
const FAIXAS: { regiao: string; caixa: [number, number, number, number] }[] = [
  { regiao: 'Europa', caixa: [-25, 36, 45, 72] },
  { regiao: 'África', caixa: [-20, -36, 52, 36] },
  { regiao: 'Ásia', caixa: [45, -12, 180, 78] },
  { regiao: 'Oceania', caixa: [110, -50, 180, -12] },
  { regiao: 'América do Norte', caixa: [-170, 13, -50, 80] },
  { regiao: 'América Central e Caribe', caixa: [-95, 5, -58, 25] },
  { regiao: 'América do Sul', caixa: [-82, -56, -34, 13] },
]

export type ClassificacaoDeRegiao = {
  regiao: string
  /**
   * Como se chegou nela. `uf` é dado do cadastro; `coordenada` é inferência por
   * faixa continental, e é o que precisa de revisão humana.
   */
  criterio: 'uf' | 'coordenada' | 'indefinida'
}

/** Verdadeiro para as cinco regiões do Brasil. */
export function ehDoBrasil(regiao: string): boolean {
  return (REGIOES_DO_BRASIL as readonly string[]).includes(regiao)
}

/**
 * Classifica um aeroporto.
 *
 * O `uf` tem precedência sobre a coordenada: é dado informado, e a coordenada é
 * palpite geométrico. Sem os dois, a região fica indefinida — e indefinida é
 * categoria visível, como o nulo da §9.10, nunca um chute silencioso.
 */
export function classificarRegiao(aeroporto: {
  uf: string | null
  latitude: number | null
  longitude: number | null
}): ClassificacaoDeRegiao {
  const uf = (aeroporto.uf ?? '').trim().toUpperCase()
  const porUf = REGIAO_POR_UF[uf]
  if (porUf !== undefined) return { regiao: porUf, criterio: 'uf' }

  const { latitude, longitude } = aeroporto
  if (
    latitude === null ||
    longitude === null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return { regiao: 'Região indefinida', criterio: 'indefinida' }
  }

  for (const faixa of FAIXAS) {
    const [oeste, sul, leste, norte] = faixa.caixa
    if (
      longitude >= oeste &&
      longitude <= leste &&
      latitude >= sul &&
      latitude <= norte
    ) {
      return { regiao: faixa.regiao, criterio: 'coordenada' }
    }
  }
  return { regiao: 'Região indefinida', criterio: 'indefinida' }
}

/**
 * O corredor entre duas regiões, **sem direção**.
 *
 * Ida e volta são o mesmo corredor: separá-las dobraria as linhas no mapa sem
 * acrescentar informação, e dividiria em duas o recorte que a supressão conta.
 */
export function corredor(origem: string, destino: string): string {
  return [origem, destino].sort((a, b) => a.localeCompare(b, 'pt-BR')).join(' ↔ ')
}

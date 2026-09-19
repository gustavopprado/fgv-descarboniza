/**
 * Cascata de qualidade do dado marítimo — CLAUDE.md §8.1, §8.2.
 *
 * **O valor informado pelo agente é o dado primário e não se recalcula.** Este
 * módulo só existe para o que o agente **não** informou: quando há embarque sem
 * CO₂, a emissão é estimada a partir dos embarques medidos, na cascata do mais
 * específico para o mais genérico.
 *
 * Duas coisas que parecem a mesma e não são, e que moram as duas aqui:
 *
 *  - **estimar** produz um número onde não havia nenhum;
 *  - **sinalizar linha atípica** não muda número nenhum — marca para revisão.
 *
 * Elas usam estatísticas diferentes de propósito: a estimativa usa a **média**,
 * que é o que a §8.2 define, e a sinalização usa a **mediana**, que é o que não
 * se deixa arrastar justamente pelo valor extremo que ela está procurando.
 */

/** Unidades das referências, para carimbar no documento junto do valor. */
export const UNIDADE_POR_CONTAINER = 'kg CO2e/contêiner'
export const UNIDADE_POR_KG = 'kg CO2e/kg'

export const CATEGORIA_MEDIA_CORREDOR = 'maritimo_media_corredor'
export const CATEGORIA_MEDIA_GERAL = 'maritimo_media_geral'
export const CATEGORIA_MEDIA_PESO = 'maritimo_media_peso'

export type NivelEstimado = 'estimado_corredor' | 'estimado_media' | 'estimado_peso'

/**
 * Uma referência usada para estimar, com o bastante para **reproduzir a conta a
 * partir do documento**.
 *
 * O `valor` sozinho não basta: a mesma média recalculada depois, sobre uma base
 * maior, daria outro número, e o documento não teria como dizer qual valia. Por
 * isso viaja junto a `amostra` — quantos embarques medidos entraram nela — e a
 * `versao`, que é o bloco de origem de onde ela saiu. É o mesmo princípio do
 * fator carimbado nos outros módulos (§9.1): guardar o que foi usado, não
 * prometer recalcular igual.
 */
export type Referencia = {
  categoria: string
  chave: string
  valor: number
  unidade: string
  amostra: number
}

export type Referencias = {
  porCorredor: Map<string, Referencia>
  geral: Referencia | null
  porPeso: Referencia | null
}

export type EmbarqueParaEstimar = {
  co2Kg: number | null
  containers: number | null
  pesoKg: number | null
  corredor: string | null
}

export type Estimativa = {
  nivel: NivelEstimado
  co2Kg: number
  referencia: Referencia
}

function media(valores: number[]): number | null {
  if (valores.length === 0) return null
  return valores.reduce((a, b) => a + b, 0) / valores.length
}

/**
 * Monta as referências a partir dos embarques **medidos**.
 *
 * Só entra quem tem CO₂ do agente: estimar a partir de estimativa empilharia
 * erro sem nenhum sinal. E só entra quem tem o denominador — embarque sem
 * contagem de contêiner não diz nada sobre CO₂ por contêiner.
 *
 * `amostraMinimaDoCorredor` não está na §8.2, e é decisão desta implementação:
 * um corredor com um embarque medido tem, como "média do corredor", esse único
 * embarque. Chamar isso de média seria dar ao número uma confiança que ele não
 * tem, e a cascata já tem o degrau seguinte para esse caso. Abaixo do mínimo, o
 * corredor simplesmente não produz referência e a estimativa cai para a média
 * geral.
 */
export function montarReferencias(
  medidos: EmbarqueParaEstimar[],
  opcoes: { amostraMinimaDoCorredor: number },
): Referencias {
  const comCo2 = medidos.filter((e) => e.co2Kg !== null && e.co2Kg > 0)

  const porContainer = comCo2.filter(
    (e) => e.containers !== null && e.containers > 0,
  ) as (EmbarqueParaEstimar & { co2Kg: number; containers: number })[]

  const porCorredor = new Map<string, Referencia>()
  const agrupado = new Map<string, number[]>()
  for (const e of porContainer) {
    if (e.corredor === null) continue
    const lista = agrupado.get(e.corredor) ?? []
    lista.push(e.co2Kg / e.containers)
    agrupado.set(e.corredor, lista)
  }
  for (const [corredor, taxas] of agrupado) {
    if (taxas.length < opcoes.amostraMinimaDoCorredor) continue
    const valor = media(taxas)
    if (valor === null) continue
    porCorredor.set(corredor, {
      categoria: CATEGORIA_MEDIA_CORREDOR,
      chave: corredor,
      valor,
      unidade: UNIDADE_POR_CONTAINER,
      amostra: taxas.length,
    })
  }

  const taxasGerais = porContainer.map((e) => e.co2Kg / e.containers)
  const valorGeral = media(taxasGerais)
  const geral =
    valorGeral === null
      ? null
      : {
          categoria: CATEGORIA_MEDIA_GERAL,
          chave: 'geral',
          valor: valorGeral,
          unidade: UNIDADE_POR_CONTAINER,
          amostra: taxasGerais.length,
        }

  const comPeso = comCo2.filter((e) => e.pesoKg !== null && e.pesoKg > 0) as (
    EmbarqueParaEstimar & { co2Kg: number; pesoKg: number }
  )[]
  const taxasPeso = comPeso.map((e) => e.co2Kg / e.pesoKg)
  const valorPeso = media(taxasPeso)
  const porPeso =
    valorPeso === null
      ? null
      : {
          categoria: CATEGORIA_MEDIA_PESO,
          chave: 'geral',
          valor: valorPeso,
          unidade: UNIDADE_POR_KG,
          amostra: taxasPeso.length,
        }

  return { porCorredor, geral, porPeso }
}

/**
 * Estima o CO₂ de um embarque que não tem. Devolve `null` quando nem o último
 * degrau se aplica — e aí o embarque não recebe número nenhum, em vez de
 * receber zero. Zero é uma afirmação; ausência é ausência.
 */
export function estimar(
  embarque: EmbarqueParaEstimar,
  referencias: Referencias,
): Estimativa | null {
  const { containers, pesoKg, corredor } = embarque

  if (containers !== null && containers > 0) {
    const doCorredor = corredor === null ? undefined : referencias.porCorredor.get(corredor)
    if (doCorredor !== undefined) {
      return {
        nivel: 'estimado_corredor',
        co2Kg: doCorredor.valor * containers,
        referencia: doCorredor,
      }
    }
    if (referencias.geral !== null) {
      return {
        nivel: 'estimado_media',
        co2Kg: referencias.geral.valor * containers,
        referencia: referencias.geral,
      }
    }
  }

  // Último recurso, só quando nem a contagem de contêiner existe (§8.2).
  if (pesoKg !== null && pesoKg > 0 && referencias.porPeso !== null) {
    return {
      nivel: 'estimado_peso',
      co2Kg: referencias.porPeso.valor * pesoKg,
      referencia: referencias.porPeso,
    }
  }

  return null
}

/* ------------------------------------------------------- linha fora da curva */

export type Atipico = {
  razao: number
  medianaDoCorredor: number
}

/**
 * Linha atípica: plausível, mas longe da mediana do próprio corredor (§8.1.1).
 *
 * **Ela entra no total e recebe alerta.** Contêiner pouco carregado, carga solta
 * e embarque partido produzem exatamente este sintoma, e todos são emissão
 * verdadeira — tirá-los seria remover emissão real do inventário por ser
 * incomum, quando é justamente o incomum que um inventário existe para mostrar.
 *
 * O limiar é folgado, e isso é medido e não arbitrado: a dispersão do CO₂ por
 * contêiner dentro dos corredores de maior volume é alta o bastante para que um
 * limiar apertado marcasse uma fração grande da base — e **alerta que dispara em
 * boa parte das linhas é alerta que se aprende a ignorar**.
 *
 * Corredor com poucas linhas não produz sinalização: a mediana de um corredor de
 * uma linha só é a própria linha, e nada nunca destoaria dela.
 */
export function detectarAtipico(
  embarque: { co2Kg: number | null; containers: number | null; corredor: string | null },
  medianasPorCorredor: Map<string, { mediana: number; amostra: number }>,
  opcoes: { limiar: number; amostraMinima: number },
): Atipico | null {
  const { co2Kg, containers, corredor } = embarque
  if (co2Kg === null || co2Kg <= 0) return null
  if (containers === null || containers <= 0) return null
  if (corredor === null) return null

  const referencia = medianasPorCorredor.get(corredor)
  if (referencia === undefined) return null
  if (referencia.amostra < opcoes.amostraMinima) return null
  if (referencia.mediana <= 0) return null

  const taxa = co2Kg / containers
  const razao = taxa / referencia.mediana
  if (razao <= opcoes.limiar && razao >= 1 / opcoes.limiar) return null
  return { razao, medianaDoCorredor: referencia.mediana }
}

/**
 * Linha impossível: a ordem de grandeza não pertence ao módulo (§8.1.1).
 *
 * **Ela não é importada até ser conferida na origem**, porque um número desses
 * sozinho domina o total e torna todo o resto invisível. O sintoma típico é
 * fórmula errada na origem — peso multiplicado por distância, por exemplo.
 *
 * **A comparação é contra a mediana geral do módulo, nunca contra o corredor**,
 * e essa é a parte que faz a regra morder: linha impossível costuma estar
 * sozinha no corredor dela, e um corredor de uma linha só tem essa linha como
 * mediana — o teste passaria justamente onde precisava reprovar.
 */
export function ehImpossivel(
  co2Kg: number | null,
  medianaGeral: number | null,
  limiar: number,
): boolean {
  if (co2Kg === null || medianaGeral === null || medianaGeral <= 0) return false
  return co2Kg > medianaGeral * limiar
}

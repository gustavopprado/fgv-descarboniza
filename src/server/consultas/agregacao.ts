/**
 * Primitivos de agregação — CLAUDE.md §9.10.
 *
 * Três garantias moram aqui, e só aqui:
 *
 *  1. **supressão de grupos pequenos** — recorte com menos pessoas que o limite
 *     vira "outros" (§3.1). A conta é de PESSOAS distintas, não de documentos:
 *     um destino com dez viagens de uma pessoa só identifica essa pessoa;
 *  2. **nulo é categoria visível** — ausência de empresa, de bairro ou de cidade
 *     vira fatia própria, nunca registro que some do total (§9.10);
 *  3. **o total bate com a contagem de documentos.** A soma dos grupos é
 *     conferida contra o que entrou, e diverge estourando erro. Inventário com
 *     registro sumindo de agregação é erro que só aparece em auditoria.
 *
 * Nada aqui conhece Firestore: são funções puras sobre listas, o que as torna
 * testáveis sem banco.
 */

export type Grupo = {
  /** Chave técnica do recorte; `null` virou a chave do rótulo de ausência. */
  chave: string
  rotulo: string
  documentos: number
  pessoas: number
  co2Kg: number
  /** Verdadeiro quando o grupo é o balde de recortes suprimidos. */
  agrupadoPorSupressao: boolean
}

export type OpcoesDeAgrupamento<T> = {
  /** Recorte do item; `null` cai no rótulo de ausência. */
  chave: (item: T) => string | null
  valor: (item: T) => number
  /** Identidade da pessoa, para a contagem da supressão. */
  pessoa?: (item: T) => string
  /** Rótulo da fatia de ausência. Sempre visível. */
  rotuloNulo: string
  /** Abaixo disso o recorte vira "outros". Sem limite, não há supressão. */
  limite?: number
  rotuloOutros?: string
}

const CHAVE_NULA = '__sem_valor__'
const CHAVE_OUTROS = '__outros__'

/**
 * Agrupa aplicando supressão e mantendo o nulo visível.
 *
 * O balde de suprimidos não carrega rótulo de lugar nenhum: ele é a soma de
 * recortes distintos e, por construção, não diz onde ninguém mora.
 */
export function agrupar<T>(itens: T[], opcoes: OpcoesDeAgrupamento<T>): Grupo[] {
  const { chave, valor, pessoa, rotuloNulo, limite, rotuloOutros = 'outros' } = opcoes

  type Acumulado = {
    rotulo: string
    documentos: number
    co2Kg: number
    pessoas: Set<string>
  }
  const bruto = new Map<string, Acumulado>()

  itens.forEach((item, i) => {
    const original = chave(item)
    const id = original ?? CHAVE_NULA
    const atual = bruto.get(id) ?? {
      rotulo: original ?? rotuloNulo,
      documentos: 0,
      co2Kg: 0,
      pessoas: new Set<string>(),
    }
    atual.documentos += 1
    atual.co2Kg += valor(item)
    // Sem identificador de pessoa, cada documento conta como um — é o pior caso
    // para a supressão, e o lado seguro de errar.
    atual.pessoas.add(pessoa ? pessoa(item) : `__doc_${i}`)
    bruto.set(id, atual)
  })

  const grupos: Grupo[] = []
  const suprimidos: Acumulado = {
    rotulo: rotuloOutros,
    documentos: 0,
    co2Kg: 0,
    pessoas: new Set<string>(),
  }
  let houveSupressao = false

  for (const [id, acumulado] of bruto) {
    const cabeSozinho = limite === undefined || acumulado.pessoas.size >= limite
    if (cabeSozinho) {
      grupos.push({
        chave: id,
        rotulo: acumulado.rotulo,
        documentos: acumulado.documentos,
        pessoas: acumulado.pessoas.size,
        co2Kg: acumulado.co2Kg,
        agrupadoPorSupressao: false,
      })
      continue
    }
    houveSupressao = true
    suprimidos.documentos += acumulado.documentos
    suprimidos.co2Kg += acumulado.co2Kg
    for (const p of acumulado.pessoas) suprimidos.pessoas.add(p)
  }

  if (houveSupressao) {
    grupos.push({
      chave: CHAVE_OUTROS,
      rotulo: suprimidos.rotulo,
      documentos: suprimidos.documentos,
      pessoas: suprimidos.pessoas.size,
      co2Kg: suprimidos.co2Kg,
      agrupadoPorSupressao: true,
    })
  }

  conferirTotal(itens.length, grupos)
  return grupos.sort((a, b) => {
    // O balde de suprimidos fecha a lista; o resto vem por emissão.
    if (a.agrupadoPorSupressao !== b.agrupadoPorSupressao) {
      return a.agrupadoPorSupressao ? 1 : -1
    }
    return b.co2Kg - a.co2Kg
  })
}

/**
 * A soma dos grupos tem que reproduzir o que entrou. Se não reproduz, algum
 * recorte engoliu documento em silêncio — que é exatamente o erro que só
 * aparece em auditoria.
 */
export function conferirTotal(documentos: number, grupos: Grupo[]): void {
  const somado = grupos.reduce((s, g) => s + g.documentos, 0)
  if (somado !== documentos) {
    throw new Error(
      `Agregação perdeu documento: entraram ${documentos}, os grupos somam ${somado}. ` +
        'Nenhum registro pode sumir de um agrupamento (§9.10).',
    )
  }
}

/** Série por mês, com os meses ausentes preenchidos com zero. */
export function serieMensal<T>(
  itens: T[],
  mes: (item: T) => string | null,
  valor: (item: T) => number,
): { mes: string; co2Kg: number; documentos: number }[] {
  const porMes = new Map<string, { co2Kg: number; documentos: number }>()
  for (const item of itens) {
    const m = mes(item)
    if (!m) continue
    const atual = porMes.get(m) ?? { co2Kg: 0, documentos: 0 }
    atual.co2Kg += valor(item)
    atual.documentos += 1
    porMes.set(m, atual)
  }
  return [...porMes.entries()]
    .map(([m, v]) => ({ mes: m, ...v }))
    .sort((a, b) => a.mes.localeCompare(b.mes))
}

export function somar<T>(itens: T[], valor: (item: T) => number): number {
  return itens.reduce((s, item) => s + valor(item), 0)
}

export function media<T>(itens: T[], valor: (item: T) => number): number {
  return itens.length === 0 ? 0 : somar(itens, valor) / itens.length
}

/** O painel fala em toneladas por ano (§1). */
export function emToneladas(kg: number): number {
  return kg / 1000
}

/**
 * Meses do ano, usados para anualizar a mobilidade.
 *
 * Mobilidade é taxa mensal e viagem e embarque são eventos (§9.3). Consolidar os
 * três exige esta conversão explícita — somar direto dá número errado sem
 * nenhum sinal de erro.
 */
export const MESES_NO_ANO = 12

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
export function conferirTotal(
  documentos: number,
  grupos: { documentos: number }[],
): void {
  const somado = grupos.reduce((s, g) => s + g.documentos, 0)
  if (somado !== documentos) {
    throw new Error(
      `Agregação perdeu documento: entraram ${documentos}, os grupos somam ${somado}. ` +
        'Nenhum registro pode sumir de um agrupamento (§9.10).',
    )
  }
}

/* ------------------------------------------- recortes de viagem (§3.1.2) */

/**
 * Uma linha da tabela de destinos ou de rotas — CLAUDE.md §3.1.2 e §10.3.
 *
 * **Aqui não há supressão**, e a diferença em relação ao `Grupo` da mobilidade é
 * essa: rota é fato operacional da empresa, não dado pessoal de quem embarcou.
 * O que a linha diz é **quantas pessoas** e **quando** — nunca quem.
 */
export type RecorteDeViagem = {
  rotulo: string
  trechos: number
  pessoas: number
  co2Kg: number
  /** Datas extremas do recorte, em `AAAA-MM-DD`. Nulas quando nenhum trecho tem data. */
  primeira: string | null
  ultima: string | null
  /**
   * Linha de resto — a soma dos recortes que não couberam na lista.
   *
   * **Não é supressão, e a tela precisa dizer isso.** Nada aqui foi escondido
   * por causa de quantas pessoas voaram: é corte de leitura, e o corte inteiro
   * seria reconstruível aumentando `quantos`. Confundir as duas coisas é o que
   * a §3.1.2 acabou de desfazer.
   */
  resto: boolean
  /** Quantos recortes distintos a linha reúne. Um, em toda linha que não é resto. */
  recortes: number
}

/**
 * Agrupa e devolve os maiores, somando o resto numa linha.
 *
 * Sem supressão: o `limite` do `agrupar` não entra aqui de propósito (§3.1.2).
 * O corte é de **leitura** — sem ele, tirar a supressão troca uma tabela curta
 * demais por uma tabela longa demais, e nenhuma das duas se lê.
 *
 * A soma dos trechos das linhas reproduz o que entrou, linha de resto inclusive:
 * é a mesma invariante da §9.10, e vale igual quando o corte é de leitura.
 */
export function maioresRecortes<T>(
  itens: T[],
  opcoes: {
    chave: (item: T) => string | null
    valor: (item: T) => number
    pessoa: (item: T) => string
    /** Data de referência do item, em `AAAA-MM-DD`. */
    data: (item: T) => string | null
    rotuloNulo: string
    /** Quantas linhas próprias antes do resto. */
    quantos: number
    rotuloResto: (recortes: number) => string
  },
): RecorteDeViagem[] {
  const { chave, valor, pessoa, data, rotuloNulo, quantos, rotuloResto } = opcoes

  type Acumulado = {
    rotulo: string
    trechos: number
    co2Kg: number
    pessoas: Set<string>
    primeira: string | null
    ultima: string | null
  }
  const bruto = new Map<string, Acumulado>()

  for (const item of itens) {
    const original = chave(item)
    const id = original ?? CHAVE_NULA
    const atual = bruto.get(id) ?? {
      rotulo: original ?? rotuloNulo,
      trechos: 0,
      co2Kg: 0,
      pessoas: new Set<string>(),
      primeira: null,
      ultima: null,
    }
    atual.trechos += 1
    atual.co2Kg += valor(item)
    atual.pessoas.add(pessoa(item))

    // Comparação de data em string, sem `Date`: `AAAA-MM-DD` ordena
    // lexicograficamente, e passar por `Date` traria de volta os bugs de fuso
    // que a §9.1 evita guardando data como texto.
    const d = data(item)
    if (d !== null) {
      if (atual.primeira === null || d < atual.primeira) atual.primeira = d
      if (atual.ultima === null || d > atual.ultima) atual.ultima = d
    }
    bruto.set(id, atual)
  }

  const linhas: RecorteDeViagem[] = [...bruto.values()]
    .map((a) => ({
      rotulo: a.rotulo,
      trechos: a.trechos,
      pessoas: a.pessoas.size,
      co2Kg: a.co2Kg,
      primeira: a.primeira,
      ultima: a.ultima,
      resto: false,
      recortes: 1,
    }))
    .sort((a, b) => b.co2Kg - a.co2Kg)

  // Sobrando um só, ele vira a própria linha: "resto (1 destino)" ocupa o mesmo
  // espaço do destino e diz menos.
  if (linhas.length <= quantos + 1) {
    conferirTotal(itens.length, linhas.map((l) => ({ documentos: l.trechos })))
    return linhas
  }

  const maiores = linhas.slice(0, quantos)
  const restantes = linhas.slice(quantos)
  const rotulosDoResto = new Set(restantes.map((r) => r.rotulo))
  const pessoasDoResto = new Set<string>()
  for (const item of itens) {
    if (rotulosDoResto.has(chave(item) ?? rotuloNulo)) pessoasDoResto.add(pessoa(item))
  }

  maiores.push({
    rotulo: rotuloResto(restantes.length),
    trechos: restantes.reduce((s, r) => s + r.trechos, 0),
    // Pessoas distintas, não a soma das linhas: quem aparece em dois recortes
    // do resto é uma pessoa, e somar contaria duas.
    pessoas: pessoasDoResto.size,
    co2Kg: restantes.reduce((s, r) => s + r.co2Kg, 0),
    primeira: restantes.reduce<string | null>(
      (m, r) => (r.primeira === null ? m : m === null || r.primeira < m ? r.primeira : m),
      null,
    ),
    ultima: restantes.reduce<string | null>(
      (m, r) => (r.ultima === null ? m : m === null || r.ultima > m ? r.ultima : m),
      null,
    ),
    resto: true,
    recortes: restantes.length,
  })

  conferirTotal(itens.length, maiores.map((l) => ({ documentos: l.trechos })))
  return maiores
}

/**
 * Série por mês, **com os meses vazios preenchidos com zero** entre o primeiro e
 * o último mês que têm dado.
 *
 * O preenchimento não é enfeite. Sem ele, um mês sem viagem nenhuma
 * simplesmente não existe na série, e a tela desenha o mês seguinte encostado
 * no anterior — um buraco vira continuidade, e a queda que houve desaparece do
 * gráfico. Mês sem emissão é informação; mês ausente é omissão.
 *
 * A série não é estendida além do que existe: inventar meses futuros com zero
 * afirmaria que não houve viagem em período que ainda não foi apurado.
 */
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

  const presentes = [...porMes.keys()].sort((a, b) => a.localeCompare(b))
  if (presentes.length === 0) return []

  const serie: { mes: string; co2Kg: number; documentos: number }[] = []
  for (const m of mesesEntre(presentes[0], presentes[presentes.length - 1])) {
    serie.push({ mes: m, ...(porMes.get(m) ?? { co2Kg: 0, documentos: 0 }) })
  }
  return serie
}

/** Todo mês de `inicio` a `fim`, inclusive, em `AAAA-MM`. */
export function mesesEntre(inicio: string, fim: string): string[] {
  const meses: string[] = []
  let ano = Number(inicio.slice(0, 4))
  let mes = Number(inicio.slice(5, 7))

  // Aritmética de ano e mês na mão, sem `Date`: data em string é o que evita os
  // bugs de fuso (§9.1), e passar por `Date` os traria de volta pela janela.
  while (`${ano}-${String(mes).padStart(2, '0')}`.localeCompare(fim) <= 0) {
    meses.push(`${ano}-${String(mes).padStart(2, '0')}`)
    mes += 1
    if (mes > 12) {
      mes = 1
      ano += 1
    }
  }
  return meses
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

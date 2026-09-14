/**
 * Normalização de texto livre vindo de formulário.
 *
 * A base de mobilidade traz a mesma cidade escrita em caixa alta, em caixa
 * mista e com ou sem acento. Sem normalizar, o agrupamento por cidade e por
 * bairro quebra e um mesmo bairro vira dois recortes pequenos — o que é pior
 * que um erro de exibição, porque a supressão de grupos pequenos (§3.1) passa a
 * atuar onde não deveria.
 */

/** Chave de comparação: sem acento, sem caixa, sem espaço duplicado. */
export function chaveNormalizada(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const PALAVRAS_MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'd'])

/** Caixa de nome de lugar: "VILA DAS ACÁCIAS" → "Vila das Acácias". */
export function caixaDeLugar(valor: string): string {
  const limpo = valor.replace(/\s+/g, ' ').trim()
  // Texto que já veio em caixa mista foi digitado assim de propósito.
  if (limpo !== limpo.toUpperCase()) return limpo

  return limpo
    .toLowerCase()
    .split(' ')
    .map((palavra, i) => {
      if (i > 0 && PALAVRAS_MINUSCULAS.has(palavra)) return palavra
      return palavra.charAt(0).toUpperCase() + palavra.slice(1)
    })
    .join(' ')
}

function quantidadeDeAcentos(valor: string): number {
  return valor.length - valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').length
}

/**
 * Escolhe uma grafia para exibir entre as variantes do mesmo lugar.
 *
 * Vence a mais acentuada — é a que perde menos informação —, depois a mais
 * frequente, depois a ordem alfabética, para o resultado não depender da ordem
 * das linhas do arquivo.
 */
export function grafiaCanonica(variantes: Iterable<string>): string {
  const contagem = new Map<string, number>()
  for (const v of variantes) {
    const limpo = v.replace(/\s+/g, ' ').trim()
    if (limpo === '') continue
    contagem.set(limpo, (contagem.get(limpo) ?? 0) + 1)
  }

  const escolhida = [...contagem.entries()].sort((a, b) => {
    const acentos = quantidadeDeAcentos(b[0]) - quantidadeDeAcentos(a[0])
    if (acentos !== 0) return acentos
    if (b[1] !== a[1]) return b[1] - a[1]
    return a[0].localeCompare(b[0], 'pt-BR')
  })[0]

  return escolhida ? caixaDeLugar(escolhida[0]) : ''
}

/**
 * Agrupa variantes de escrita e devolve, para cada chave, a grafia a exibir.
 */
export function canonizarLugares(valores: Iterable<string>): Map<string, string> {
  const porChave = new Map<string, string[]>()
  for (const valor of valores) {
    if (!valor) continue
    const chave = chaveNormalizada(valor)
    if (chave === '') continue
    const lista = porChave.get(chave)
    if (lista) lista.push(valor)
    else porChave.set(chave, [valor])
  }

  const canonicas = new Map<string, string>()
  for (const [chave, variantes] of porChave) {
    canonicas.set(chave, grafiaCanonica(variantes))
  }
  return canonicas
}

/** Sigla de unidade federativa em caixa alta. */
export function uf(valor: string): string {
  return chaveNormalizada(valor)
}

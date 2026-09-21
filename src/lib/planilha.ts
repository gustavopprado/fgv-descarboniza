/**
 * Primitivos de leitura de planilha — o que é comum a qualquer base em Excel.
 *
 * Nasceu dentro do módulo marítimo e saiu de lá quando o segundo leitor
 * apareceu: `texto`, `chave` e a conversão de data carregam lições que custaram
 * caro — data inválida que derrubava a carga inteira, fuso que jogava o dia
 * primeiro para o mês anterior —, e **duas cópias delas seriam uma que
 * envelhece sem a outra.** É o mesmo movimento que tirou o tipo do desenho de
 * dentro da pasta de Viagens: compartilha-se a mecânica, nunca o dado.
 *
 * O módulo é puro e não conhece coluna, aba nem base nenhuma: quem sabe o que
 * cada coluna significa é o leitor de cada relatório.
 */

/** O que uma célula pode ser depois de lida da planilha. */
export type CelulaBruta = string | number | Date | boolean | null

/** Uma aba, em matriz. `linhas[r][c]`, ambos começando em zero. */
export type AbaLida = {
  nome: string
  linhas: CelulaBruta[][]
}

/**
 * Data inválida existe de verdade nestes arquivos.
 *
 * Há célula de data com valor que o leitor entrega como `Date` inválido. Chamar
 * `toISOString()` nela lança, e a exceção sobe da leitura de uma linha até
 * derrubar a carga inteira — o padrão que já custou duas vezes aqui. Data
 * inválida é **ausência de data**, tratada como tal.
 */
export function dataValida(valor: Date): boolean {
  return Number.isFinite(valor.getTime())
}

export function texto(valor: CelulaBruta): string {
  if (valor === null || valor === undefined) return ''
  if (valor instanceof Date) {
    return dataValida(valor) ? valor.toISOString().slice(0, 10) : ''
  }
  return String(valor).trim()
}

export function chave(valor: CelulaBruta): string {
  return texto(valor).replace(/\s+/g, ' ').trim().toUpperCase()
}

export function textoOuNulo(valor: CelulaBruta): string | null {
  const t = texto(valor)
  return t === '' ? null : t
}

/**
 * Número de uma célula que **pode vir digitada à mão**.
 *
 * O relatório do agente de carga é planilha digitada, e nela o número às vezes
 * chega como texto com separador brasileiro. Ler ao pé da letra e devolver nulo
 * quando não for número: adivinhar aqui seria inventar peso.
 *
 * > **Não use isto em coluna cuja unidade admita valor abaixo de mil.** A
 * > limpeza remove o ponto seguido de exatamente três dígitos, então `"1.701"`
 * > vira `1701`. Numa coluna de peso em quilos isso é o separador de milhar; numa
 * > coluna de distância com casas decimais, `1.701` é um quilômetro e setecentos
 * > metros, e a mesma limpeza multiplicaria a distância por mil. É por isso que o
 * > leitor de entregas rodoviárias exige célula numérica e recusa texto, em vez
 * > de reaproveitar esta função (§9.3).
 */
export function numeroOuNulo(valor: CelulaBruta): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null
  const t = texto(valor)
  if (t === '') return null
  const limpo = t.replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

/**
 * Data da planilha em `AAAA-MM-DD` (§10.1).
 *
 * As partes são lidas em UTC porque é assim que o Excel entrega meia-noite —
 * converter pelo fuso local jogaria o dia primeiro para o último do mês
 * anterior em São Paulo, que é exatamente o bug que a §10.1 evita guardando data
 * como texto.
 */
export function dataOuNulo(valor: CelulaBruta): string | null {
  if (valor instanceof Date) {
    if (!dataValida(valor)) return null
    const a = valor.getUTCFullYear()
    const m = String(valor.getUTCMonth() + 1).padStart(2, '0')
    const d = String(valor.getUTCDate()).padStart(2, '0')
    return `${a}-${m}-${d}`
  }
  const t = texto(valor)
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null
}

/**
 * Menor e maior número de série que este sistema aceita como data.
 *
 * A faixa é a guarda que separa "data" de "qualquer número que caiu na coluna
 * de data": um código, uma quantidade ou um valor viraria 1902 ou 2153 sem nada
 * parecer errado. Ela é folgada — cobre de 1990 ao fim do século — porque
 * apertá-la para o período de uma base recusaria a carga do período seguinte.
 */
const SERIE_MINIMA = 32874 // 1990-01-01
const SERIE_MAXIMA = 73415 // 2100-12-31

/**
 * Data a partir do número de série do Excel.
 *
 * O Excel guarda data como dias desde 1899-12-30 no sistema de 1900 — a origem
 * é essa, e não 1900-01-01, porque a planilha herdou do Lotus o ano de 1900
 * como bissexto. **Quem lê o pacote sem consultar o formato da célula recebe o
 * número cru**, e é aqui que ele volta a ser data.
 *
 * A conta é feita em UTC, pela mesma razão de `dataOuNulo`. Número fracionário
 * é hora do dia e é truncado: o inventário agrupa por dia (§10.1).
 */
export function dataDeSerieOuNulo(valor: CelulaBruta): string | null {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return null
  const dias = Math.floor(valor)
  if (dias < SERIE_MINIMA || dias > SERIE_MAXIMA) return null
  const ms = Date.UTC(1899, 11, 30) + dias * 86_400_000
  const d = new Date(ms)
  if (!dataValida(d)) return null
  return d.toISOString().slice(0, 10)
}

/**
 * Data escrita como `DD/MM/AAAA`, que é o que sobra quando a planilha passa por
 * CSV.
 *
 * Existe separada de `dataOuNulo` porque o formato é ambíguo com `MM/DD/AAAA` e
 * a desambiguação não é do parser: quem chama sabe de que origem o arquivo veio.
 * Dia acima de doze é a única prova interna, e não se pode contar com ela.
 */
export function dataBrOuNulo(valor: CelulaBruta): string | null {
  const t = texto(valor)
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t)
  if (m === null) return null
  const [, dia, mes, ano] = m
  const iso = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`
  const d = new Date(`${iso}T00:00:00Z`)
  if (!dataValida(d) || d.toISOString().slice(0, 10) !== iso) return null
  return iso
}

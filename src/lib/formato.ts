/**
 * Formatação de número para as telas.
 *
 * Tudo em pt-BR e num lugar só: milhar com ponto e decimal com vírgula
 * espalhados à mão pelas telas é como o mesmo número aparece de dois jeitos em
 * duas telas do mesmo sistema.
 */
const PT_BR = 'pt-BR'

export function numero(valor: number, casas = 1): string {
  return valor.toLocaleString(PT_BR, {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })
}

export function inteiro(valor: number): string {
  return Math.round(valor).toLocaleString(PT_BR)
}

export function proporcao(valor: number, casas = 1): string {
  return `${numero(valor * 100, casas)}%`
}

/**
 * Plural simples, para os rótulos de contagem não saírem como "1 respostas".
 * O português tem casos irregulares; nenhum deles aparece aqui.
 */
export function plural(quantos: number, singular: string, plural_: string): string {
  return `${inteiro(quantos)} ${quantos === 1 ? singular : plural_}`
}

/**
 * Período de um recorte, a partir de duas datas `AAAA-MM-DD`.
 *
 * As datas são fatiadas como texto, sem passar por `Date`: a §9.1 guarda data em
 * string justamente para não repetir os bugs de fuso, e converter só para
 * formatar os traria de volta pela janela — em São Paulo, `new Date('2025-03-12')`
 * é 11 de março.
 *
 * Recorte de uma viagem só devolve uma data. O intervalo omite o ano da primeira
 * quando as duas caem no mesmo, que é o caso comum de um relatório anual.
 */
export function periodo(primeira: string | null, ultima: string | null): string {
  if (primeira === null || ultima === null) return '—'

  const dia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
  const completa = (d: string) => `${dia(d)}/${d.slice(0, 4)}`

  if (primeira === ultima) return completa(primeira)
  if (primeira.slice(0, 4) === ultima.slice(0, 4)) {
    return `${dia(primeira)}–${completa(ultima)}`
  }
  return `${completa(primeira)}–${completa(ultima)}`
}

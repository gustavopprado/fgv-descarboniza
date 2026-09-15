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

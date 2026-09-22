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
 * Como escrever uma massa de CO₂ em cima de uma barra, dado o maior valor da
 * série — CLAUDE.md §10.
 *
 * **O rótulo do topo tem orçamento de largura, e ele é apertado.** Medido com a
 * casca na coluna em que a série mensal vive: doze meses dão pouco mais de
 * trinta e seis pixels cada, e um valor em quilos com seis dígitos ocupa quase
 * quarenta e nove — **vizinhos se sobrepõem em cerca de doze pixels**, e hoje só
 * não colidem porque as barras têm alturas diferentes e os números acompanham.
 * Dois meses parecidos os encostam.
 *
 * **Não há tamanho de fonte que resolva**: abaixo de nove pixels o texto vira
 * sujeira (§14, 18/09), e mesmo ali ele continua estourando. O que resolve é
 * escrever menos glifos **sem perder o número** — a mesma massa em toneladas
 * cabe em três.
 *
 * As casas saem da ordem de grandeza da própria série, para uma série pequena
 * não virar uma coluna de zeros. E **abaixo de uma tonelada a unidade continua
 * sendo o quilo**, porque ali é a tonelada que escreveria zero: um mês de
 * trezentos quilos é "300", nunca "0,30".
 *
 * O valor exato, em quilos, continua no `title` de cada barra — é ele que a
 * tela nunca arredonda.
 */
export function escalaDeMassa(maiorKg: number): {
  divisor: number
  casas: number
  unidade: string
} {
  // Escrito assim para NaN cair no quilo, que é o dado como ele chega.
  if (!(maiorKg >= 1000)) return { divisor: 1, casas: 0, unidade: 'kg CO₂' }
  const toneladas = maiorKg / 1000
  return {
    divisor: 1000,
    casas: toneladas >= 100 ? 0 : toneladas >= 10 ? 1 : 2,
    unidade: 't CO₂e',
  }
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

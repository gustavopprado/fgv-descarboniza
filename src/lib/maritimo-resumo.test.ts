/**
 * Guardas da tabela de contêineres por porto — CLAUDE.md §8.1, §8.2.
 *
 * **Toda a massa deste arquivo é inventada do zero**, e é fictícia de verdade,
 * não plausível-porque-alguém-olhou-a-base (§2.2): nomes de porto que não
 * existem, contagens redondas, um ano fora do período real. Nenhum número daqui
 * veio de medição nenhuma.
 *
 * O que cada guarda prende é uma forma de a leitura produzir **número plausível
 * e errado** — que é a única forma que interessa, porque leitura que falha alto
 * se conserta sozinha.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import type { AbaLida, CelulaBruta } from './planilha'
import {
  ResumoIlegivel,
  calcularResiduo,
  lerTabelaDePortos,
  repartirPorMes,
  type TabelaDePortos,
} from './maritimo-resumo'

const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']

/** Uma aba de resumo fictícia, no formato do relatório. */
function abaDeResumo(
  portos: [string, number[]][],
  opcoes: { ano?: number; totalDeclarado?: number; comColunaDeTotal?: boolean } = {},
): AbaLida[] {
  const comTotal = opcoes.comColunaDeTotal ?? true
  const soma = portos.reduce((s, [, meses]) => s + meses.reduce((a, b) => a + b, 0), 0)

  const linhas: CelulaBruta[][] = [
    ['RELATÓRIO FICTÍCIO'],
    // O mesmo rótulo aparece como cabeçalho horizontal de outra tabela: é a
    // ambiguidade que o leitor precisa não confundir com o bloco do período.
    ['AGENTE', 'TOTAL CONTAINER', 'PESO', 'CO2'],
    ['AGENTE FICTÍCIO', 10, 20, 30],
    ['PORTO', ...MESES, ...(comTotal ? ['TOTAL CNTR'] : [])],
  ]
  for (const [rotulo, meses] of portos) {
    const total = meses.reduce((a, b) => a + b, 0)
    linhas.push([rotulo, ...meses, ...(comTotal ? [total] : [])])
  }
  // Linha de totais: a única sem rótulo de porto, e é ela que encerra a tabela.
  linhas.push([null, ...MESES.map(() => 0), ...(comTotal ? [soma] : [])])
  linhas.push([])
  linhas.push([opcoes.ano ?? 2031])
  linhas.push(['TOTAL CONTAINER', opcoes.totalDeclarado ?? soma])

  return [{ nome: 'RESUMO', linhas }]
}

function ler(...args: Parameters<typeof abaDeResumo>): TabelaDePortos {
  const tabela = lerTabelaDePortos(abaDeResumo(...args))
  assert.ok(tabela !== null)
  return tabela
}

/* ------------------------------------------------------------------ leitura */

test('lê a tabela de portos e fecha com o total que o arquivo declara', () => {
  const tabela = ler([
    ['PORTO ALFA', [10, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 5]],
    ['PORTO BETA', [0, 8, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0]],
  ])

  assert.equal(tabela.ano, 2031)
  assert.equal(tabela.total, 30)
  assert.equal(tabela.totalDeclarado, 30)
  assert.deepEqual(
    tabela.portos.map((p) => [p.rotulo, p.total]),
    [
      ['PORTO ALFA', 20],
      ['PORTO BETA', 10],
    ],
  )
})

test('a aba sem tabela de portos devolve nulo, em vez de falhar', () => {
  assert.equal(lerTabelaDePortos([{ nome: 'OUTRA', linhas: [['A', 'B'], [1, 2]] }]), null)
})

test('exige os doze meses: meio ano não é ano', () => {
  const linhas: CelulaBruta[][] = [
    ['PORTO', ...MESES.slice(0, 6), 'TOTAL CNTR'],
    ['PORTO ALFA', 1, 1, 1, 1, 1, 1, 6],
    [null],
    [2031],
    ['TOTAL CONTAINER', 6],
  ]
  // Sem os doze, a linha não é reconhecida como cabeçalho — e a aba inteira
  // deixa de ser tabela de portos, em vez de virar um ano pela metade.
  assert.equal(lerTabelaDePortos([{ nome: 'RESUMO', linhas }]), null)
})

test('o ano vem do bloco do período, e não do cabeçalho horizontal homônimo', () => {
  // A tabela de agentes tem uma coluna chamada TOTAL CONTAINER, cuja célula
  // seguinte é outro rótulo. Se o leitor casasse com ela, pegaria um número de
  // outra tabela e não acharia ano nenhum acima.
  assert.equal(ler([['PORTO ALFA', [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]]], { ano: 2029 }).ano, 2029)
})

/* ------------------------------------------------------------------ recusas */

test('recusa quando a soma dos meses discorda do total declarado na linha', () => {
  const abas = abaDeResumo([['PORTO ALFA', [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]]])
  // Estraga só a coluna de total da linha do porto: é o sintoma de a leitura ter
  // pego a coluna errada, e sem esta guarda ele passa como contagem menor.
  const linhaDoPorto = abas[0].linhas[4]
  linhaDoPorto[linhaDoPorto.length - 1] = 99

  assert.throws(() => lerTabelaDePortos(abas), ResumoIlegivel)
})

test('recusa quando a soma das linhas discorda do total do período', () => {
  assert.throws(
    () => lerTabelaDePortos(abaDeResumo([['PORTO ALFA', [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]]], {
      totalDeclarado: 500,
    })),
    ResumoIlegivel,
  )
})

test('recusa contagem que não é inteiro não negativo', () => {
  assert.throws(
    () => lerTabelaDePortos(abaDeResumo([['PORTO ALFA', [1.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]]])),
    ResumoIlegivel,
  )
  assert.throws(
    () => lerTabelaDePortos(abaDeResumo([['PORTO ALFA', [-1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]]])),
    ResumoIlegivel,
  )
})

/* ------------------------------------------------------------------ resíduo */

test('o resíduo é a contagem menos o detalhe, e a soma dos meses fecha nele', () => {
  const tabela = ler([
    ['PORTO ALFA', [10, 10, 10, 10, 0, 0, 0, 0, 0, 0, 0, 0]],
    ['PORTO BETA', [0, 0, 0, 0, 5, 5, 0, 0, 0, 0, 0, 0]],
  ])
  const residuos = calcularResiduo(tabela, new Map([['PORTO ALFA', 12]]))

  assert.deepEqual(
    residuos.map((r) => [r.rotulo, r.total]),
    [
      ['PORTO ALFA', 28],
      ['PORTO BETA', 10],
    ],
  )
  for (const r of residuos) {
    assert.equal(
      r.meses.reduce((a, b) => a + b, 0),
      r.total,
      `as parcelas mensais de ${r.rotulo} precisam somar o resíduo do ano`,
    )
  }
})

test('resíduo negativo é recusado, em vez de virar zero', () => {
  // O detalhe trazendo mais que a contagem inteira não é defasagem de data: é a
  // tabela descrevendo outro período. Zerar aqui faria o total fechar mentindo.
  const tabela = ler([['PORTO ALFA', [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]]])
  assert.throws(() => calcularResiduo(tabela, new Map([['PORTO ALFA', 9]])), ResumoIlegivel)
})

test('a repartição mensal é inteira e segue a forma do porto', () => {
  // 10 contêineres sobre uma forma concentrada em dois meses: nada escorre para
  // mês em que a tabela não conta nada.
  const parcelas = repartirPorMes(10, [0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2])
  assert.equal(parcelas.reduce((a, b) => a + b, 0), 10)
  assert.ok(parcelas.every(Number.isInteger))
  assert.equal(parcelas.filter((v) => v > 0).length, 2)
})

test('a repartição não perde contêiner no arredondamento', () => {
  // Três meses iguais e um resíduo que não divide por três: sem o sobra-e-resto,
  // o piso de cada mês somaria 9 e um contêiner sumiria sem nada acusar.
  const parcelas = repartirPorMes(10, [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  assert.equal(parcelas.reduce((a, b) => a + b, 0), 10)
})

test('forma vazia não inventa mês: resíduo zero devolve zero', () => {
  assert.deepEqual(repartirPorMes(0, [1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]).slice(0, 3), [0, 0, 0])
  assert.deepEqual(repartirPorMes(5, MESES.map(() => 0)).slice(0, 3), [0, 0, 0])
})

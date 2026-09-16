/**
 * Testes das garantias da camada de consulta — supressão de grupos pequenos,
 * nulo como categoria visível e o invariante do total (§3.1 e §9.10).
 *
 * São as regras que o banco relacional cumpria dentro das views. Agora elas só
 * existem porque estão no código, então têm teste.
 *
 * **Toda a massa aqui é fictícia, inventada do zero** (§2.2).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  agrupar,
  emToneladas,
  maioresRecortes,
  media,
  mesesEntre,
  serieMensal,
  somar,
} from './agregacao'

type Registro = { bairro: string | null; empresa: string | null; pessoa: string; co2: number }

function registros(...linhas: [string | null, string, number][]): Registro[] {
  return linhas.map(([bairro, pessoa, co2]) => ({ bairro, empresa: null, pessoa, co2 }))
}

const chave = (r: Registro) => r.bairro
const valor = (r: Registro) => r.co2
const pessoa = (r: Registro) => r.pessoa

/* ------------------------------------------------------------- supressão */

test('recorte com menos pessoas que o limite vira "outros"', () => {
  const dados = registros(
    ['Bairro A', 'p1', 10],
    ['Bairro A', 'p2', 10],
    ['Bairro A', 'p3', 10],
    ['Bairro B', 'p4', 5],
    ['Bairro C', 'p5', 7],
  )

  const grupos = agrupar(dados, { chave, valor, pessoa, rotuloNulo: 'Sem bairro', limite: 3 })

  const a = grupos.find((g) => g.rotulo === 'Bairro A')
  const outros = grupos.find((g) => g.agrupadoPorSupressao)
  assert.equal(a?.pessoas, 3)
  assert.ok(outros, 'os bairros pequenos precisam virar um grupo "outros"')
  assert.equal(outros.pessoas, 2)
  assert.equal(outros.co2Kg, 12)
  // O balde de suprimidos não diz onde ninguém mora.
  assert.ok(!grupos.some((g) => g.rotulo === 'Bairro B' || g.rotulo === 'Bairro C'))
})

test('a supressão conta PESSOAS, não documentos', () => {
  // Uma pessoa só, com muitas viagens para o mesmo destino, continua sendo uma
  // pessoa — e o recorte continua identificando ela.
  const dados = registros(
    ['Destino X', 'p1', 1],
    ['Destino X', 'p1', 1],
    ['Destino X', 'p1', 1],
    ['Destino X', 'p1', 1],
    ['Destino X', 'p1', 1],
  )
  const grupos = agrupar(dados, { chave, valor, pessoa, rotuloNulo: 'n/d', limite: 3 })
  assert.equal(grupos.length, 1)
  assert.equal(grupos[0].agrupadoPorSupressao, true)
  assert.equal(grupos[0].documentos, 5)
  assert.equal(grupos[0].pessoas, 1)
})

test('sem limite não há supressão', () => {
  const dados = registros(['Bairro A', 'p1', 1], ['Bairro B', 'p2', 2])
  const grupos = agrupar(dados, { chave, valor, pessoa, rotuloNulo: 'n/d' })
  assert.equal(grupos.length, 2)
  assert.ok(!grupos.some((g) => g.agrupadoPorSupressao))
})

/* --------------------------------------------------------- nulo visível */

test('nulo é fatia própria, com rótulo, e não some do total', () => {
  const dados = registros(
    ['Bairro A', 'p1', 10],
    [null, 'p2', 4],
    [null, 'p3', 6],
  )
  const grupos = agrupar(dados, { chave, valor, pessoa, rotuloNulo: 'Sem bairro' })

  const semBairro = grupos.find((g) => g.rotulo === 'Sem bairro')
  assert.ok(semBairro, 'a ausência precisa aparecer como categoria')
  assert.equal(semBairro.documentos, 2)
  assert.equal(semBairro.co2Kg, 10)
  assert.equal(
    grupos.reduce((s, g) => s + g.co2Kg, 0),
    20,
  )
})

test('o total sempre bate com a contagem de documentos', () => {
  const dados = registros(
    ['Bairro A', 'p1', 1],
    [null, 'p2', 1],
    ['Bairro B', 'p3', 1],
    ['Bairro C', 'p4', 1],
  )
  for (const limite of [undefined, 1, 2, 5, 99]) {
    const grupos = agrupar(dados, { chave, valor, pessoa, rotuloNulo: 'n/d', limite })
    assert.equal(
      grupos.reduce((s, g) => s + g.documentos, 0),
      dados.length,
      `documento sumiu com limite ${limite}`,
    )
  }
})

test('lista vazia agrega para vazio sem estourar', () => {
  assert.deepEqual(agrupar([] as Registro[], { chave, valor, pessoa, rotuloNulo: 'n/d' }), [])
})

/* -------------------------------------------------------------- auxiliares */

test('série mensal ordena e ignora documento sem mês', () => {
  const itens = [
    { mes: '2031-03', co2: 2 },
    { mes: '2031-01', co2: 1 },
    { mes: null, co2: 99 },
    { mes: '2031-03', co2: 3 },
  ]
  const serie = serieMensal(itens, (i) => i.mes, (i) => i.co2)
  // Fevereiro entra com zero: ele existiu e não teve emissão. Ver o contrato de
  // `serieMensal` — mês ausente seria omissão, não informação.
  assert.deepEqual(serie, [
    { mes: '2031-01', co2Kg: 1, documentos: 1 },
    { mes: '2031-02', co2Kg: 0, documentos: 0 },
    { mes: '2031-03', co2Kg: 5, documentos: 2 },
  ])
})

test('soma, média e conversão para toneladas', () => {
  const itens = [{ v: 1000 }, { v: 3000 }]
  assert.equal(somar(itens, (i) => i.v), 4000)
  assert.equal(media(itens, (i) => i.v), 2000)
  assert.equal(media([] as { v: number }[], (i) => i.v), 0)
  assert.equal(emToneladas(2500), 2.5)
})

/* --------------------------------------------------------- série mensal */

test('mês sem emissão vira zero, não desaparece da série', () => {
  // Sem preenchimento, março apareceria encostado em janeiro e a queda de
  // fevereiro sumiria do gráfico.
  const itens = [
    { mes: '2031-01', co2: 10 },
    { mes: '2031-03', co2: 30 },
  ]
  const serie = serieMensal(itens, (i) => i.mes, (i) => i.co2)

  assert.deepEqual(
    serie.map((p) => p.mes),
    ['2031-01', '2031-02', '2031-03'],
  )
  assert.equal(serie[1].co2Kg, 0)
  assert.equal(serie[1].documentos, 0)
})

test('a série não é estendida além do que existe', () => {
  const serie = serieMensal([{ mes: '2031-05', co2: 1 }], (i) => i.mes, (i) => i.co2)
  assert.deepEqual(
    serie.map((p) => p.mes),
    ['2031-05'],
  )
  assert.deepEqual(serieMensal([] as { mes: string; co2: number }[], (i) => i.mes, (i) => i.co2), [])
})

test('a contagem de meses atravessa a virada do ano', () => {
  assert.deepEqual(mesesEntre('2031-11', '2032-02'), [
    '2031-11',
    '2031-12',
    '2032-01',
    '2032-02',
  ])
  assert.deepEqual(mesesEntre('2031-04', '2031-04'), ['2031-04'])
  assert.deepEqual(mesesEntre('2031-04', '2031-03'), [])
})

/*
 * A autorização saiu daqui: ela ganhou arquivo próprio em `acesso.test.ts`
 * quando a visão geral passou a ser mais estreita que o inventário (§5).
 */

/* ------------------------------------ recortes de viagem, sem supressão */

/**
 * O outro lado da §3.1: **rota não é suprimida por contagem de pessoas**
 * (§3.1.2). Estes testes existem porque a regra difere entre os módulos de
 * propósito, e "uniformizar" é exatamente o que a §3.1 avisa para não fazer —
 * um teste que passasse com supressão aqui deixaria a uniformização silenciosa.
 *
 * **Massa fictícia, inventada do zero** (§2.2).
 */
type Trecho = { destino: string | null; pessoa: string; data: string | null; co2: number }

function trechos(...linhas: [string | null, string, string | null, number][]): Trecho[] {
  return linhas.map(([destino, pessoa, data, co2]) => ({ destino, pessoa, data, co2 }))
}

const opcoesDeRecorte = {
  chave: (t: Trecho) => t.destino,
  valor: (t: Trecho) => t.co2,
  pessoa: (t: Trecho) => t.pessoa,
  data: (t: Trecho) => t.data,
  rotuloNulo: 'Sem destino',
  quantos: 2,
  rotuloResto: (n: number) => `demais ${n} destinos`,
}

test('recorte de uma pessoa só continua aparecendo, com o nome do lugar', () => {
  const linhas = maioresRecortes(
    trechos(
      ['AAA', 'p1', '2031-03-04', 900],
      ['BBB', 'p2', '2031-05-09', 50],
    ),
    opcoesDeRecorte,
  )

  const solitario = linhas.find((l) => l.rotulo === 'AAA')
  assert.equal(solitario?.pessoas, 1)
  assert.equal(solitario?.co2Kg, 900)
  assert.equal(
    linhas.some((l) => l.resto),
    false,
    'nada a agrupar, nada de linha de resto',
  )
})

test('a linha de resto soma o que sobrou e se declara como resto', () => {
  const linhas = maioresRecortes(
    trechos(
      ['AAA', 'p1', '2031-01-10', 100],
      ['BBB', 'p2', '2031-02-10', 90],
      ['CCC', 'p3', '2031-03-10', 8],
      ['DDD', 'p3', '2031-04-10', 5],
      ['EEE', 'p4', '2031-05-10', 2],
    ),
    opcoesDeRecorte,
  )

  assert.equal(linhas.length, 3)
  const resto = linhas.at(-1)
  assert.equal(resto?.resto, true)
  assert.equal(resto?.recortes, 3)
  assert.equal(resto?.trechos, 3)
  assert.equal(resto?.co2Kg, 15)
  // Pessoas distintas, não a soma das linhas: p3 aparece em dois recortes.
  assert.equal(resto?.pessoas, 2)
})

test('sobrando um recorte só, ele aparece em vez de virar linha de resto', () => {
  const linhas = maioresRecortes(
    trechos(
      ['AAA', 'p1', '2031-01-10', 100],
      ['BBB', 'p2', '2031-02-10', 90],
      ['CCC', 'p3', '2031-03-10', 8],
    ),
    opcoesDeRecorte,
  )

  assert.deepEqual(
    linhas.map((l) => l.rotulo),
    ['AAA', 'BBB', 'CCC'],
  )
})

test('nenhum trecho some no corte de leitura', () => {
  const linhas = maioresRecortes(
    trechos(
      ['AAA', 'p1', '2031-01-10', 100],
      ['AAA', 'p1', '2031-02-10', 100],
      ['BBB', 'p2', '2031-02-10', 90],
      ['CCC', 'p3', '2031-03-10', 8],
      [null, 'p4', '2031-03-11', 3],
      ['EEE', 'p5', '2031-04-10', 1],
    ),
    opcoesDeRecorte,
  )

  assert.equal(
    linhas.reduce((s, l) => s + l.trechos, 0),
    6,
    'a soma das linhas tem que reproduzir o que entrou, resto inclusive',
  )
  // Nulo continua sendo categoria visível, aqui como em qualquer agrupamento.
  const rotulos = linhas.flatMap((l) => (l.resto ? [] : [l.rotulo]))
  assert.equal(
    rotulos.includes('Sem destino') || linhas.some((l) => l.resto),
    true,
  )
})

test('o período vai da primeira à última data do recorte', () => {
  const linhas = maioresRecortes(
    trechos(
      ['AAA', 'p1', '2031-07-20', 10],
      ['AAA', 'p2', '2031-02-03', 10],
      ['AAA', 'p3', null, 10],
      ['BBB', 'p4', null, 5],
    ),
    opcoesDeRecorte,
  )

  const a = linhas.find((l) => l.rotulo === 'AAA')
  assert.equal(a?.primeira, '2031-02-03')
  assert.equal(a?.ultima, '2031-07-20')

  // Recorte sem data nenhuma não inventa uma: fica nulo e a tela mostra traço.
  const b = linhas.find((l) => l.rotulo === 'BBB')
  assert.equal(b?.primeira, null)
  assert.equal(b?.ultima, null)
})

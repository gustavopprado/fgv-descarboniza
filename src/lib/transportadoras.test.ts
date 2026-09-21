/**
 * Guardas da leitura do relatório de entregas — `src/lib/transportadoras.ts`.
 *
 * **Toda massa aqui é fictícia, inventada do zero** (§2.2): filial, código de
 * cliente, distância, peso e data são inventados, e nenhuma linha vem da base
 * real. O que se testa é a forma — onde está o cabeçalho, o que é descartado e
 * como a entrega ganha identidade —, nunca o número de ninguém.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { AbaLida, CelulaBruta } from './planilha'
import { lerRelatorioDeEntregas } from './transportadoras'

const PARAMETROS = { distanciaMaximaKm: 6000 }

const CABECALHO = ['Data', 'Filial', 'Código', 'Cliente', 'Distância (km)', 'Peso Bruto']

/** 2025-03-10 em número de série do Excel, que é como o pacote entrega. */
const SERIE_10_MAR_2025 = 45726

function aba(linhas: CelulaBruta[][], nome = 'Export'): AbaLida[] {
  return [{ nome, linhas }]
}

function entrega(
  data: CelulaBruta,
  filial: string,
  distancia: CelulaBruta,
  peso: CelulaBruta,
  codigo: CelulaBruta = '11111 01',
  cliente: CelulaBruta = 'CLIENTE FICTÍCIO LTDA',
): CelulaBruta[] {
  return [data, filial, codigo, cliente, distancia, peso]
}

/* ------------------------------------------------------------------ leitura */

test('lê a entrega com a data em número de série do Excel', () => {
  const r = lerRelatorioDeEntregas(
    aba([CABECALHO, entrega(SERIE_10_MAR_2025, '01', 123.45, 678.9)]),
    PARAMETROS,
  )

  assert.equal(r.entregas.length, 1)
  assert.deepEqual(r.entregas[0], {
    linha: 2,
    filial: '01',
    data: '2025-03-10',
    clienteCodigo: '11111 01',
    distanciaKm: 123.45,
    pesoKg: 678.9,
    ordem: 1,
  })
})

test('aceita a data escrita como DD/MM/AAAA e como AAAA-MM-DD', () => {
  const r = lerRelatorioDeEntregas(
    aba([
      CABECALHO,
      entrega('10/03/2025', '01', 10, 20),
      entrega('2025-03-11', '01', 10, 20),
    ]),
    PARAMETROS,
  )

  assert.deepEqual(
    r.entregas.map((e) => e.data),
    ['2025-03-10', '2025-03-11'],
  )
})

/**
 * O cabeçalho é localizado **pelo conteúdo, nunca por posição** (§9.3): o export
 * pode ganhar linha de título em cima sem a carga ler coluna errada.
 */
test('localiza o cabeçalho pelo conteúdo, e não na primeira linha', () => {
  const r = lerRelatorioDeEntregas(
    aba([
      ['Relatório de entregas', null, null],
      [],
      CABECALHO,
      entrega(SERIE_10_MAR_2025, '02', 10, 20),
    ]),
    PARAMETROS,
  )

  assert.equal(r.linhaDoCabecalho, 3)
  assert.equal(r.entregas.length, 1)
})

test('reconhece a coluna por começo de nome, sem depender de acento nem de unidade', () => {
  const r = lerRelatorioDeEntregas(
    aba([
      ['DATA DA ENTREGA', 'FILIAL', 'CODIGO DO CLIENTE', 'CLIENTE', 'DISTANCIA KM', 'PESO (KG)'],
      entrega(SERIE_10_MAR_2025, '03', 10, 20),
    ]),
    PARAMETROS,
  )

  assert.equal(r.entregas.length, 1)
  assert.equal(r.entregas[0].filial, '03')
})

/* ----------------------------------------------------------------- descarte */

test('linha sem cliente é descartada sem alerta, e contada', () => {
  const r = lerRelatorioDeEntregas(
    aba([
      CABECALHO,
      entrega(SERIE_10_MAR_2025, '01', 10, 20),
      // Linha de formato de exportação: data e filial, mais nada.
      [SERIE_10_MAR_2025, '02', null, null, null, null],
      [],
      ['Rodapé com os filtros aplicados no relatório'],
    ]),
    PARAMETROS,
  )

  assert.equal(r.entregas.length, 1)
  assert.equal(r.semCliente, 3)
  assert.deepEqual(r.descartadas, [])
})

test('linha internacional não entra, e o corte é contado com a faixa', () => {
  const r = lerRelatorioDeEntregas(
    aba([
      CABECALHO,
      entrega(SERIE_10_MAR_2025, '02', 5555.5, 100),
      entrega(SERIE_10_MAR_2025, '02', 12345.6, 100),
      entrega(SERIE_10_MAR_2025, '02', 19999.9, 100),
    ]),
    PARAMETROS,
  )

  assert.equal(r.entregas.length, 1)
  assert.equal(r.entregas[0].distanciaKm, 5555.5)
  assert.equal(r.internacionais.linhas, 2)
  assert.equal(r.internacionais.menorDistanciaKm, 12345.6)
  assert.equal(r.internacionais.maiorDistanciaKm, 19999.9)
})

/**
 * **A ordem conta só as aceitas**, e é isso que mantém o identificador estável.
 *
 * Se a linha descartada consumisse um número, tirar uma entrega internacional do
 * arquivo — ou mudar o limiar — deslocaria o identificador de todas as seguintes
 * daquele dia, e a recarga passaria a gravar documento novo em vez de
 * sobrescrever (§10.11).
 */
test('a linha descartada não consome ordem', () => {
  const r = lerRelatorioDeEntregas(
    aba([
      CABECALHO,
      entrega(SERIE_10_MAR_2025, '01', 10, 20),
      entrega(SERIE_10_MAR_2025, '01', 12345.6, 20),
      [SERIE_10_MAR_2025, '01', null, null, null, null],
      entrega(SERIE_10_MAR_2025, '01', 30, 40),
    ]),
    PARAMETROS,
  )

  assert.deepEqual(
    r.entregas.map((e) => e.ordem),
    [1, 2],
  )
})

test('a ordem reinicia em cada par de filial e data', () => {
  const r = lerRelatorioDeEntregas(
    aba([
      CABECALHO,
      entrega(SERIE_10_MAR_2025, '01', 10, 20),
      entrega(SERIE_10_MAR_2025, '01', 11, 21),
      entrega(SERIE_10_MAR_2025, '02', 12, 22),
      entrega(SERIE_10_MAR_2025 + 1, '01', 13, 23),
    ]),
    PARAMETROS,
  )

  assert.deepEqual(
    r.entregas.map((e) => `${e.filial}_${e.data}_${e.ordem}`),
    ['01_2025-03-10_1', '01_2025-03-10_2', '02_2025-03-10_1', '01_2025-03-11_1'],
  )
})

/**
 * Filial nova é a §9.4 desatualizada, não linha a ignorar: a carga recusa **e diz
 * qual código apareceu**, para a decisão ser de quem mantém a lista.
 */
test('filial desconhecida é recusada com o código no motivo', () => {
  const r = lerRelatorioDeEntregas(
    aba([CABECALHO, entrega(SERIE_10_MAR_2025, '04', 10, 20)]),
    PARAMETROS,
  )

  assert.equal(r.entregas.length, 0)
  assert.equal(r.descartadas.length, 1)
  assert.match(r.descartadas[0].motivo, /"04"/)
})

/**
 * **O caso que motivou a leitura estrita de medida.**
 *
 * `"1.701"` em texto é um quilômetro e setecentos metros para esta origem e mil
 * setecentos e um para a limpeza de separador brasileiro que o leitor do marítimo
 * usa. Não há como decidir sem olhar a origem, então a linha é recusada em vez de
 * adivinhada — mil vezes a distância passaria como número plausível.
 */
test('texto em coluna de medida recusa a linha em vez de adivinhar a unidade', () => {
  const r = lerRelatorioDeEntregas(
    aba([
      CABECALHO,
      entrega(SERIE_10_MAR_2025, '01', '1.701', 20),
      entrega(SERIE_10_MAR_2025, '01', 10, '1.234'),
    ]),
    PARAMETROS,
  )

  assert.equal(r.entregas.length, 0)
  assert.equal(r.descartadas.length, 2)
  for (const d of r.descartadas) assert.match(d.motivo, /texto/)
})

test('medida negativa e data ilegível recusam a linha, cada uma com motivo', () => {
  const r = lerRelatorioDeEntregas(
    aba([
      CABECALHO,
      entrega(SERIE_10_MAR_2025, '01', -5, 20),
      entrega('não é data', '01', 10, 20),
      entrega(1234, '01', 10, 20),
    ]),
    PARAMETROS,
  )

  assert.equal(r.entregas.length, 0)
  assert.equal(r.descartadas.length, 3)
  assert.match(r.descartadas[0].motivo, /negativ/)
  assert.match(r.descartadas[1].motivo, /data/)
  // Número fora da faixa de datas não é data: seria 1903 sem nada parecer errado.
  assert.match(r.descartadas[2].motivo, /data/)
})

test('entrega sem código de cliente entra com o campo nulo, e é contada', () => {
  const r = lerRelatorioDeEntregas(
    aba([CABECALHO, entrega(SERIE_10_MAR_2025, '01', 10, 20, null)]),
    PARAMETROS,
  )

  assert.equal(r.entregas.length, 1)
  assert.equal(r.entregas[0].clienteCodigo, null)
  assert.equal(r.semCodigoDoCliente, 1)
})

/* -------------------------------------------------------------------- abas */

test('aba sem cabeçalho de entregas é ignorada pelo nome', () => {
  const r = lerRelatorioDeEntregas(
    [
      { nome: 'Config', linhas: [['ordenar por', 'data']] },
      { nome: 'Export', linhas: [CABECALHO, entrega(SERIE_10_MAR_2025, '01', 10, 20)] },
    ],
    PARAMETROS,
  )

  assert.deepEqual(r.ignoradas, ['Config'])
  assert.equal(r.aba, 'Export')
})

/**
 * Escolher a primeira e ignorar a segunda seria uma fonte inteira ficando de fora
 * do inventário sem nada parecer errado — o defeito que já custou duas vezes
 * neste projeto (§8.4).
 */
test('duas abas de entregas param a leitura em vez de uma virar a fonte', () => {
  const duas: AbaLida[] = [
    { nome: 'Export 1', linhas: [CABECALHO, entrega(SERIE_10_MAR_2025, '01', 10, 20)] },
    { nome: 'Export 2', linhas: [CABECALHO, entrega(SERIE_10_MAR_2025, '02', 10, 20)] },
  ]

  assert.throws(() => lerRelatorioDeEntregas(duas, PARAMETROS), /Export 1, Export 2/)
})

test('arquivo sem cabeçalho de entregas para a carga', () => {
  assert.throws(
    () => lerRelatorioDeEntregas(aba([['alguma', 'coisa']]), PARAMETROS),
    /cabeçalho/,
  )
})

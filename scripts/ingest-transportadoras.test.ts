/**
 * A montagem dos documentos de entrega — `scripts/ingest-transportadoras.ts`.
 *
 * O teste da leitura mora em `src/lib/transportadoras.test.ts`; aqui se confere
 * o que vira documento: envelope, identidade, carimbo do fator e as duas
 * declarações do módulo.
 *
 * **A guarda central é a de que esta carga não emite alerta**, e ela não é
 * estética: é o que permite ao resumo da tela não reler a coleção
 * inteira só para contar avisos (ver `metodo.ts`). O que a leitura não
 * entende, ela recusa com motivo, e a recusa é contada na conferência de
 * cobertura. **No dia em que a carga passar a emitir alerta, este teste reprova
 * e o resumo precisa voltar a ler a coleção** — que é exatamente o aviso que uma
 * decisão dessas precisa deixar para trás.
 *
 * **Massa fictícia** (§2.2), e o fator é um número redondo inventado: o valor
 * real vem da coleção, com fonte e vigência (§10.8).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { AbaLida, CelulaBruta } from '../src/lib/planilha'
import type { FatorAplicado } from '../src/server/documentos/tipos'
import { montarEntregas } from './ingest-transportadoras'

const PARAMETROS = { distanciaMaximaKm: 6000 }

const FATOR: FatorAplicado = {
  categoria: 'frete_rodoviario_tkm',
  chave: 'geral',
  versao: 'ficticia-1',
  valor: 0.1,
  unidade: 'kg CO2e por tonelada-quilometro',
  vigenciaInicio: '2031-01-01',
}

const CABECALHO = ['Data', 'Filial', 'Código', 'Cliente', 'Distância (km)', 'Peso Bruto']

/** 2031-03-10 em número de série do Excel. */
const SERIE = 47917

function abas(linhas: CelulaBruta[][]): AbaLida[] {
  return [{ nome: 'Export', linhas: [CABECALHO, ...linhas] }]
}

function linha(
  filial: string,
  distancia: number,
  peso: number,
  serie = SERIE,
): CelulaBruta[] {
  return [serie, filial, '11111 01', 'CLIENTE FICTÍCIO LTDA', distancia, peso]
}

test('a entrega vira documento com envelope, identidade e fator carimbado', () => {
  const m = montarEntregas(abas([linha('02', 100, 2000)]), PARAMETROS, () => FATOR)

  assert.equal(m.documentos.length, 1)
  const { id, dados } = m.documentos[0]

  assert.equal(id, '02_2031-03-10_1')
  assert.equal(dados.modulo, 'transportadoras')
  assert.equal(dados.modal, 'rodoviario')
  assert.equal(dados.escopo, 3)
  assert.equal(dados.periodicidade, 'evento')
  assert.equal(dados.ano, 2031)
  assert.equal(dados.mes, '2031-03')
  assert.equal(dados.empresa, null)
  assert.deepEqual(dados.fator, FATOR)
  // Duas toneladas por cem quilômetros, a 0,1 kg por t.km.
  assert.equal(dados.co2Kg, 20)
})

/**
 * As duas declarações do módulo viajam no documento, e não numa constante da
 * tela: `regimeFrete` registra que a origem não separa CIF de FOB (§9.1), e
 * `nivelDado` que o número é calculado, não medido (§9.2).
 */
test('todo documento declara regime de frete e nível de dado', () => {
  const m = montarEntregas(
    abas([linha('01', 50, 1000), linha('03', 70, 1500)]),
    PARAMETROS,
    () => FATOR,
  )

  for (const { dados } of m.documentos) {
    assert.equal(dados.regimeFrete, 'indefinido')
    assert.equal(dados.nivelDado, 'calculado_tkm')
  }
})

/**
 * **A guarda que sustenta a decisão do resumo.** Ver o cabeçalho deste arquivo.
 */
test('a carga não emite alerta nenhum', () => {
  const m = montarEntregas(
    abas([
      linha('01', 10, 100),
      linha('02', 5900, 200),
      // Estas três não viram documento, e também não viram alerta: a primeira é
      // internacional, a segunda não tem cliente e a terceira tem filial
      // desconhecida.
      linha('02', 12345, 300),
      [SERIE, '02', null, null, null, null],
      linha('04', 10, 100),
    ]),
    PARAMETROS,
    () => FATOR,
  )

  assert.equal(m.documentos.length, 2)
  for (const { dados } of m.documentos) {
    assert.deepEqual(dados.alertas, [])
    assert.deepEqual(dados.alertasCodigos, [])
  }
  // E o que ficou de fora está contado, com motivo onde há motivo.
  assert.equal(m.relatorio.internacionais.linhas, 1)
  assert.equal(m.relatorio.semCliente, 1)
  assert.equal(m.relatorio.descartadas.length, 1)
})

test('sem fator, a montagem lê e não produz documento', () => {
  const m = montarEntregas(abas([linha('01', 10, 100)]), PARAMETROS, null)

  assert.equal(m.documentos.length, 0)
  assert.equal(m.relatorio.entregas.length, 1)
  assert.equal(m.fator, null)
  // O relatório da simulação continua tendo o que conferir antes do fator existir.
  assert.deepEqual(m.anos, [2031])
  assert.equal(m.porFilial.get('01')?.entregas, 1)
})

test('o escopo de recarga sai da carga: um ano por vez, todos os que vieram', () => {
  const m = montarEntregas(
    abas([linha('01', 10, 100), linha('01', 10, 100, SERIE + 400)]),
    PARAMETROS,
    () => FATOR,
  )

  assert.deepEqual(m.anos, [2031, 2032])
  assert.deepEqual(
    m.documentos.map((d) => d.id),
    ['01_2031-03-10_1', '01_2032-04-13_1'],
  )
})

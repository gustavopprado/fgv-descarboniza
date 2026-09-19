/**
 * Testes da carga marítima — CLAUDE.md §8.1.1, §8.2, §8.3.
 *
 * **Estas guardas nascem com zero documentos no banco**, e é por isso que elas
 * têm teste próprio em vez de conferência contra a base: o limiar de linha
 * impossível não recusa nada hoje, e a flag de previsão, depois da derivação
 * por grau, marca pouquíssimo. **Guarda que nunca disparou é guarda que ninguém
 * sabe se morde** — então cada uma é exercitada contra linha fabricada, e
 * também com a regra desligada, para a aprovação não ser acidente.
 *
 * **Toda a massa é fictícia, inventada do zero** (§2.2): nenhum nome de agente,
 * de porto, de navio ou de empresa, e nenhum número, sai de base real.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { AbaLida, CelulaBruta } from '../src/lib/maritimo'
import type { DocPorto } from '../src/server/documentos/tipos'
import { montarEmbarques, type Parametros } from './ingest-maritimo'

/* --------------------------------------------------------------- fixtures */

const COLUNAS = [
  'CO2',
  'STATUS 2.0',
  'Shipment ID',
  'Trans',
  'Mode',
  'Origin Name',
  'Destination Name',
  'House Ref',
  'Weight',
  'UQ',
  'Volume',
  'UQ',
  'First Load',
  'Last Discharge',
  'ETD First Load',
  'ETA Last Discharge',
  '',
  'Container Type',
  'Vessel Partida',
  'ETD Partida',
  'ATD Partida',
  'ATA Partida',
  'Vessel Transbordo',
  'JW_ATALast',
]

/** Um porto fictício em cada ponta, para o cadastro não gerar alerta. */
const PORTOS = new Map<string, DocPorto>([
  [
    'XAAAA',
    {
      locode: 'XAAAA',
      nome: 'LUGAR FICTICIO A',
      pais: 'XA',
      subdivisao: null,
      latitude: 10,
      longitude: 20,
      funcao: '1-------',
      ehPorto: true,
      fonte: 'ficticia',
    },
  ],
  [
    'XBBBB',
    {
      locode: 'XBBBB',
      nome: 'LUGAR FICTICIO B',
      pais: 'XB',
      subdivisao: null,
      latitude: -10,
      longitude: -20,
      funcao: '1-------',
      ehPorto: true,
      fonte: 'ficticia',
    },
  ],
])

const PARAMETROS: Parametros = {
  limiarAtipico: 4,
  limiarImpossivel: 100,
  amostraMinimaDoCorredor: 3,
}

function linha(campos: Record<string, CelulaBruta> = {}): CelulaBruta[] {
  const base: Record<string, CelulaBruta> = {
    CO2: 1000,
    'Shipment ID': 'ZZ-0001',
    Trans: 'SEA',
    Mode: 'FCL',
    'Origin Name': 'LUGAR FICTICIO A',
    'Destination Name': 'LUGAR FICTICIO B',
    Weight: 5000,
    Volume: 30,
    'First Load': 'XAAAA',
    'Last Discharge': 'XBBBB',
    'ETD First Load': new Date(Date.UTC(2031, 2, 10)),
    'ETA Last Discharge': new Date(Date.UTC(2031, 3, 20)),
    'Container Type': '1x40NOR',
    'ATD Partida': new Date(Date.UTC(2031, 2, 11)),
    ...campos,
  }
  const contagem = 'contagem' in campos ? campos.contagem : 1
  return COLUNAS.map((nome) => (nome === '' ? (contagem ?? null) : (base[nome] ?? null)))
}

/** Um bloco com as linhas dadas, mais um lastro de linhas normais. */
function bloco(extras: CelulaBruta[][], lastro = 4): AbaLida {
  const linhas: CelulaBruta[][] = [COLUNAS]
  for (let i = 0; i < lastro; i++) {
    linhas.push(linha({ 'Shipment ID': `ZZ-L${i}`, CO2: 1000 + i * 10 }))
  }
  linhas.push(...extras)
  return { nome: 'XX_2031', linhas }
}

/* ------------------------------------------------------- linha impossível */

test('linha impossível não é importada, e o limiar é o que a recusa', () => {
  // A ordem de grandeza não pertence ao módulo — o sintoma típico é fórmula
  // errada na origem. Um número desses sozinho domina o total e torna todo o
  // resto invisível (§8.1.1).
  const abas = [bloco([linha({ 'Shipment ID': 'ZZ-ABSURDO', CO2: 1_000_000_000 })])]

  const comLimiar = montarEmbarques(abas, PORTOS, PARAMETROS)
  const recusada = comLimiar.recusas.find((r) => r.shipmentId === 'ZZ-ABSURDO')
  assert.ok(recusada, 'a linha impossível precisa ser recusada')
  assert.match(recusada.motivo, /ordem de grandeza/)
  assert.ok(!comLimiar.documentos.some((d) => d.dados.shipmentId === 'ZZ-ABSURDO'))
  // E a recusa é anunciada, nunca silenciosa: ela é a diferença que a cobertura
  // conta entre origem e banco (§8.1.1).
  assert.equal(comLimiar.documentos.length + comLimiar.recusas.length, 5)

  // **Com a guarda desligada, a mesma linha entra** — é ela que recusa, e não
  // algum outro filtro que passaria a impressão de estar funcionando.
  const semLimiar = montarEmbarques(abas, PORTOS, {
    ...PARAMETROS,
    limiarImpossivel: 10_000_000,
  })
  assert.ok(semLimiar.documentos.some((d) => d.dados.shipmentId === 'ZZ-ABSURDO'))
  assert.equal(semLimiar.recusas.length, 0)
})

test('a linha impossível é medida contra a mediana geral, não contra o corredor', () => {
  // Ela costuma estar sozinha no corredor dela, e um corredor de uma linha só
  // tem essa linha como mediana: a comparação por corredor passaria justamente
  // onde precisava reprovar (§8.1.1).
  const sozinhaNoCorredor = linha({
    'Shipment ID': 'ZZ-SOZINHA',
    CO2: 1_000_000_000,
    'First Load': 'XBBBB',
    'Last Discharge': 'XAAAA',
  })
  const m = montarEmbarques([bloco([sozinhaNoCorredor])], PORTOS, PARAMETROS)
  assert.ok(m.recusas.some((r) => r.shipmentId === 'ZZ-SOZINHA'))
})

/* -------------------------------------------------------------- previsão */

test('embarque sem data nenhuma é previsão, e não vira documento', () => {
  // Grau conclusivo: a reserva existe, a viagem não. Sem data não há período a
  // que atribuí-lo, então ele é recusado — com motivo, e contado pela cobertura.
  const semData = linha({
    'Shipment ID': 'ZZ-PREVISTO',
    'ETD First Load': null,
    'ETA Last Discharge': null,
    'ATD Partida': null,
    'First Load': null,
    'Last Discharge': null,
  })
  const m = montarEmbarques([bloco([semData])], PORTOS, PARAMETROS)

  assert.ok(!m.documentos.some((d) => d.dados.shipmentId === 'ZZ-PREVISTO'))
  const recusada = m.recusas.find((r) => r.shipmentId === 'ZZ-PREVISTO')
  assert.ok(recusada)
  assert.match(recusada.motivo, /previsão|período/)
  assert.equal(m.documentos.length + m.recusas.length, 5)
})

test('previsão com itinerário vira documento marcado, e a flag chega ao banco', () => {
  // É o caso que o arquivo de hoje não tem e o próximo vai ter: viagem
  // agendada, CO₂ já lançado, partida marcada para depois do fim do arquivo.
  // Aqui há período, então ele é gravado — com a flag, que é o que permite
  // deixá-lo fora do total sem perder o registro (§8.3).
  const agendado = linha({
    'Shipment ID': 'ZZ-AGENDADO',
    'ETD First Load': new Date(Date.UTC(2032, 8, 1)),
    'ETA Last Discharge': new Date(Date.UTC(2032, 9, 1)),
    'ATD Partida': null,
  })
  const m = montarEmbarques([bloco([agendado])], PORTOS, PARAMETROS)

  const doc = m.documentos.find((d) => d.dados.shipmentId === 'ZZ-AGENDADO')
  assert.ok(doc, 'embarque com período precisa virar documento, mesmo sendo previsão')
  assert.equal(doc.dados.previsao, true)
  assert.ok(doc.dados.alertasCodigos.includes('embarque_previsto'))
  // O lastro continua realizado: a flag marca a linha, não o bloco.
  assert.equal(m.documentos.filter((d) => d.dados.previsao).length, 1)
})

test('o que sustenta a flag fica gravado, senão ela não é reproduzível', () => {
  // Um aéreo que chegou não é previsão, e o que prova isso é a chegada final —
  // a única coluna de fato que este modal tem. Sem ela no documento, quem
  // conferir depois vê um embarque sem partida efetiva e não sabe por quê.
  const aereo = linha({
    'Shipment ID': 'ZZ-AEREO',
    Trans: 'AIR',
    Mode: 'LSE',
    contagem: null,
    'Container Type': null,
    'ATD Partida': null,
    JW_ATALast: new Date(Date.UTC(2031, 2, 12)),
  })
  const m = montarEmbarques([bloco([aereo])], PORTOS, PARAMETROS)
  const doc = m.documentos.find((d) => d.dados.shipmentId === 'ZZ-AEREO')
  assert.ok(doc)
  assert.equal(doc.dados.previsao, false)
  assert.equal(doc.dados.ataFinal, '2031-03-12')
  assert.equal(doc.dados.modal, 'aereo')
})

/* ------------------------------------------------- aéreo fora da cascata */

test('o frete aéreo não entra nas referências por contêiner', () => {
  // A unidade da cascata é CO₂ por contêiner, e frete aéreo não tem contêiner:
  // onde a coluna numérica traz um número para carga aérea, ela está contando
  // volumes. Uma média que o incluísse mediria duas coisas na mesma conta.
  const aereoCaro = linha({
    'Shipment ID': 'ZZ-AEREO',
    Trans: 'AIR',
    Mode: 'LSE',
    CO2: 90_000,
    contagem: 1,
    'Container Type': null,
    'ATD Partida': null,
    JW_ATALast: new Date(Date.UTC(2031, 2, 12)),
  })
  const semCo2 = linha({ 'Shipment ID': 'ZZ-ESTIMAR', CO2: null, contagem: 2 })

  const m = montarEmbarques([bloco([aereoCaro, semCo2])], PORTOS, PARAMETROS)
  const estimado = m.documentos.find((d) => d.dados.shipmentId === 'ZZ-ESTIMAR')
  assert.ok(estimado)
  assert.equal(estimado.dados.nivelDado, 'estimado_corredor')

  // O lastro tem quatro linhas marítimas de 1000, 1010, 1020 e 1030 por um
  // contêiner cada: a média do corredor é 1015, e a estimativa é ela vezes dois.
  // Com o aéreo dentro da conta o valor seria outro, e muito maior.
  assert.equal(estimado.dados.co2Kg, 2030)
  assert.equal(estimado.dados.fator?.valor, 1015)
  assert.equal(estimado.dados.baseDaEstimativa, 4)
})

test('frete aéreo sem CO₂ do agente é recusado, nunca estimado', () => {
  // Não há degrau aéreo na cascata, e estimá-lo por referência marítima erraria
  // por ordem de grandeza. O agente informa, ou o embarque não entra.
  const aereoSemCo2 = linha({
    'Shipment ID': 'ZZ-AEREO-SEM',
    Trans: 'AIR',
    Mode: 'LSE',
    CO2: null,
    contagem: 1,
    'Container Type': null,
    'ATD Partida': null,
    JW_ATALast: new Date(Date.UTC(2031, 2, 12)),
  })
  const m = montarEmbarques([bloco([aereoSemCo2])], PORTOS, PARAMETROS)
  assert.ok(!m.documentos.some((d) => d.dados.shipmentId === 'ZZ-AEREO-SEM'))
  const recusada = m.recusas.find((r) => r.shipmentId === 'ZZ-AEREO-SEM')
  assert.ok(recusada)
  assert.match(recusada.motivo, /aéreo/)
})

/* ---------------------------------------------------------- linha atípica */

test('linha atípica entra no total, com alerta — e o limiar é folgado', () => {
  // Contêiner pouco carregado, carga solta e embarque partido produzem este
  // sintoma, e todos são emissão verdadeira. Tirá-la seria remover emissão real
  // do inventário por ser incomum (§8.1.1).
  const destoante = linha({ 'Shipment ID': 'ZZ-ATIPICA', CO2: 9000, contagem: 1 })
  const m = montarEmbarques([bloco([destoante])], PORTOS, PARAMETROS)

  const doc = m.documentos.find((d) => d.dados.shipmentId === 'ZZ-ATIPICA')
  assert.ok(doc, 'a linha atípica precisa entrar')
  assert.equal(doc.dados.co2Kg, 9000, 'e entrar com o número do agente, sem recálculo')
  assert.ok(doc.dados.alertasCodigos.includes('co2_por_container_atipico'))

  // Com o limiar folgado o bastante, a mesma linha não é marcada: é ele que
  // marca, e não uma regra fixa escondida no código.
  const frouxo = montarEmbarques([bloco([destoante])], PORTOS, {
    ...PARAMETROS,
    limiarAtipico: 50,
  })
  const mesmoDoc = frouxo.documentos.find((d) => d.dados.shipmentId === 'ZZ-ATIPICA')
  assert.ok(!mesmoDoc!.dados.alertasCodigos.includes('co2_por_container_atipico'))
})

/* ---------------------------------------------------- bloco sem detalhe */

test('aba de agente sem detalhe é fonte ausente, e não se confunde com template', () => {
  // As duas caem na mesma pilha de abas não lidas. Tratá-las igual é o silêncio
  // que a §8.4 existe para impedir: um agente inteiro fora do inventário
  // pareceria, no relatório, igual a lixo do sistema de origem.
  const m = montarEmbarques(
    [
      bloco([]),
      { nome: 'YY_2031', linhas: [[], [null, null, 'Total de toneladas', 1234]] },
      { nome: 'Optional Templates', linhas: [['Shipment Profile'], ['#end']] },
    ],
    PORTOS,
    PARAMETROS,
  )
  assert.deepEqual(m.semDetalhe, ['YY_2031'])
  assert.deepEqual(m.ignoradas, ['Optional Templates'])
})

/**
 * Testes da leitura do relatório do agente de carga — §8.3.
 *
 * Cada teste aqui existe por causa de uma armadilha concreta da §8.3, e o nome
 * diz qual. **Toda a massa é fictícia, inventada do zero** (§2.2): nenhum nome
 * de agente, de porto, de navio ou de empresa, e nenhum número, sai de base
 * real.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  agenteDoBloco,
  ALERTA_CARGA_AEREA,
  ALERTA_CONTAGEM_POR_TIPO,
  ALERTA_EMBARQUE_PREVISTO,
  ALERTA_SEM_CONTAGEM_DE_CONTAINER,
  ALERTA_SEM_DATA_EFETIVA,
  ALERTA_SEM_LOCODE,
  contarPeloTipo,
  corredorDe,
  dataDeReferencia,
  lerAbaMaritima,
  lerRelatorioMaritimo,
  localizarCabecalho,
  mediana,
  type AbaLida,
  type CelulaBruta,
} from './maritimo'

/* --------------------------------------------------------------- fixtures */

/**
 * Cabeçalho de uma aba de detalhe. A coluna vazia entre a data de chegada e o
 * tipo de contêiner é a coluna numérica sem nome — ela não tem rótulo no export.
 */
const COLUNAS_COM_CONTAGEM = [
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

/** A mesma aba com uma coluna a mais no meio, que desloca todas as seguintes. */
const COLUNAS_COM_EMPRESA = [
  'CO2',
  'Consignee Name',
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
  'Container Type',
  'Vessel Partida',
  'ETD Partida',
  'ATD Partida',
  'ATA Partida',
  'Vessel Transbordo',
  'JW_ATALast',
]

function linhaComContagem(campos: Partial<Record<string, CelulaBruta>> = {}): CelulaBruta[] {
  const base: Record<string, CelulaBruta> = {
    CO2: 1000,
    'Shipment ID': 'ZZ-0001',
    Trans: 'SEA',
    Mode: 'FCL',
    'Origin Name': 'LUGAR FICTICIO A',
    'Destination Name': 'LUGAR FICTICIO B',
    'House Ref': 'REF-0001',
    Weight: 5000,
    Volume: 30,
    'First Load': 'XAAAA',
    'Last Discharge': 'XBBBB',
    'ETD First Load': new Date(Date.UTC(2031, 2, 10)),
    'ETA Last Discharge': new Date(Date.UTC(2031, 3, 20)),
    'Container Type': '1x40NOR',
    'Vessel Partida': 'NAVIO FICTICIO',
    'ATD Partida': new Date(Date.UTC(2031, 2, 11)),
    ...campos,
  }
  const contagem = 'contagem' in campos ? campos.contagem : 1
  return COLUNAS_COM_CONTAGEM.map((nome, i) =>
    nome === '' ? (contagem ?? null) : (base[nome] ?? null),
  )
}

function aba(nome: string, linhas: CelulaBruta[][]): AbaLida {
  return { nome, linhas }
}

/* ---------------------------------------------------------------- cabeçalho */

test('o cabeçalho é localizado pelo conteúdo, em qualquer linha', () => {
  // Ele muda de posição entre as abas do mesmo arquivo (§8.3).
  assert.equal(localizarCabecalho([COLUNAS_COM_CONTAGEM]), 0)
  assert.equal(
    localizarCabecalho([['Relatório Fictício'], ['12 processos'], [], COLUNAS_COM_EMPRESA]),
    3,
  )
  // A comparação ignora caixa e espaço repetido.
  assert.equal(
    localizarCabecalho([
      ['co2', '  shipment   id  ', 'trans', 'mode', 'weight', 'first load'],
    ]),
    0,
  )
})

test('o identificador sozinho não faz uma aba ser de detalhe', () => {
  // O sistema de origem guarda a configuração de ordenação numa aba cuja
  // primeira célula é o **nome do campo** identificador. Lida como cabeçalho,
  // ela produzia um bloco fantasma cujos identificadores eram nomes de campo —
  // e cada linha virava recusa declarada dentro da conferência de cobertura,
  // que é onde ruído custa mais caro.
  const configuracao = [
    ['Shipment ID', 'ShipmentID', 'default'],
    ['Campo Fictício', 'CodigoFicticio,ShipmentID', ''],
    ['#end', '', ''],
  ]
  assert.equal(localizarCabecalho(configuracao), -1)
  assert.equal(lerAbaMaritima(aba('Sort', configuracao)), null)

  // E a regra continua sendo de forma: uma aba de agente novo, com menos
  // colunas que o export completo, continua nascendo lida.
  assert.equal(
    localizarCabecalho([
      ['Shipment ID', 'CO2', 'Trans', 'Mode', 'Weight', 'ETD First Load'],
    ]),
    0,
  )
})

test('aba sem a coluna identificadora não é de detalhe, e isso descarta os templates', () => {
  // Não há lista de nomes de aba no código: template novo nasce ignorado e aba
  // de agente novo nasce lida (§8.3).
  assert.equal(localizarCabecalho([['Optional Templates'], ['a', 'b']]), -1)
  assert.equal(lerAbaMaritima(aba('Sort', [['coluna'], ['valor']])), null)

  const { blocos, ignoradas } = lerRelatorioMaritimo([
    aba('XX_2031', [COLUNAS_COM_CONTAGEM, linhaComContagem()]),
    aba('Filter', [['a'], ['b']]),
    aba('Resumo Fictício', [['total'], [10]]),
  ])
  assert.equal(blocos.length, 1)
  // As ignoradas voltam nominalmente: uma aba de agente sem detalhe precisa
  // aparecer no relatório da carga em vez de sumir junto com os templates.
  assert.deepEqual(ignoradas, ['Filter', 'Resumo Fictício'])
})

test('o agente sai do nome da aba, antes do primeiro sublinhado', () => {
  assert.equal(agenteDoBloco('XX_2031'), 'XX')
  assert.equal(agenteDoBloco('XX_2031_revisado'), 'XX')
  assert.equal(agenteDoBloco('SemSublinhado'), 'SemSublinhado')
})

/* ------------------------------------------------------- colunas e descartes */

test('coluna ausente é ausente, não erro fatal', () => {
  // A aba com contagem não tem a coluna de empresa; a outra tem. Ler por nome é
  // o que faz o deslocamento não importar (§8.3).
  const semEmpresa = lerAbaMaritima(aba('XX_2031', [COLUNAS_COM_CONTAGEM, linhaComContagem()]))!
  assert.equal(semEmpresa.embarques[0].empresa, null)

  const linha = COLUNAS_COM_EMPRESA.map((nome) =>
    nome === 'Consignee Name'
      ? 'Empresa Fictícia'
      : nome === 'Shipment ID'
        ? 'ZZ-0002'
        : nome === 'CO2'
          ? 2000
          : nome === 'First Load'
            ? 'XAAAA'
            : nome === 'Last Discharge'
              ? 'XBBBB'
              : nome === 'ETD First Load'
                ? new Date(Date.UTC(2031, 2, 10))
                : nome === 'ATD Partida'
                  ? new Date(Date.UTC(2031, 2, 11))
                  : nome === 'Container Type'
                    ? '2x20GP'
                    : null,
  )
  const comEmpresa = lerAbaMaritima(aba('XX_2030', [COLUNAS_COM_EMPRESA, linha]))!
  assert.equal(comEmpresa.embarques[0].empresa, 'Empresa Fictícia')
  // O deslocamento não levou a data junto.
  assert.equal(comEmpresa.embarques[0].etd, '2031-03-10')
})

test('linha de total dentro dos dados é descartada, e o descarte é registrado', () => {
  // Descartar em silêncio transformaria erro de leitura em cobertura correta.
  const bloco = lerAbaMaritima(
    aba('XX_2031', [
      COLUNAS_COM_CONTAGEM,
      linhaComContagem(),
      // Linha de total: ocupa colunas de dado e não tem identificador.
      COLUNAS_COM_CONTAGEM.map((n) => (n === 'CO2' ? 99999 : n === 'Weight' ? 88888 : null)),
      // Linha inteiramente vazia não conta como descarte: não é perda.
      COLUNAS_COM_CONTAGEM.map(() => null),
    ]),
  )!
  assert.equal(bloco.embarques.length, 1)
  assert.equal(bloco.descartadas.length, 1)
  assert.match(bloco.descartadas[0].motivo, /identificador/)
})

/* --------------------------------------------------------------- contêineres */

test('a contagem numérica vence o parse do texto de tipo', () => {
  const bloco = lerAbaMaritima(
    aba('XX_2031', [
      COLUNAS_COM_CONTAGEM,
      linhaComContagem({ contagem: 3, 'Container Type': '1x40NOR' }),
    ]),
  )!
  const embarque = bloco.embarques[0]
  assert.equal(embarque.containers, 3)
  assert.equal(embarque.containersFonte, 'coluna')
  assert.ok(!embarque.alertas.some((a) => a.tipo === ALERTA_CONTAGEM_POR_TIPO))
})

test('sem a coluna numérica, a contagem sai do texto — e fica dito que saiu', () => {
  // A aba com empresa não tem a coluna sem nome: ali o único caminho é o texto.
  const linha = COLUNAS_COM_EMPRESA.map((nome) =>
    nome === 'Shipment ID'
      ? 'ZZ-0003'
      : nome === 'CO2'
        ? 3000
        : nome === 'Container Type'
          ? '2x20GP 1x40HC'
          : nome === 'ETD First Load'
            ? new Date(Date.UTC(2031, 2, 10))
            : nome === 'ATD Partida'
              ? new Date(Date.UTC(2031, 2, 11))
              : nome === 'First Load'
                ? 'XAAAA'
                : nome === 'Last Discharge'
                  ? 'XBBBB'
                  : null,
  )
  const bloco = lerAbaMaritima(aba('XX_2030', [COLUNAS_COM_EMPRESA, linha]))!
  assert.equal(bloco.embarques[0].containers, 3)
  assert.equal(bloco.embarques[0].containersFonte, 'tipo')
  assert.ok(bloco.embarques[0].alertas.some((a) => a.tipo === ALERTA_CONTAGEM_POR_TIPO))
})

test('sem contagem por nenhum caminho, o campo é nulo — nunca zero', () => {
  // Zero afirmaria que o embarque não levou contêiner nenhum. É o caso da carga
  // solta e do frete aéreo.
  const bloco = lerAbaMaritima(
    aba('XX_2031', [
      COLUNAS_COM_CONTAGEM,
      linhaComContagem({ contagem: null, 'Container Type': null }),
    ]),
  )!
  assert.equal(bloco.embarques[0].containers, null)
  assert.equal(bloco.embarques[0].containersFonte, null)
  assert.ok(bloco.embarques[0].alertas.some((a) => a.tipo === ALERTA_SEM_CONTAGEM_DE_CONTAINER))
})

test('o texto de tipo soma todos os grupos', () => {
  assert.equal(contarPeloTipo('1x40NOR'), 1)
  assert.equal(contarPeloTipo('2x20GP 1x40HC'), 3)
  assert.equal(contarPeloTipo('3 x 40 NOR'), 3)
  assert.equal(contarPeloTipo(null), null)
  assert.equal(contarPeloTipo(''), null)
  assert.equal(contarPeloTipo('sem número'), null)
})

/* ------------------------------------------------------------------ previsão */

test('previsão: só o grau conclusivo sai do total, e ele não olha o modal', () => {
  // Grau 1, por ausência total de data: a reserva existe, a viagem não.
  const semData = lerAbaMaritima(
    aba('XX_2031', [
      COLUNAS_COM_CONTAGEM,
      linhaComContagem({
        'ETD First Load': null,
        'ETA Last Discharge': null,
        'ATD Partida': null,
      }),
    ]),
  )!
  assert.equal(semData.embarques[0].realizacao, 'previsto')
  assert.equal(semData.embarques[0].previsao, true)
  assert.ok(semData.embarques[0].alertas.some((a) => a.tipo === ALERTA_EMBARQUE_PREVISTO))

  // Grau 3: partiu, e está lançado.
  const partiu = lerAbaMaritima(aba('XX_2031', [COLUNAS_COM_CONTAGEM, linhaComContagem()]))!
  assert.equal(partiu.embarques[0].realizacao, 'realizado')
  assert.equal(partiu.embarques[0].previsao, false)
})

test('grau 2 continua no total: falta de lançamento não prova que não aconteceu', () => {
  // Tem itinerário e data prevista, nenhuma data de fato, e a partida prevista
  // já passou em relação ao fim do arquivo. Pode ter acontecido sem ninguém
  // digitar — e descartar emissão real por falta de digitação é erro maior que
  // incluir uma previsão.
  const bloco = lerAbaMaritima(
    aba('XX_2031', [COLUNAS_COM_CONTAGEM, linhaComContagem({ 'ATD Partida': null })]),
    '2031-12-31',
  )!
  assert.equal(bloco.embarques[0].realizacao, 'sem_data_efetiva')
  assert.equal(bloco.embarques[0].previsao, false)
  assert.ok(bloco.embarques[0].alertas.some((a) => a.tipo === ALERTA_SEM_DATA_EFETIVA))
})

test('o aéreo não é marcado por uma coluna que o modal dele nunca preenche', () => {
  // A coluna de partida é de navio. Uma derivação que lesse só ela marcaria todo
  // frete aéreo como não realizado — e, como previsão fica fora do total,
  // descartaria emissão verdadeira. A chegada final é a prova que o aéreo tem.
  const aereo = lerAbaMaritima(
    aba('XX_2031', [
      COLUNAS_COM_CONTAGEM,
      linhaComContagem({
        Trans: 'AIR',
        Mode: 'LSE',
        'ATD Partida': null,
        JW_ATALast: new Date(Date.UTC(2031, 2, 12)),
      }),
    ]),
    '2031-12-31',
  )!
  assert.equal(aereo.embarques[0].realizacao, 'realizado')
  assert.equal(aereo.embarques[0].previsao, false)

  // O marítimo tem três provas possíveis: a chegada de navio também serve.
  const maritimo = lerAbaMaritima(
    aba('XX_2031', [
      COLUNAS_COM_CONTAGEM,
      linhaComContagem({
        'ATD Partida': null,
        'ATA Partida': new Date(Date.UTC(2031, 2, 13)),
      }),
    ]),
    '2031-12-31',
  )!
  assert.equal(maritimo.embarques[0].realizacao, 'realizado')

  // E o aéreo sem nenhuma chegada lançada cai no grau 2 — nunca em previsão —,
  // com o alerta dizendo por que a ausência não conclui nada neste modal.
  const semProva = lerAbaMaritima(
    aba('XX_2031', [
      COLUNAS_COM_CONTAGEM,
      linhaComContagem({ Trans: 'AIR', Mode: 'LSE', 'ATD Partida': null }),
    ]),
    '2031-12-31',
  )!
  assert.equal(semProva.embarques[0].realizacao, 'sem_data_efetiva')
  assert.equal(semProva.embarques[0].previsao, false)
  assert.match(
    semProva.embarques[0].alertas.find((a) => a.tipo === ALERTA_SEM_DATA_EFETIVA)!.descricao,
    /aéreo/,
  )
})

test('partida marcada para depois do fim do arquivo é previsão, mesmo com itinerário', () => {
  // É o caso que o arquivo de hoje não tem e o próximo vai ter: viagem
  // agendada, CO₂ já lançado, nada aconteceu ainda.
  const abaDoBloco = aba('XX_2031', [
    COLUNAS_COM_CONTAGEM,
    // Esta partiu, e é ela que diz até quando o arquivo enxerga.
    linhaComContagem(),
    linhaComContagem({
      'Shipment ID': 'ZZ-0002',
      'ETD First Load': new Date(Date.UTC(2032, 5, 1)),
      'ETA Last Discharge': new Date(Date.UTC(2032, 6, 1)),
      'ATD Partida': null,
    }),
  ])
  const { blocos, referencia } = lerRelatorioMaritimo([abaDoBloco])
  assert.equal(referencia, '2031-03-11')
  assert.equal(blocos[0].embarques[0].previsao, false)
  assert.equal(blocos[0].embarques[1].realizacao, 'previsto')
  assert.equal(blocos[0].embarques[1].previsao, true)

  // Sem a referência do arquivo, a mesma linha não vira previsão: uma aba lida
  // sozinha não sabe até quando o arquivo enxerga.
  const isolada = lerAbaMaritima(abaDoBloco)!
  assert.equal(isolada.embarques[1].realizacao, 'sem_data_efetiva')
})

test('a data de referência é a última data de fato, e sai do arquivo, não do relógio', () => {
  // A coluna de status da origem é fórmula comparada com hoje: ela reclassifica
  // sozinha a cada execução, e classificação que muda sem o dado mudar não é
  // reprodutível.
  assert.equal(dataDeReferencia([]), null)
  assert.equal(
    dataDeReferencia([
      { atd: '2031-01-05', ata: null, ataFinal: null },
      { atd: null, ata: '2031-02-09', ataFinal: null },
      { atd: null, ata: null, ataFinal: '2031-03-20' },
    ]),
    '2031-03-20',
  )
  // Data prevista não entra: ela é o que se compara com a referência.
  assert.equal(dataDeReferencia([{ atd: null, ata: null, ataFinal: null }]), null)
})

test('coluna de status sem valor é contada, para o relatório dizer de onde a flag saiu', () => {
  const bloco = lerAbaMaritima(
    aba('XX_2031', [
      COLUNAS_COM_CONTAGEM,
      linhaComContagem({ 'STATUS 2.0': null }),
      linhaComContagem({ 'Shipment ID': 'ZZ-0002', 'STATUS 2.0': 'texto fictício' }),
    ]),
  )!
  assert.equal(bloco.linhasSemStatus, 1)
  assert.equal(bloco.embarques[0].statusBruto, null)
  assert.equal(bloco.embarques[1].statusBruto, 'texto fictício')
})

/* --------------------------------------------------------- aéreo e geografia */

test('carga aérea de fornecedor é sinalizada, para não se diluir no marítimo', () => {
  // Escopo 3 cat. 4, frete upstream — não é o módulo de viagens (§8.3).
  const bloco = lerAbaMaritima(
    aba('XX_2031', [COLUNAS_COM_CONTAGEM, linhaComContagem({ Trans: 'AIR', Mode: 'LSE' })]),
  )!
  assert.ok(bloco.embarques[0].alertas.some((a) => a.tipo === ALERTA_CARGA_AEREA))

  const maritimo = lerAbaMaritima(aba('XX_2031', [COLUNAS_COM_CONTAGEM, linhaComContagem()]))!
  assert.ok(!maritimo.embarques[0].alertas.some((a) => a.tipo === ALERTA_CARGA_AEREA))
})

test('embarque sem código de porto em uma das pontas é sinalizado', () => {
  const bloco = lerAbaMaritima(
    aba('XX_2031', [COLUNAS_COM_CONTAGEM, linhaComContagem({ 'Last Discharge': null })]),
  )!
  assert.equal(bloco.embarques[0].locodeDestino, null)
  assert.ok(bloco.embarques[0].alertas.some((a) => a.tipo === ALERTA_SEM_LOCODE))
})

test('o corredor é o par de códigos, e não existe sem os dois', () => {
  assert.equal(corredorDe({ locodeOrigem: 'XAAAA', locodeDestino: 'XBBBB' }), 'XAAAA-XBBBB')
  assert.equal(corredorDe({ locodeOrigem: null, locodeDestino: 'XBBBB' }), null)
  assert.equal(corredorDe({ locodeOrigem: 'XAAAA', locodeDestino: null }), null)
})

/* ---------------------------------------------------------------------- data */

test('a data vira texto AAAA-MM-DD pelas partes em UTC', () => {
  // Converter pelo fuso local jogaria o dia primeiro para o último do mês
  // anterior em São Paulo — o bug que a §9.1 evita guardando data como texto.
  const bloco = lerAbaMaritima(
    aba('XX_2031', [
      COLUNAS_COM_CONTAGEM,
      linhaComContagem({ 'ETD First Load': new Date(Date.UTC(2031, 0, 1)) }),
    ]),
  )!
  assert.equal(bloco.embarques[0].etd, '2031-01-01')
})

test('linha sem data nenhuma devolve data nula, e o resto continua legível', () => {
  const bloco = lerAbaMaritima(
    aba('XX_2031', [
      COLUNAS_COM_CONTAGEM,
      linhaComContagem({
        'ETD First Load': null,
        'ETA Last Discharge': null,
        'ATD Partida': null,
      }),
    ]),
  )!
  assert.equal(bloco.embarques[0].etd, null)
  assert.equal(bloco.embarques[0].co2Kg, 1000)
})

/* ------------------------------------------------------------------ mediana */

test('a mediana não se deixa arrastar pelo extremo que ela procura', () => {
  assert.equal(mediana([]), null)
  assert.equal(mediana([5]), 5)
  assert.equal(mediana([1, 2, 3]), 2)
  assert.equal(mediana([1, 2, 3, 4]), 2.5)
  assert.equal(mediana([3, 1, 2]), 2)
  assert.equal(mediana([1, 2, 3, 1000000]), 2.5)
})

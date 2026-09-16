/**
 * Conferência da carga: recalcula a emissão a partir do BANCO e compara com os
 * valores de conferência.
 *
 * De onde vêm os valores esperados — nunca do código, porque este repositório é
 * público (CLAUDE.md §2.1: total de conferência é dado que não se versiona):
 *
 *  1. do próprio arquivo da base, que declara seus totais e o valor de
 *     conferência do cálculo;
 *  2. de uma recontagem independente feita aqui a partir do arquivo, que serve
 *     para pegar erro de agrupamento (mês pela data do voo, por exemplo);
 *  3. opcionalmente de `conferencia.local.json` na raiz — arquivo não
 *     versionado, onde quem opera a carga pode colar os valores de conferência
 *     de outras fontes. Estrutura:
 *
 *     {
 *       "viagens": {
 *         "reservas_contabilizaveis": 0,
 *         "trechos_contabilizaveis": 0,
 *         "pessoas": 0,
 *         "aeroportos": 0,
 *         "distancia_total_km": 0,
 *         "emissao_total_kg_co2e": 0,
 *         "emissao_por_mes": { "AAAA-MM": 0 }
 *       }
 *     }
 *
 * Imprime esperado, obtido e diferença, e sai com código 1 se algo não bater.
 *
 * Uso:
 *   npm run verificar -- [caminho/do/base_viagens.json]
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import ExcelJS from 'exceljs'
import type { Firestore } from 'firebase-admin/firestore'

import {
  categoriaDoFator,
  chaveDoFator,
  emissaoMensal,
  emiteZero,
} from '../src/lib/calculo/mobilidade'
import { lerCartao } from '../src/lib/cartao'
import { chaveNormalizada } from '../src/lib/texto'
import type { DocMobilidade, DocViagemTrecho } from '../src/server/documentos/tipos'
import { carregarFatores } from '../src/server/fatores'
import { COLECAO } from '../src/server/firestore'
import { lerPlanilha } from './ingest-cartao'
import {
  caminhoDaBase,
  conectarFirestore,
  ehEntrada,
  executar,
  lerJson,
  n,
  tituloDaEtapa,
} from './_comum'

type Trecho = {
  data_voo: string
  distancia_km: number
  faixa_distancia: string
  passageiros: number
}

type BaseViagens = {
  meta: {
    totais?: {
      reservas?: number
      reservas_contabilizaveis?: number
      trechos?: number
      trechos_contabilizaveis?: number
      pessoas?: number
      aeroportos?: number
    }
    como_calcular?: {
      conferencia?: {
        distancia_total_km?: number
        emissao_total_kg_co2e?: number
      }
    }
  }
  fatores_emissao: {
    faixas: { id: string; fator: number }[]
    multiplicador_classe: Record<string, number>
    classe_assumida: string
  }
  aeroportos: Record<string, unknown>
  pessoas: Record<string, unknown>
  reservas: { contabilizar: boolean; pax_id: string; trechos: Trecho[] }[]
}

type ConferenciaLocal = {
  viagens?: {
    reservas_contabilizaveis?: number
    trechos_contabilizaveis?: number
    pessoas?: number
    aeroportos?: number
    distancia_total_km?: number
    emissao_total_kg_co2e?: number
    emissao_por_mes?: Record<string, number>
  }
}

type Conferencia = {
  item: string
  esperado: number
  obtido: number
  tolerancia: number
  casas: number
  origem: string
}

function argumentoPosicional(): string | undefined {
  return process.argv.slice(2).find((a) => !a.startsWith('--'))
}

function tolerancia(): number {
  const bruto = process.env.VERIFICAR_TOLERANCIA_KG
  const valor = bruto === undefined ? 0.1 : Number(bruto)
  if (!Number.isFinite(valor) || valor < 0) {
    throw new Error(`VERIFICAR_TOLERANCIA_KG inválida: ${bruto}`)
  }
  return valor
}

/** Recontagem independente a partir do arquivo, sem passar pelo banco. */
function recalcularDaBase(base: BaseViagens) {
  const fatorPorFaixa = new Map(base.fatores_emissao.faixas.map((f) => [f.id, f.fator]))
  const multiplicador =
    base.fatores_emissao.multiplicador_classe[base.fatores_emissao.classe_assumida]
  if (multiplicador === undefined) {
    throw new Error('A base não traz o multiplicador da classe assumida.')
  }

  let reservas = 0
  let trechos = 0
  let distanciaKm = 0
  let co2Kg = 0
  const porMes = new Map<string, number>()
  const pessoas = new Set<string>()

  for (const reserva of base.reservas) {
    if (!reserva.contabilizar) continue
    reservas++
    pessoas.add(reserva.pax_id)
    for (const trecho of reserva.trechos) {
      const fator = fatorPorFaixa.get(trecho.faixa_distancia)
      if (fator === undefined) {
        throw new Error(`Faixa de distância sem fator na base: ${trecho.faixa_distancia}`)
      }
      const emissao = trecho.distancia_km * fator * multiplicador * trecho.passageiros
      trechos++
      distanciaKm += trecho.distancia_km
      co2Kg += emissao
      // Agrupamento pela data do voo, nunca pela data de lançamento (§7.2).
      const mes = trecho.data_voo.slice(0, 7)
      porMes.set(mes, (porMes.get(mes) ?? 0) + emissao)
    }
  }

  return { reservas, trechos, distanciaKm, co2Kg, porMes, pessoas: pessoas.size }
}

function linhaDeConferencia(c: Conferencia): string {
  const diferenca = c.obtido - c.esperado
  const bate = Math.abs(diferenca) <= c.tolerancia
  const marca = bate ? 'ok  ' : 'FALHA'
  return (
    `  ${marca} ${c.item.padEnd(34)} ` +
    `esperado ${n(c.esperado, c.casas).padStart(14)} ` +
    `obtido ${n(c.obtido, c.casas).padStart(14)} ` +
    `dif ${n(diferenca, c.casas).padStart(12)}   ${c.origem}`
  )
}

/* ---------------------------------------------------------------- viagens */

/**
 * Lê os trechos da agência e reduz em JavaScript.
 *
 * A coleção tem ordem de centenas de documentos por ano: ler inteira e agregar
 * aqui é mais barato, e muito mais simples de auditar, do que manter contador
 * pré-calculado (§9.1).
 */
async function agregarViagens(db: Firestore) {
  const instantaneo = await db
    .collection(COLECAO.viagemTrecho)
    .where('fonte', '==', 'agencia')
    .get()

  const trechos = instantaneo.docs.map((d) => ({
    id: d.id,
    doc: d.data() as DocViagemTrecho,
  }))
  const contabilizaveis = trechos.filter((t) => t.doc.contabilizar)

  const porMes = new Map<string, number>()
  let distanciaKm = 0
  let co2Kg = 0
  for (const { doc } of contabilizaveis) {
    distanciaKm += doc.distanciaKm
    co2Kg += doc.co2Kg
    if (doc.mes) porMes.set(doc.mes, (porMes.get(doc.mes) ?? 0) + doc.co2Kg)
  }

  return {
    reservas: new Set(contabilizaveis.map((t) => t.doc.reservaId)).size,
    reservasTodas: new Set(trechos.map((t) => t.doc.reservaId)).size,
    trechos: contabilizaveis.length,
    trechosTodos: trechos.length,
    pessoas: new Set(contabilizaveis.map((t) => t.doc.funcionarioId)).size,
    distanciaKm,
    co2Kg,
    porMes,
  }
}

/**
 * Integridade dos trechos — **de todas as fontes**, não só da agência.
 *
 * Estas três conferências substituem o que o banco relacional garantia sozinho,
 * e por isso valem para qualquer trecho, venha ele de onde vier. Elas nasceram
 * dentro da agregação da agência, que filtra por fonte; com a chegada de uma
 * segunda fonte de viagens, isso passou a significar **integridade conferida em
 * parte da coleção** — o tipo de premissa de fonte única que não aparece porque
 * mora dentro de uma conferência.
 */
async function conferirIntegridadeDosTrechos(db: Firestore) {
  const trechos = (await db.collection(COLECAO.viagemTrecho).get()).docs.map(
    (d) => d.data() as DocViagemTrecho,
  )

  const vistos = new Set<string>()
  let ordemRepetida = 0
  for (const doc of trechos) {
    const chave = `${doc.fonte}|${doc.reservaId}|${doc.ordem}`
    if (vistos.has(chave)) ordemRepetida++
    vistos.add(chave)
  }

  return {
    total: trechos.length,
    semFator: trechos.filter((t) => t.contabilizar && t.fator === null).length,
    ordemRepetida,
    mesDivergente: trechos.filter(
      (t) => t.dataVoo !== null && t.mes !== t.dataVoo.slice(0, 7),
    ).length,
  }
}

/* ------------------------------------------------------------- mobilidade */

/**
 * Conferência da mobilidade.
 *
 * Aqui não existe valor de conferência externo: o total que circula em material
 * anterior não vem desta base e não pode ser reaproveitado. O que dá para
 * conferir é coerência interna — a emissão gravada tem que sair da distância, do
 * número de dias e do fator vigente que estão no próprio banco — e a contagem
 * contra o arquivo de origem, quando ele está à mão.
 */
async function conferirMobilidade(db: Firestore, tol: number): Promise<number> {
  const anoBruto = process.env.MOBILIDADE_ANO_BASE
  if (!anoBruto) {
    tituloDaEtapa('Conferência — mobilidade')
    console.log('  MOBILIDADE_ANO_BASE não configurado; módulo não conferido.')
    return 0
  }
  const ano = Number(anoBruto)

  const instantaneo = await db
    .collection(COLECAO.mobilidade)
    .where('anoBase', '==', ano)
    .get()
  const registros = instantaneo.docs.map((d) => d.data() as DocMobilidade)

  tituloDaEtapa(`Conferência — mobilidade (ano-base ${ano})`)
  if (registros.length === 0) {
    console.log('  nenhum registro carregado para este ano-base.')
    return 0
  }

  const fatores = await carregarFatores(db)
  // O fator é buscado na virada do ano-base: é a data que a tela de método
  // declara como referência da pesquisa.
  const dataDoFator = `${ano}-12-31`

  let recalculado = 0
  let gravado = 0
  let divergentes = 0
  let zeroIndevido = 0
  let fatorDesencontrado = 0

  for (const r of registros) {
    if (r.excecao) continue
    gravado += r.co2KgMes

    let esperado = 0
    if (!emiteZero(r.transporte)) {
      const fator = fatores.vigente(
        categoriaDoFator(r.transporte),
        chaveDoFator(r.transporte, r.combustivel),
        dataDoFator,
      )
      esperado = emissaoMensal({
        distanciaKm: r.distanciaKm,
        diasUteisMes: r.diasUteisMes,
        fatorKgPorKm: fator.valor,
      })
      // O documento carimba o fator que usou; se ele não bate com o vigente, a
      // carga ficou para trás de uma troca de fator (§9.1).
      if (r.fator !== null && r.fator.versao !== fator.versao) fatorDesencontrado++
    } else if (r.co2KgMes !== 0) {
      zeroIndevido++
    }

    recalculado += esperado
    if (Math.abs(esperado - r.co2KgMes) > 0.000001) divergentes++
  }

  // Concentração de distâncias idênticas denuncia geocodificação por município.
  // A coerência interna do módulo continua fechando nesse caso — emissão bate
  // com distância × dias × fator — então esta é a única conferência que enxerga
  // o problema.
  const naMedia = registros.filter((r) => !r.excecao)
  const porDistancia = new Map<number, number>()
  for (const r of naMedia) {
    porDistancia.set(r.distanciaKm, (porDistancia.get(r.distanciaKm) ?? 0) + 1)
  }
  const maiorGrupo = Math.max(0, ...porDistancia.values())
  const concentracao = naMedia.length === 0 ? 0 : maiorGrupo / naMedia.length
  const limiteBruto = process.env.MOBILIDADE_CONCENTRACAO_MAXIMA
  const limite =
    limiteBruto === undefined || limiteBruto.trim() === '' ? 0.25 : Number(limiteBruto)

  const emExcecao = registros.filter((r) => r.excecao).length
  // Todas as demais conferências deste módulo são calculadas sobre as respostas
  // que estão na média. Com o módulo inteiro em exceção, elas passam sem ter o
  // que conferir — foi assim que uma carga totalmente falha pareceu correta.
  const excecaoDemais = registros.length === 0 ? 0 : emExcecao / registros.length
  const conferencias: Conferencia[] = [
    {
      item: 'respostas em exceção (%)',
      esperado: 20,
      obtido: Math.round(excecaoDemais * 100),
      tolerancia: Math.max(0, 20 - Math.round(excecaoDemais * 100)),
      casas: 0,
      origem: 'plausibilidade',
    },
    {
      item: 'respostas com distância idêntica (%)',
      esperado: Math.round(limite * 100),
      obtido: Math.round(concentracao * 100),
      // Só falha para cima: concentração baixa é o resultado saudável.
      tolerancia: Math.max(0, Math.round(limite * 100) - Math.round(concentracao * 100)),
      casas: 0,
      origem: 'plausibilidade',
    },
    {
      item: 'emissão recalculada (kg/mês)',
      esperado: recalculado,
      obtido: gravado,
      tolerancia: tol,
      casas: 1,
      origem: 'recálculo do banco',
    },
    {
      item: 'registros com emissão divergente',
      esperado: 0,
      obtido: divergentes,
      tolerancia: 0,
      casas: 0,
      origem: 'integridade',
    },
    {
      item: 'modal zero com emissão gravada',
      esperado: 0,
      obtido: zeroIndevido,
      tolerancia: 0,
      casas: 0,
      origem: 'integridade',
    },
    {
      item: 'fator gravado ≠ fator vigente',
      esperado: 0,
      obtido: fatorDesencontrado,
      tolerancia: 0,
      casas: 0,
      origem: 'auditoria',
    },
  ]

  const caminhoPlanilha = resolve(
    process.env.BASE_MOBILIDADE_PATH ?? 'dados/mobilidade.xlsx',
  )
  if (existsSync(caminhoPlanilha)) {
    const respondentes = await contarRespondentes(caminhoPlanilha)
    conferencias.push({
      item: 'registros vs. respostas do arquivo',
      esperado: respondentes,
      obtido: registros.length,
      tolerancia: 0,
      casas: 0,
      origem: 'arquivo de origem',
    })
  } else {
    console.log('  arquivo de origem não encontrado; contagem não conferida.')
  }

  let falhas = 0
  for (const c of conferencias) {
    if (Math.abs(c.obtido - c.esperado) > c.tolerancia) falhas++
    console.log(linhaDeConferencia(c))
  }
  console.log(`  ${emExcecao} registro(s) em exceção, fora da média por desenho.`)
  return falhas
}

/** Conta matrículas distintas na planilha, sem tocar em endereço. */
async function contarRespondentes(caminho: string): Promise<number> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(caminho)
  const ws = wb.worksheets[0]
  if (!ws) return 0

  let colunaMatricula = 0
  let linhaCabecalho = 0
  const limite = Math.min(ws.rowCount, 20)
  for (let r = 1; r <= limite && colunaMatricula === 0; r++) {
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, i) => {
      if (chaveNormalizada(cell.text ?? '') === 'MATRICULA') {
        colunaMatricula = i
        linhaCabecalho = r
      }
    })
  }
  if (colunaMatricula === 0) return 0

  const matriculas = new Set<string>()
  for (let r = linhaCabecalho + 1; r <= ws.rowCount; r++) {
    const valor = ws.getRow(r).getCell(colunaMatricula).text?.trim() ?? ''
    if (valor !== '') matriculas.add(valor)
  }
  return matriculas.size
}

/* ------------------------------------------------------------------ main */

/**
 * Conferência de **cobertura**: a origem tem N trechos, o banco tem N?
 *
 * Esta é a conferência que faltava, e é de outra natureza que todas as outras.
 * As demais perguntam "a conta fecha?" — coerência — ou "o insumo é crível?" —
 * plausibilidade. Esta pergunta **"chegou tudo?"**, e é a única que pega uma
 * fonte inteira que ficou de fora. Duas vezes o inventário ficou coerente por
 * dentro e errado por fora; nas duas, foi gente olhando que percebeu.
 *
 * Ela também **imprime a lista das fontes que conhece**. Nenhuma conferência
 * pode acusar um arquivo de que nunca ouviu falar — mas pode deixar visível o
 * que ela cobre, para a ausência de uma fonte saltar aos olhos de quem lê. Foi
 * exatamente assim que a planilha do cartão passou despercebida.
 */
async function conferirCoberturaDasFontes(
  db: Firestore,
  conferencias: Conferencia[],
): Promise<void> {
  const inteiro = { tolerancia: 0, casas: 0 }

  const fontes: {
    fonte: string
    rotulo: string
    caminho: string
    contarNaOrigem: (caminho: string) => Promise<number>
  }[] = [
    {
      fonte: 'agencia',
      rotulo: 'trechos do relatório da agência',
      caminho: caminhoDaBase(
        argumentoPosicional(),
        'BASE_VIAGENS_PATH',
        'dados/base_viagens.json',
      ),
      contarNaOrigem: async (caminho) => {
        const base = lerJson<BaseViagens>(caminho)
        return base.reservas.reduce((s, r) => s + r.trechos.length, 0)
      },
    },
    {
      fonte: 'cartao',
      rotulo: 'trechos da planilha do cartão',
      caminho: caminhoDaBase(
        undefined,
        'BASE_CARTAO_PATH',
        'dados/cartao-viagens.xlsx',
      ),
      contarNaOrigem: async (caminho) => {
        const { trechos } = lerCartao(await lerPlanilha(caminho))
        return trechos.length
      },
    },
  ]

  tituloDaEtapa('Conferência — cobertura das fontes')
  console.log('  Fontes conferidas; uma fonte que não esteja nesta lista não é vista por')
  console.log('  conferência nenhuma.')

  const conhecidas = new Set(fontes.map((f) => f.fonte))

  for (const f of fontes) {
    const carregados = (
      await db.collection(COLECAO.viagemTrecho).where('fonte', '==', f.fonte).select().get()
    ).size

    if (!existsSync(f.caminho)) {
      console.log(
        `  ${f.rotulo}: arquivo de origem não encontrado; ` +
          `${carregados} trecho(s) no banco não puderam ser conferidos.`,
      )
      continue
    }

    conferencias.push({
      item: f.rotulo,
      esperado: await f.contarNaOrigem(f.caminho),
      obtido: carregados,
      origem: 'origem × banco',
      ...inteiro,
    })
  }

  // Fonte gravada no banco que ninguém confere é o mesmo ponto cego, do outro
  // lado: dado que entrou e não tem quem o confronte com a origem.
  const todas = (await db.collection(COLECAO.viagemTrecho).select('fonte').get()).docs
  const semConferencia = new Set(
    todas
      .map((d) => String((d.data() as { fonte?: string }).fonte ?? ''))
      .filter((f) => f !== '' && !conhecidas.has(f)),
  )
  for (const fonte of semConferencia) {
    console.log(
      `  ATENÇÃO: há trechos com fonte "${fonte}" no banco, e nenhuma conferência ` +
        'sabe de onde eles vieram.',
    )
  }
}

async function principal(): Promise<void> {
  const caminho = caminhoDaBase(
    argumentoPosicional(),
    'BASE_VIAGENS_PATH',
    'dados/base_viagens.json',
  )
  const base = lerJson<BaseViagens>(caminho)

  const caminhoLocal = resolve('conferencia.local.json')
  const local: ConferenciaLocal = existsSync(caminhoLocal)
    ? lerJson<ConferenciaLocal>(caminhoLocal)
    : {}
  const esperadoLocal = local.viagens ?? {}

  const recalculado = recalcularDaBase(base)
  const declarado = base.meta?.totais ?? {}
  const conferenciaDaBase = base.meta?.como_calcular?.conferencia ?? {}

  const tol = tolerancia()
  // Valores colados do relatório costumam vir arredondados ao kg.
  const tolMes = Math.max(tol, 1)

  const { db, encerrar } = conectarFirestore()
  const conferencias: Conferencia[] = []

  try {
    const viagens = await agregarViagens(db)
    const integridade = await conferirIntegridadeDosTrechos(db)
    // A coleção de aeroportos deixou de ser alimentada por uma fonte só: a
    // planilha do cartão trouxe aeroportos internacionais que a base da agência
    // não tem. Conferir o TAMANHO da coleção passou a acusar erro numa carga
    // correta — o que importa é que nenhum aeroporto da base da agência tenha
    // ficado de fora.
    const cadastrados = new Set(
      (await db.collection(COLECAO.aeroporto).get()).docs.map(
        (d) => (d.data() as { iata?: string }).iata ?? d.id,
      ),
    )
    const aeroportosDaBaseAusentes = Object.keys(base.aeroportos).filter(
      (iata) => !cadastrados.has(iata),
    ).length

    const inteiro = { tolerancia: 0, casas: 0 }

    conferencias.push({
      item: 'reservas contabilizáveis',
      esperado:
        esperadoLocal.reservas_contabilizaveis ??
        declarado.reservas_contabilizaveis ??
        recalculado.reservas,
      obtido: viagens.reservas,
      origem: esperadoLocal.reservas_contabilizaveis ? 'conferencia.local.json' : 'base',
      ...inteiro,
    })

    conferencias.push({
      item: 'trechos contabilizáveis',
      esperado:
        esperadoLocal.trechos_contabilizaveis ??
        declarado.trechos_contabilizaveis ??
        recalculado.trechos,
      obtido: viagens.trechos,
      origem: esperadoLocal.trechos_contabilizaveis ? 'conferencia.local.json' : 'base',
      ...inteiro,
    })

    if (declarado.reservas !== undefined) {
      conferencias.push({
        item: 'reservas gravadas (com descarte)',
        esperado: declarado.reservas,
        obtido: viagens.reservasTodas,
        origem: 'base',
        ...inteiro,
      })
    }

    if (declarado.trechos !== undefined) {
      conferencias.push({
        item: 'trechos gravados (com descarte)',
        esperado: declarado.trechos,
        obtido: viagens.trechosTodos,
        origem: 'base',
        ...inteiro,
      })
    }

    // O total de pessoas declarado na base conta também quem só aprovou passagem.
    // Para emissão vale quem viajou (§7.2), então o esperado aqui vem da
    // recontagem dos passageiros, não daquele total.
    conferencias.push({
      item: 'pessoas com viagem',
      esperado: esperadoLocal.pessoas ?? recalculado.pessoas,
      obtido: viagens.pessoas,
      origem: esperadoLocal.pessoas ? 'conferencia.local.json' : 'recálculo',
      ...inteiro,
    })

    conferencias.push({
      item: 'aeroportos da base ausentes',
      esperado: 0,
      obtido: aeroportosDaBaseAusentes,
      origem: 'base × cadastro',
      ...inteiro,
    })

    conferencias.push({
      item: 'distância contabilizável (km)',
      esperado:
        esperadoLocal.distancia_total_km ??
        conferenciaDaBase.distancia_total_km ??
        recalculado.distanciaKm,
      obtido: viagens.distanciaKm,
      tolerancia: tol,
      casas: 1,
      origem: esperadoLocal.distancia_total_km ? 'conferencia.local.json' : 'base',
    })

    conferencias.push({
      item: 'emissão total (kg CO₂e)',
      esperado:
        esperadoLocal.emissao_total_kg_co2e ??
        conferenciaDaBase.emissao_total_kg_co2e ??
        recalculado.co2Kg,
      obtido: viagens.co2Kg,
      tolerancia: tol,
      casas: 1,
      origem: esperadoLocal.emissao_total_kg_co2e ? 'conferencia.local.json' : 'base',
    })

    // O banco precisa fechar também contra a recontagem independente: é o que
    // pega troca de fator, trecho perdido e dupla aplicação de uplift.
    conferencias.push({
      item: 'emissão vs. recálculo do arquivo',
      esperado: recalculado.co2Kg,
      obtido: viagens.co2Kg,
      tolerancia: tol,
      casas: 1,
      origem: 'recálculo',
    })

    conferencias.push({
      item: 'trechos sem fator carimbado (todas as fontes)',
      esperado: 0,
      obtido: integridade.semFator,
      origem: 'auditoria',
      ...inteiro,
    })

    conferencias.push({
      item: 'ordem repetida na reserva (todas as fontes)',
      esperado: 0,
      obtido: integridade.ordemRepetida,
      origem: 'integridade',
      ...inteiro,
    })

    conferencias.push({
      item: 'mês ≠ mês da data do voo (todas as fontes)',
      esperado: 0,
      obtido: integridade.mesDivergente,
      origem: 'integridade',
      ...inteiro,
    })

    await conferirCoberturaDasFontes(db, conferencias)

    tituloDaEtapa('Conferência — viagens (agência)')
    if (declarado.pessoas !== undefined && declarado.pessoas !== recalculado.pessoas) {
      console.log(
        `  nota: a base cadastra ${declarado.pessoas} pessoas e ${recalculado.pessoas} ` +
          'viajaram; a diferença aparece só como aprovador de passagem (§7.2).',
      )
    }
    let falhas = 0
    for (const c of conferencias) {
      if (Math.abs(c.obtido - c.esperado) > c.tolerancia) falhas++
      console.log(linhaDeConferencia(c))
    }

    /* ----------------------------------------------- série mensal por voo */

    const esperadoPorMes =
      esperadoLocal.emissao_por_mes ?? Object.fromEntries(recalculado.porMes)
    const origemMes = esperadoLocal.emissao_por_mes ? 'conferencia.local.json' : 'recálculo'
    const tolDoMes = esperadoLocal.emissao_por_mes ? tolMes : tol
    const meses = [
      ...new Set([...Object.keys(esperadoPorMes), ...viagens.porMes.keys()]),
    ].sort()

    tituloDaEtapa('Conferência — emissão por mês (data do voo)')
    for (const mes of meses) {
      const esperado = esperadoPorMes[mes] ?? 0
      const obtido = viagens.porMes.get(mes) ?? 0
      if (Math.abs(obtido - esperado) > tolDoMes) falhas++
      console.log(
        linhaDeConferencia({
          item: mes,
          esperado,
          obtido,
          tolerancia: tolDoMes,
          casas: 1,
          origem: origemMes,
        }),
      )
    }

    /* ------------------------------------------------------- mobilidade */

    falhas += await conferirMobilidade(db, tol)

    /* ------------------------------------------------------------ veredito */

    console.log('')
    if (falhas > 0) {
      console.log(
        `${falhas} conferência(s) não bateram. A carga não pode ser considerada válida.`,
      )
      process.exitCode = 1
    } else {
      console.log('Todas as conferências bateram.')
    }
  } finally {
    await encerrar()
  }
}

if (ehEntrada(import.meta.url)) void executar('verificar', principal)

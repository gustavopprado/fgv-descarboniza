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
import {
  ANO_BASE_INVENTARIO,
  anoBaseMobilidade,
  anoBaseViagens,
  maritimoAmostraMinimaCorredor,
  maritimoLimiarAtipico,
  maritimoLimiarImpossivel,
} from '../src/lib/env'
import { chaveNormalizada } from '../src/lib/texto'
import { anoDe } from '../src/server/documentos/tipos'
import type {
  DocEmbarque,
  DocMobilidade,
  DocPorto,
  DocViagemTrecho,
} from '../src/server/documentos/tipos'
import type { ContextoDeAcesso } from '../src/server/consultas/acesso'
import {
  consultarMaritimo,
  consultarMobilidade,
  consultarViagens,
} from '../src/server/consultas/inventario'
import { MOTIVO_DO_ALERTA } from '../src/server/consultas/metodo'
import { consultarVisaoGeral } from '../src/server/consultas/visao-geral'
import { carregarFatores } from '../src/server/fatores'
import { COLECAO } from '../src/server/firestore'
import { lerPlanilha } from './ingest-cartao'
import {
  lerRelatorioDoArquivo,
  montarEmbarques,
  type Parametros,
} from './ingest-maritimo'
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

/**
 * Recontagem independente a partir do arquivo, sem passar pelo banco.
 *
 * `anoBase` recorta pelo ano do voo. Com `null`, conta o arquivo inteiro — é
 * assim que os totais declarados na origem continuam podendo ser conferidos
 * contra ela mesma, que é a única coisa que eles descrevem depois que o
 * inventário passou a relatar um ano (§7.0).
 *
 * Uma reserva conta quando **algum** trecho dela cai no ano: reserva que começa
 * em dezembro e volta em janeiro pertence aos dois relatórios, com os trechos
 * repartidos entre eles.
 */
function recalcularDaBase(base: BaseViagens, anoBase: number | null) {
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
    const doAno = reserva.trechos.filter(
      (t) => anoBase === null || anoDe(t.data_voo) === anoBase,
    )
    if (doAno.length === 0) continue
    reservas++
    pessoas.add(reserva.pax_id)
    for (const trecho of doAno) {
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
  const anoBase = anoBaseViagens()

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
        return base.reservas.reduce(
          (s, r) => s + r.trechos.filter((t) => anoDe(t.data_voo) === anoBase).length,
          0,
        )
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
        return trechos.filter((t) => anoDe(t.data) === anoBase).length
      },
    },
  ]

  tituloDaEtapa('Conferência — cobertura das fontes')
  console.log('  Fontes conferidas; uma fonte que não esteja nesta lista não é vista por')
  console.log('  conferência nenhuma.')
  console.log(`  Ano-base do inventário de viagens: ${anoBase}. A contagem na origem é`)
  console.log('  recortada pelo mesmo ano, senão acusaria erro numa carga correta.')

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
  const fontesNoBanco = todas.map((d) =>
    String((d.data() as { fonte?: string }).fonte ?? ''),
  )
  const semConferencia = new Set(
    fontesNoBanco.filter((f) => f !== '' && !conhecidas.has(f)),
  )
  for (const fonte of semConferencia) {
    console.log(
      `  ATENÇÃO: há trechos com fonte "${fonte}" no banco, e nenhuma conferência ` +
        'sabe de onde eles vieram.',
    )
  }

  /**
   * **A §0.1, conferida contra o banco.**
   *
   * A validação de escrita já recusa `fonte: 'formulario'` em `viagemTrecho`,
   * mas validação só alcança o que passa por ela: documento gravado antes da
   * regra, ou por um caminho que não a use, continua lá. Esta conferência olha
   * o que está no banco hoje.
   *
   * Não é fonte desconhecida — é o tipo errado de dado na coleção errada. Somar
   * autodeclaração voluntária a fonte administrativa completa produz série cuja
   * variação mede quanta gente preencheu, não quanta emissão houve. Por isso
   * **falha**, em vez de avisar.
   */
  /**
   * **Ano de fora do ano-base falha, e as duas metades desta regra convivem de
   * propósito.**
   *
   * O escopo de recarga inclui o ano (§7.0) para que carregar um período não
   * derrube o anterior — sem isso o inventário só conseguiria guardar um ano de
   * cada vez. Guardar mais de um passa então a ser **possível**; esta
   * conferência é o que o mantém **deliberado**.
   *
   * O motivo não é técnico. Um ano que entra pela cauda — algumas semanas de
   * janeiro, porque a passagem foi comprada no ano anterior — aparece no seletor
   * de período como se fosse um ano, e três semanas de dado apresentadas como
   * um exercício é o mesmo erro que a §5 impede na visão geral.
   *
   * Filtro na carga não substitui isto: ele só alcança o que passa por ele, e
   * documento gravado antes do recorte existir continua no banco somando em
   * silêncio.
   */
  const anos = (await db.collection(COLECAO.viagemTrecho).select('ano').get()).docs.map((d) =>
    Number((d.data() as { ano?: number }).ano),
  )
  const outros = new Map<number, number>()
  for (const a of anos) {
    if (a !== anoBase) outros.set(a, (outros.get(a) ?? 0) + 1)
  }
  for (const [ano, quantos] of [...outros.entries()].sort()) {
    console.log(
      `  há ${quantos} trecho(s) de ${ano} no banco. Relatar mais de um ano é decisão, ` +
        'não padrão: ou o ano-base muda, ou esses trechos saem.',
    )
  }
  conferencias.push({
    item: `trechos de ano diferente de ${anoBase}`,
    esperado: 0,
    obtido: anos.length - anos.filter((a) => a === anoBase).length,
    origem: 'ano-base',
    ...inteiro,
  })

  conferencias.push({
    item: 'trechos do programa dentro do inventário (§0.1)',
    esperado: 0,
    obtido: fontesNoBanco.filter((f) => f === 'formulario').length,
    origem: 'separação',
    ...inteiro,
  })

  const doPrograma = (await db.collection(COLECAO.viagemRegistrada).select().get()).size
  console.log(
    `  o programa de viagens tem ${doPrograma} trecho(s) em coleção própria, ` +
      'fora de toda conferência de cobertura: ele não tem arquivo de origem a ' +
      'confrontar, porque não é carga — é registro voluntário (§0.1).',
  )
}

/* ---------------------------------------------------------------- marítimo */

/**
 * Conferência de **cobertura do módulo marítimo** — §8.4.
 *
 * Ela entra na mesma leva do script de ingestão, nunca depois. A pergunta é
 * *"chegou tudo?"*, que coerência e plausibilidade não fazem — e é a única que
 * pega uma fonte inteira ficando de fora. Custou duas vezes neste projeto, e na
 * segunda só apareceu porque alguém notou por acaso (§14).
 *
 * **A contagem é por bloco de origem, nunca contra o arquivo inteiro.** Comparar
 * total de coleção com total de uma fonte é a premissa de fonte única
 * disfarçada de conferência, e já foi encontrada exatamente nessa forma.
 *
 * A identidade que ela prende é: **linhas úteis na origem = documentos no banco
 * + recusas declaradas.** Sem o segundo termo, um descarte silencioso passaria
 * por cobertura correta; com ele, um embarque que sumiu na leitura falha.
 */
async function conferirMaritimo(db: Firestore): Promise<number> {
  const inteiro = { tolerancia: 0, casas: 0 }
  const conferencias: Conferencia[] = []
  let falhas = 0

  tituloDaEtapa('Conferência — cobertura do marítimo')

  const noBanco = (
    await db
      .collection(COLECAO.embarque)
      .select('bloco', 'agente', 'nivelDado', 'etd', 'mes')
      .get()
  ).docs.map((d) => d.data() as EmbarqueConferido)

  const caminho = caminhoDaBase(undefined, 'BASE_MARITIMO_PATH', 'dados/relatorio-maritimo.xlsx')
  if (!existsSync(caminho)) {
    console.log(
      `  arquivo de origem não encontrado; ${noBanco.length} embarque(s) no banco não ` +
        'puderam ser conferidos.',
    )
    return conferirIntegridadeMaritima(noBanco, conferencias, inteiro, falhas)
  }

  let parametros: Parametros
  try {
    parametros = {
      limiarAtipico: maritimoLimiarAtipico(),
      limiarImpossivel: maritimoLimiarImpossivel(),
      amostraMinimaDoCorredor: maritimoAmostraMinimaCorredor(),
    }
  } catch (erro) {
    // Sem os limiares não dá para reproduzir quais linhas foram recusadas, e sem
    // isso a identidade da cobertura não fecha. Com o banco vazio isso é só uma
    // nota; com embarques dentro, é exatamente o ponto cego que esta conferência
    // existe para não ter.
    const motivo = erro instanceof Error ? erro.message : String(erro)
    console.log(`  parâmetros do módulo ausentes: ${motivo}`)
    if (noBanco.length > 0) {
      console.log(
        `  FALHA ${noBanco.length} embarque(s) no banco e nenhuma conferência possível.`,
      )
      return falhas + 1
    }
    return falhas
  }

  const portosLidos = await db.collection(COLECAO.porto).get()
  const portos = new Map<string, DocPorto>(
    portosLidos.docs.map((d) => [d.id, d.data() as DocPorto]),
  )

  const montagem = montarEmbarques(await lerRelatorioDoArquivo(caminho), portos, parametros)

  console.log('  Blocos conferidos; um bloco que não esteja nesta lista não é visto por')
  console.log('  conferência nenhuma. O escopo é a aba de origem, nunca o ano (§8.4).')

  const conhecidos = new Set(montagem.blocos.map((b) => b.bloco))
  for (const bloco of montagem.blocos) {
    const doBanco = noBanco.filter((d) => d.bloco === bloco.bloco).length
    const recusadas = montagem.recusas.filter((r) => r.bloco === bloco.bloco).length
    conferencias.push({
      item: `bloco ${bloco.bloco}`,
      esperado: bloco.embarques.length,
      obtido: doBanco + recusadas,
      origem: 'origem × banco + recusas',
      ...inteiro,
    })
    if (recusadas > 0) {
      console.log(
        `  ${bloco.bloco}: ${recusadas} linha(s) recusada(s) e declarada(s); elas não ` +
          'estão no banco de propósito (§8.1.1).',
      )
    }
  }

  // Bloco gravado no banco que ninguém confere é o mesmo ponto cego do outro
  // lado: dado que entrou e não tem quem o confronte com a origem.
  for (const bloco of new Set(noBanco.map((d) => d.bloco))) {
    if (!conhecidos.has(bloco)) {
      console.log(
        `  ATENÇÃO: há embarques do bloco "${bloco}" no banco, e o arquivo de origem ` +
          'não o contém mais.',
      )
    }
  }

  /**
   * **Bloco de agente conhecido e ausente é conferido, não é nota de rodapé.**
   *
   * Um agente que não entrega detalhe linha a linha fica inteiro fora do
   * inventário. Tratá-lo como as abas de template — uma linha de texto entre
   * outras — é exatamente o silêncio que esta conferência existe para impedir:
   * fonte inteira faltando parece, no relatório, igual a lixo do sistema de
   * origem.
   *
   * Ela **não falha**, e isso é decisão: o que falta não é corrigível por
   * código, é detalhe a pedir à origem (§13). Conferência que reprova o que
   * ninguém pode consertar vira ruído que se aprende a ignorar. O que ela prende
   * é o outro lado — documento no banco de um bloco que hoje não tem detalhe —,
   * e esse sim é defeito.
   */
  if (montagem.semDetalhe.length > 0) {
    console.log(
      `  ${montagem.semDetalhe.length} bloco(s) de agente SEM detalhe linha a linha. O ` +
        'volume deles não está no total: é ausência de FONTE, não de qualidade (§8.2), e a',
    )
    console.log(
      '  saída é pedir detalhe por embarque à origem — os totais da aba de resumo não ' +
        'servem, porque a conta de lá é circular (§8.1).',
    )
    for (const bloco of montagem.semDetalhe) {
      conferencias.push({
        item: `bloco ${bloco} sem detalhe — documentos no banco`,
        esperado: 0,
        obtido: noBanco.filter((d) => d.bloco === bloco).length,
        origem: 'fonte ausente',
        ...inteiro,
      })
    }
  }
  if (montagem.ignoradas.length > 0) {
    console.log(
      `  Abas ignoradas, sem forma de detalhe nem nome de bloco: ` +
        `${montagem.ignoradas.join(', ')}.`,
    )
  }
  console.log(`  O arquivo enxerga o que aconteceu até ${montagem.referencia ?? '—'} (§8.3).`)

  const porNivel = new Map<string, number>()
  for (const d of noBanco) porNivel.set(d.nivelDado, (porNivel.get(d.nivelDado) ?? 0) + 1)
  console.log(
    `  Qualidade do dado no banco: ${[...porNivel].map(([k, v]) => `${k} ${v}`).join(', ') || '—'}`,
  )

  for (const c of conferencias) {
    if (Math.abs(c.obtido - c.esperado) > c.tolerancia) falhas++
    console.log(linhaDeConferencia(c))
  }
  conferencias.length = 0

  return conferirIntegridadeMaritima(noBanco, conferencias, inteiro, falhas)
}

type EmbarqueConferido = Pick<DocEmbarque, 'bloco' | 'agente' | 'nivelDado' | 'etd' | 'mes'>

/**
 * Integridade do que está no banco, independente da origem.
 *
 * Vale para **todos os embarques, de qualquer bloco** — a lição de que
 * integridade conferida em parte da coleção não é integridade (§14).
 */
function conferirIntegridadeMaritima(
  noBanco: EmbarqueConferido[],
  conferencias: Conferencia[],
  inteiro: { tolerancia: number; casas: number },
  falhas: number,
): number {
  const niveis = new Set(['medido', 'estimado_corredor', 'estimado_media', 'estimado_peso'])

  conferencias.push({
    item: 'embarques com nível de dado inválido',
    esperado: 0,
    obtido: noBanco.filter((d) => !niveis.has(d.nivelDado)).length,
    origem: 'integridade',
    ...inteiro,
  })

  // Mês desnormalizado que não bate com a data de referência faz o corte por
  // período mentir sem nenhum sinal (§9.9).
  conferencias.push({
    item: 'mês ≠ mês do ETD',
    esperado: 0,
    obtido: noBanco.filter((d) => d.etd === null || d.mes !== d.etd.slice(0, 7)).length,
    origem: 'integridade',
    ...inteiro,
  })

  conferencias.push({
    item: 'embarques sem bloco de origem',
    esperado: 0,
    obtido: noBanco.filter((d) => !d.bloco).length,
    origem: 'integridade',
    ...inteiro,
  })

  let total = falhas
  for (const c of conferencias) {
    if (Math.abs(c.obtido - c.esperado) > c.tolerancia) total++
    console.log(linhaDeConferencia(c))
  }
  return total
}

/**
 * **Todo alerta que está no banco tem motivo escrito na tela de método.**
 *
 * A guarda estática varre o código-fonte e pega o código escrito lá. Esta varre
 * o **banco**, e é a que de fato morde: quatro alertas chegaram à tela sem
 * explicação porque moravam como chave de um `Record` de severidade, e a
 * varredura do fonte não os via. O código deles existia, a carga os gravava, e a
 * tela dizia deles o que diz de um alerta desconhecido.
 *
 * É a mesma família da cobertura (§8.4): coerência responde "a conta fecha?", e
 * esta responde "chegou tudo?" — aqui, chegou explicação para tudo que o banco
 * guarda. Alerta que ninguém entende é alerta que se aprende a ignorar.
 */
async function conferirMotivosDosAlertas(
  db: Firestore,
  conferencias: Conferencia[],
): Promise<void> {
  const codigos = new Set<string>()
  for (const nome of [COLECAO.mobilidade, COLECAO.viagemTrecho, COLECAO.embarque]) {
    for (const doc of (await db.collection(nome).get()).docs) {
      for (const codigo of (doc.data() as { alertasCodigos?: string[] }).alertasCodigos ??
        []) {
        codigos.add(codigo)
      }
    }
  }

  const semMotivo = [...codigos].filter((c) => !(c in MOTIVO_DO_ALERTA)).sort()
  if (semMotivo.length > 0) {
    console.log(
      `  alertas no banco sem motivo declarado na tela de método: ${semMotivo.join(', ')}`,
    )
  }
  conferencias.push({
    item: 'alertas no banco sem motivo na tela de método',
    esperado: 0,
    obtido: semMotivo.length,
    origem: 'auditoria',
    tolerancia: 0,
    casas: 0,
  })
}

/* ------------------------------------------ coerência entre telas (§10.0) */

/**
 * **O mesmo módulo aparece em duas telas, e as duas têm que contar a mesma
 * coisa** — CLAUDE.md §10.0.1.
 *
 * É a família da cobertura (§8.4), e não a da coerência interna: ela não
 * pergunta se a conta fecha, pergunta se **as duas telas contam a mesma coisa**.
 * A Visão geral relata um ano; a tela do módulo relata o recorte dela. Onde as
 * duas falam do mesmo ano, o número precisa ser o mesmo — e a divergência, se
 * existir, não estoura em lugar nenhum: os dois números continuam plausíveis, só
 * discordam.
 *
 * **A recontagem aqui é independente das duas.** Ela sai das coleções e aplica
 * as regras declaradas — `contabilizar` nas viagens, previsão fora no marítimo,
 * exceção fora na mobilidade, taxa mensal × doze —, sem passar por nenhuma das
 * consultas. Comparar as duas telas só entre si não provaria nada enquanto uma
 * reusa a outra: o terceiro número é o que dá mordida.
 *
 * **O ano-base da mobilidade sai da coleção, não do ambiente**, e é aí que esta
 * conferência pega o defeito silencioso da §10.0: com a variável apontando para
 * um ano que a pesquisa não tem, o consolidado perde o módulo inteiro sem erro
 * nenhum, e aqui a contagem de respondentes cai para zero contra um esperado que
 * o próprio banco produziu.
 */
async function conferirCoerenciaDoConsolidado(db: Firestore): Promise<number> {
  const ano = ANO_BASE_INVENTARIO
  const inteiro = { tolerancia: 0, casas: 0 }
  const tol = { tolerancia: 0.001, casas: 3 }
  const conferencias: Conferencia[] = []

  tituloDaEtapa(`Conferência — coerência entre telas (consolidado de ${ano})`)

  /* --------------------------------- recontagem independente das coleções */

  const respostas = (await db.collection(COLECAO.mobilidade).get()).docs.map(
    (d) => d.data() as DocMobilidade,
  )
  const trechos = (await db.collection(COLECAO.viagemTrecho).get()).docs.map(
    (d) => d.data() as DocViagemTrecho,
  )
  const embarques = (await db.collection(COLECAO.embarque).get()).docs.map(
    (d) => d.data() as DocEmbarque,
  )

  // O ano-base da pesquisa é o mais recente que a coleção tem. Derivado do dado,
  // e não do ambiente, de propósito: é isto que denuncia a variável apontando
  // para o ano errado.
  const anosBase = [...new Set(respostas.map((r) => r.anoBase))].sort()
  const anoBaseNaColecao = anosBase[anosBase.length - 1]
  const naMedia = respostas.filter((r) => r.anoBase === anoBaseNaColecao && !r.excecao)
  const mobilidadeT = (somaDe(naMedia, (r) => r.co2KgMes) * 12) / 1000
  const viagensT =
    somaDe(
      trechos.filter((t) => t.ano === ano && t.contabilizar),
      (t) => t.co2Kg,
    ) / 1000
  const maritimoT =
    somaDe(
      embarques.filter((e) => e.ano === ano && !e.previsao),
      (e) => e.co2Kg,
    ) / 1000

  if (anosBase.length > 1) {
    console.log(
      `  nota: a coleção de mobilidade tem ${anosBase.length} anos-base; o consolidado ` +
        `usa o mais recente (${anoBaseNaColecao}).`,
    )
  }
  if (anoBaseMobilidade() !== anoBaseNaColecao) {
    console.log(
      `  MOBILIDADE_ANO_BASE aponta para ${anoBaseMobilidade() ?? 'nada'} e a coleção ` +
        `tem ${anoBaseNaColecao}: o consolidado perde o módulo sem erro aparente (§10.0).`,
    )
  }

  /* ------------------------------------------ as duas telas, lado a lado */

  const ctx: ContextoDeAcesso = {
    uid: 'script-verificar',
    email: 'script@local.invalid',
    papel: 'admin',
    empresa: null,
    funcionarioId: null,
  }

  const consolidado = await consultarVisaoGeral(ctx, db)
  const telaDeViagens = await consultarViagens(ctx, { ano }, db)
  const telaDoMaritimo = await consultarMaritimo(ctx, { ano }, db)
  const telaDaMobilidade =
    consolidado.mobilidade.anoBase === null
      ? null
      : await consultarMobilidade(ctx, { anoBase: consolidado.mobilidade.anoBase }, db)

  const noConsolidado = (modulo: string): number =>
    consolidado.porModulo.find((m) => m.modulo === modulo)?.toneladas ?? 0

  conferencias.push({
    item: 'mobilidade: recontagem × consolidado',
    esperado: mobilidadeT,
    obtido: noConsolidado('mobilidade'),
    origem: 'coerência',
    ...tol,
  })
  conferencias.push({
    item: 'mobilidade: consolidado × tela',
    esperado: telaDaMobilidade?.co2ToneladasAno ?? 0,
    obtido: noConsolidado('mobilidade'),
    origem: 'coerência',
    ...tol,
  })
  conferencias.push({
    item: 'mobilidade: respondentes na média',
    esperado: naMedia.length,
    obtido: consolidado.mobilidade.respondentes,
    origem: 'coerência',
    ...inteiro,
  })

  conferencias.push({
    item: 'viagens: recontagem × consolidado',
    esperado: viagensT,
    obtido: noConsolidado('viagens'),
    origem: 'coerência',
    ...tol,
  })
  conferencias.push({
    item: 'viagens: consolidado × tela',
    esperado: telaDeViagens.co2Toneladas,
    obtido: noConsolidado('viagens'),
    origem: 'coerência',
    ...tol,
  })

  conferencias.push({
    item: 'marítimo: recontagem × consolidado',
    esperado: maritimoT,
    obtido: noConsolidado('maritimo'),
    origem: 'coerência',
    ...tol,
  })
  conferencias.push({
    item: 'marítimo: consolidado × tela',
    esperado: telaDoMaritimo.co2Toneladas,
    obtido: noConsolidado('maritimo'),
    origem: 'coerência',
    ...tol,
  })

  // O marítimo é o único que mostra dois números em duas telas, porque a série
  // dele atravessa os anos (§8.4). A diferença é legítima e a Visão geral
  // declara o recorte; o que não podia era ela aparecer sem recorte no
  // consolidado.
  const foraDoAno = embarques.filter((e) => e.ano !== ano && !e.previsao)
  if (foraDoAno.length > 0) {
    console.log(
      `  nota: ${foraDoAno.length} embarque(s) realizados fora de ${ano} ficam fora do ` +
        'consolidado e dentro do total do módulo; a Visão geral declara o recorte.',
    )
  }

  conferencias.push({
    item: 'série de doze meses × indicador',
    esperado: consolidado.totalToneladas,
    obtido: consolidado.porMes.reduce((s, m) => s + m.total, 0) / 1000,
    origem: 'coerência',
    ...tol,
  })
  conferencias.push({
    item: 'meses na série',
    esperado: 12,
    obtido: consolidado.porMes.length,
    origem: 'coerência',
    ...inteiro,
  })
  conferencias.push({
    item: 'fatias da faixa × indicador',
    esperado: consolidado.totalToneladas,
    obtido: consolidado.porModulo.reduce((s, m) => s + m.toneladas, 0),
    origem: 'coerência',
    ...tol,
  })

  let falhas = 0
  for (const c of conferencias) {
    if (Math.abs(c.obtido - c.esperado) > c.tolerancia) falhas++
    console.log(linhaDeConferencia(c))
  }
  return falhas
}

function somaDe<T>(itens: T[], valor: (item: T) => number): number {
  return itens.reduce((s, item) => s + valor(item), 0)
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

  const anoBase = anoBaseViagens()
  const recalculado = recalcularDaBase(base, anoBase)
  const recalculadoDoArquivo = recalcularDaBase(base, null)
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

    // **O esperado do banco sai do recálculo recortado pelo ano, não dos totais
    // declarados na origem.** Os declarados descrevem o arquivo inteiro, e o
    // banco passou a guardar um ano (§7.0): compará-los acusaria erro numa carga
    // correta. É a mesma armadilha da premissa de fonte única, agora no tempo —
    // um esperado que embute "o banco tem tudo que está no arquivo".
    //
    // Eles não são descartados: viraram conferência do arquivo contra ele mesmo,
    // logo abaixo, que é a única coisa que de fato descrevem.
    conferencias.push({
      item: 'reservas contabilizáveis',
      esperado: esperadoLocal.reservas_contabilizaveis ?? recalculado.reservas,
      obtido: viagens.reservas,
      origem: esperadoLocal.reservas_contabilizaveis
        ? 'conferencia.local.json'
        : `recálculo ${anoBase}`,
      ...inteiro,
    })

    conferencias.push({
      item: 'trechos contabilizáveis',
      esperado: esperadoLocal.trechos_contabilizaveis ?? recalculado.trechos,
      obtido: viagens.trechos,
      origem: esperadoLocal.trechos_contabilizaveis
        ? 'conferencia.local.json'
        : `recálculo ${anoBase}`,
      ...inteiro,
    })

    if (declarado.reservas_contabilizaveis !== undefined) {
      conferencias.push({
        item: 'arquivo: reservas contabilizáveis',
        esperado: declarado.reservas_contabilizaveis,
        obtido: recalculadoDoArquivo.reservas,
        origem: 'declarado × arquivo',
        ...inteiro,
      })
    }

    if (declarado.trechos_contabilizaveis !== undefined) {
      conferencias.push({
        item: 'arquivo: trechos contabilizáveis',
        esperado: declarado.trechos_contabilizaveis,
        obtido: recalculadoDoArquivo.trechos,
        origem: 'declarado × arquivo',
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

    // Mesmo tratamento dos contadores acima: o valor de conferência da origem
    // descreve o arquivo inteiro, e o banco guarda um ano. Ele continua sendo
    // conferido — contra o arquivo, que é o que ele mede.
    conferencias.push({
      item: 'distância contabilizável (km)',
      esperado: esperadoLocal.distancia_total_km ?? recalculado.distanciaKm,
      obtido: viagens.distanciaKm,
      tolerancia: tol,
      casas: 1,
      origem: esperadoLocal.distancia_total_km
        ? 'conferencia.local.json'
        : `recálculo ${anoBase}`,
    })

    conferencias.push({
      item: 'emissão total (kg CO₂e)',
      esperado: esperadoLocal.emissao_total_kg_co2e ?? recalculado.co2Kg,
      obtido: viagens.co2Kg,
      tolerancia: tol,
      casas: 1,
      origem: esperadoLocal.emissao_total_kg_co2e
        ? 'conferencia.local.json'
        : `recálculo ${anoBase}`,
    })

    if (conferenciaDaBase.distancia_total_km !== undefined) {
      conferencias.push({
        item: 'arquivo: distância total (km)',
        esperado: conferenciaDaBase.distancia_total_km,
        obtido: recalculadoDoArquivo.distanciaKm,
        tolerancia: tol,
        casas: 1,
        origem: 'declarado × arquivo',
      })
    }

    if (conferenciaDaBase.emissao_total_kg_co2e !== undefined) {
      conferencias.push({
        item: 'arquivo: emissão total (kg CO₂e)',
        esperado: conferenciaDaBase.emissao_total_kg_co2e,
        obtido: recalculadoDoArquivo.co2Kg,
        tolerancia: tol,
        casas: 1,
        origem: 'declarado × arquivo',
      })
    }

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

    await conferirMotivosDosAlertas(db, conferencias)

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

    /* --------------------------------------------------------- marítimo */

    falhas += await conferirMaritimo(db)

    /* ---------------------------------- consolidado: coerência entre telas */

    falhas += await conferirCoerenciaDoConsolidado(db)

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

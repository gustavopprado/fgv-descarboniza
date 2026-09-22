/**
 * Carga do relatório do agente de carga — CLAUDE.md §8.
 *
 * **O valor informado pelo agente é o dado primário e não se recalcula** (§8.1).
 * Esta carga lê, classifica e grava; ela só produz número onde o agente não
 * informou nenhum, e aí a estimativa fica carimbada no documento com a média
 * usada e o tamanho da amostra (§8.2).
 *
 * **O escopo de recarga é o bloco de origem — a aba —, nunca o ano** (§8.4). Um
 * bloco atravessa a virada do ano, então dois blocos do mesmo agente contêm
 * documentos do mesmo ano; com o ano no escopo, recarregar um apagaria os
 * documentos do outro.
 *
 * Sem `--gravar` o script **não escreve nada**: imprime o que faria. A leitura
 * tem cascata de contagem, derivação de previsão e recusa de linha impossível —
 * conferir isso antes de gravar é mais barato que descobrir depois.
 *
 * Uso:
 *   npx tsx scripts/ingest-maritimo.ts [caminho.xlsx]
 *   npx tsx scripts/ingest-maritimo.ts [caminho.xlsx] --gravar
 */
import 'dotenv/config'

import ExcelJS from 'exceljs'

import {
  detectarAtipico,
  ehImpossivel,
  estimar,
  montarReferencias,
  type Referencias,
} from '../src/lib/calculo/maritimo'
import {
  ANO_BASE_INVENTARIO,
  maritimoAmostraMinimaCorredor,
  maritimoLimiarAtipico,
  maritimoLimiarImpossivel,
} from '../src/lib/env'
import { calcularResiduo, lerTabelaDePortos } from '../src/lib/maritimo-resumo'
import {
  ALERTA_SEM_DATA_EFETIVA,
  corredorDe,
  lerRelatorioMaritimo,
  mediana,
  modalDe,
  type AbaLida,
  type BlocoLido,
  type CelulaBruta,
  type EmbarqueLido,
} from '../src/lib/maritimo'
import { idEmbarque } from '../src/server/documentos/ids'
import {
  anoDe,
  hojeIso,
  mesDe,
  montarAlertas,
  type Alerta,
  type DocEmbarque,
  type DocPorto,
  type NivelDado,
  type Severidade,
} from '../src/server/documentos/tipos'
import { validarEmbarque } from '../src/server/documentos/validacao'
import { gravarEmLotes, apagarIds, type DocumentoParaGravar } from '../src/server/escrita'
import { COLECAO } from '../src/server/firestore'
import {
  caminhoDaBase,
  conectarFirestore,
  ehEntrada,
  executar,
  lerJson,
  n,
  tituloDaEtapa,
} from './_comum'

/** Frete upstream, Escopo 3 cat. 4 — inclusive a carga aérea de fornecedor. */
const ESCOPO_FRETE = 3

export const ALERTA_LINHA_ATIPICA = 'co2_por_container_atipico'
export const ALERTA_SEM_DATA = 'embarque_sem_data_de_referencia'
export const ALERTA_LOCODE_NAO_CADASTRADO = 'porto_sem_cadastro'
export const ALERTA_LOCODE_NAO_E_PORTO = 'codigo_de_carregamento_nao_e_porto'
export const ALERTA_NOME_DIVERGE_DO_CODIGO = 'nome_do_lugar_diverge_do_codigo'
export const ALERTA_ESTIMADO = 'co2_estimado_por_media'
export const ALERTA_RESIDUO_ESTIMADO = 'container_sem_detalhe_de_agente'
export const ALERTA_CONTAGEM_POR_REGISTRO_DE_DI = 'contagem_por_registro_de_di'
export const ALERTA_ROTULO_SEM_PORTO = 'rotulo_de_porto_sem_correspondencia'

/**
 * O agente dos contêineres que a contagem tem e nenhum relatório detalha.
 *
 * **É marca, não nome.** A aba de resumo reparte a contagem entre os agentes
 * dividindo peso por uma constante, que é a conta circular que a §8.1 proíbe —
 * então quem são esses contêineres é justamente o que o arquivo não diz. Um
 * nome de agente aqui seria inventar a atribuição, além de pôr nome real em
 * repositório público (§2.1).
 */
export const AGENTE_SEM_DETALHE = 'SEM_DETALHE'

/**
 * Severidade de cada aviso.
 *
 * `erro` é o que impede confiar no número; `atencao` é o que merece revisão;
 * `informativo` é o que só precisa ficar contável. **Nenhum deles tira a linha
 * do total** — o que sai do total é a linha recusada, e linha recusada não vira
 * documento (§8.1.1).
 */
function severidadeDe(tipo: string): Severidade {
  if (
    tipo === ALERTA_LOCODE_NAO_CADASTRADO ||
    tipo === ALERTA_LOCODE_NAO_E_PORTO ||
    tipo === ALERTA_ROTULO_SEM_PORTO
  ) {
    return 'erro'
  }
  if (
    tipo === ALERTA_LINHA_ATIPICA ||
    tipo === ALERTA_SEM_DATA ||
    tipo === ALERTA_ESTIMADO ||
    tipo === ALERTA_RESIDUO_ESTIMADO ||
    tipo === ALERTA_CONTAGEM_POR_REGISTRO_DE_DI ||
    tipo === ALERTA_NOME_DIVERGE_DO_CODIGO ||
    tipo === ALERTA_SEM_DATA_EFETIVA ||
    tipo === 'embarque_previsto' ||
    tipo === 'sem_contagem_de_container' ||
    tipo === 'embarque_sem_locode'
  ) {
    return 'atencao'
  }
  return 'informativo'
}

/* ------------------------------------------------------------------ leitura */

/** O que uma célula do ExcelJS vale para este módulo. */
function celula(bruta: ExcelJS.CellValue): CelulaBruta {
  if (bruta === null || bruta === undefined) return null
  if (bruta instanceof Date) return bruta
  if (typeof bruta === 'object') {
    // Fórmula: o que vale é o resultado em cache, nunca o texto renderizado.
    // A coluna de status é fórmula que depende da data de hoje e chega sem
    // cache — ler o texto importaria um valor volátil (§8.3).
    if ('result' in bruta) return celula(bruta.result as ExcelJS.CellValue)
    if ('richText' in bruta) {
      return bruta.richText.map((p) => p.text).join('')
    }
    if ('text' in bruta) return String(bruta.text)
    return null
  }
  if (typeof bruta === 'boolean' || typeof bruta === 'number' || typeof bruta === 'string') {
    return bruta
  }
  return null
}

/** Abre o arquivo e devolve as abas em matriz, para o módulo puro ler. */
export async function lerRelatorioDoArquivo(caminho: string): Promise<AbaLida[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(caminho)
  return wb.worksheets.map((ws) => {
    const linhas: CelulaBruta[][] = []
    for (let r = 1; r <= ws.rowCount; r++) {
      const linha = ws.getRow(r)
      const celulas: CelulaBruta[] = []
      for (let c = 1; c <= ws.columnCount; c++) celulas.push(celula(linha.getCell(c).value))
      linhas.push(celulas)
    }
    return { nome: ws.name, linhas }
  })
}

/* ------------------------------------------------------------------ montagem */

export type Recusa = {
  bloco: string
  shipmentId: string
  linha: number
  motivo: string
}

export type Montagem = {
  documentos: DocumentoParaGravar<DocEmbarque>[]
  recusas: Recusa[]
  blocos: BlocoLido[]
  /** Abas com nome de bloco de agente e sem detalhe: fonte que não veio. */
  semDetalhe: string[]
  ignoradas: string[]
  /** Até quando o arquivo sabe o que aconteceu (§8.3). */
  referencia: string | null
  referencias: Referencias
  /** Quantos documentos ficaram em cada nível da cascata (§8.2). */
  porNivel: Map<NivelDado, number>
  /** Os contêineres que nenhum agente detalhou. Nulo se a aba de resumo não veio. */
  residuo: RelatorioDoResiduo | null
  /**
   * Os escopos de recarga desta carga (§8.4) — as abas de detalhe, mais a de
   * resumo quando ela produziu resíduo.
   *
   * Existe separado de `blocos` porque o resíduo tem escopo próprio e **não é um
   * bloco de detalhe**: sem ele aqui, a limpeza não alcançaria os documentos de
   * resíduo antigos e uma recarga que os reduzisse deixaria os anteriores no
   * banco, somando duas vezes.
   */
  escopos: string[]
}

export type Parametros = {
  limiarAtipico: number
  limiarImpossivel: number
  amostraMinimaDoCorredor: number
}

/**
 * Monta os documentos a partir das abas lidas.
 *
 * Separado da gravação e da leitura de arquivo de propósito: é o que permite
 * exercitar a cascata, as recusas e a validação sem Firestore e sem planilha.
 */
export function montarEmbarques(
  abas: AbaLida[],
  portos: Map<string, DocPorto>,
  parametros: Parametros,
  /**
   * Rótulo da tabela de resumo para código de porto (§8.2).
   *
   * **Mora fora do repositório**, no molde do mapa de primeiro nome da planilha
   * do cartão (§7): o rótulo da tabela é a grafia local de um terminal, e uma
   * lista deles no código publicaria por onde a empresa importa (§2.2). Mapa
   * vazio não derruba a carga — cada rótulo sem correspondência entra com porto
   * nulo, alerta próprio e estimativa pela média geral, e o script anuncia
   * quantos foram.
   */
  mapaDePortos: Map<string, string | null> = new Map(),
): Montagem {
  const { blocos, semDetalhe, ignoradas, referencia } = lerRelatorioMaritimo(abas)
  const todos = blocos.flatMap((b) => b.embarques)

  /**
   * **A mediana geral vem de todos os embarques lidos, não do bloco.** O que a
   * linha impossível contradiz é a ordem de grandeza do módulo, e um bloco
   * pequeno teria mediana frágil demais para servir de referência (§8.1.1).
   */
  const medianaGeral = mediana(
    todos.filter((e) => e.co2Kg !== null && e.co2Kg > 0).map((e) => e.co2Kg as number),
  )

  const recusas: Recusa[] = []
  // O tipo carrega a data já estreitada: depois da guarda abaixo, `etd` deixa
  // de ser opcional, e é ele que define o período do documento.
  const aceitos: (EmbarqueLido & { etd: string })[] = []
  for (const e of todos) {
    if (ehImpossivel(e.co2Kg, medianaGeral, parametros.limiarImpossivel)) {
      recusas.push({
        bloco: e.bloco,
        shipmentId: e.shipmentId,
        linha: e.linha,
        motivo:
          'ordem de grandeza incompatível com o módulo; confira na origem antes de importar',
      })
      continue
    }
    /**
     * Embarque sem data de referência fica de fora, e **os dois motivos apontam
     * para a mesma linha**: ela é previsão pelo grau conclusivo (§8.3) — nenhuma
     * data, nem prevista nem efetiva —, e não tem período a que ser atribuída
     * (§9.9). Previsão fica fora do total por decisão; esta aqui nem chega a
     * poder entrar.
     *
     * Ela não some em silêncio: é contada como recusa, com motivo, e a
     * conferência de cobertura a exige do outro lado da conta (§8.4).
     */
    if (e.etd === null) {
      recusas.push({
        bloco: e.bloco,
        shipmentId: e.shipmentId,
        linha: e.linha,
        motivo: e.previsao
          ? 'previsão sem itinerário: nenhuma data, então não há período a que atribuí-la'
          : 'sem data de partida prevista: não há período a que atribuí-lo',
      })
      continue
    }
    aceitos.push({ ...e, etd: e.etd })
  }

  /**
   * **As referências da cascata saem só do marítimo** (§8.2, e a decisão sobre o
   * frete aéreo).
   *
   * A unidade da cascata é CO₂ por contêiner, e frete aéreo não tem contêiner:
   * onde a coluna numérica traz um número para uma carga aérea, ela está
   * contando volumes, não contêineres. Uma média de kg por contêiner que
   * incluísse essas linhas mediria duas coisas diferentes na mesma conta — o
   * mesmo motivo por que o aéreo sai do indicador da tela.
   */
  const maritimos = aceitos.filter((e) => modalDe(e.trans) !== 'aereo')

  const referencias = montarReferencias(
    maritimos.map((e) => ({
      co2Kg: e.co2Kg,
      containers: e.containers,
      pesoKg: e.pesoKg,
      corredor: corredorDe(e),
      destino: e.locodeDestino,
    })),
    { amostraMinimaDoCorredor: parametros.amostraMinimaDoCorredor },
  )

  /** Medianas por corredor, para a sinalização de linha atípica. */
  const medianasPorCorredor = new Map<string, { mediana: number; amostra: number }>()
  const porCorredor = new Map<string, number[]>()
  for (const e of maritimos) {
    const corredor = corredorDe(e)
    if (corredor === null || e.co2Kg === null || e.co2Kg <= 0) continue
    if (e.containers === null || e.containers <= 0) continue
    const taxas = porCorredor.get(corredor) ?? []
    taxas.push(e.co2Kg / e.containers)
    porCorredor.set(corredor, taxas)
  }
  for (const [corredor, taxas] of porCorredor) {
    const m = mediana(taxas)
    if (m !== null) medianasPorCorredor.set(corredor, { mediana: m, amostra: taxas.length })
  }

  const atualizadoEm = hojeIso()
  const documentos: DocumentoParaGravar<DocEmbarque>[] = []
  const porNivel = new Map<NivelDado, number>()

  for (const e of aceitos) {
    const corredor = corredorDe(e)
    const alertas: Alerta[] = e.alertas.map((a) => ({
      ...a,
      severidade: severidadeDe(a.tipo),
    }))

    // Cascata da §8.2: medido primeiro, estimativa só onde não há número.
    let nivelDado: NivelDado = 'medido'
    let co2Kg = e.co2Kg ?? 0
    let fator: DocEmbarque['fator'] = null
    let baseDaEstimativa: number | null = null

    if (e.co2Kg === null || e.co2Kg <= 0) {
      // Estimar frete aéreo a partir de referência marítima erraria por ordem
      // de grandeza, e a cascata não tem degrau aéreo: o agente informa ou o
      // embarque não entra. Hoje não acontece — todos vêm com CO₂ —, e a guarda
      // existe para o dia em que acontecer.
      if (modalDe(e.trans) === 'aereo') {
        recusas.push({
          bloco: e.bloco,
          shipmentId: e.shipmentId,
          linha: e.linha,
          motivo:
            'frete aéreo sem CO₂ do agente: as referências da cascata são por contêiner, ' +
            'e estimá-lo por elas erraria por ordem de grandeza',
        })
        continue
      }
      const estimativa = estimar(
        {
          co2Kg: e.co2Kg,
          containers: e.containers,
          pesoKg: e.pesoKg,
          corredor,
          destino: e.locodeDestino,
        },
        referencias,
      )
      if (estimativa === null) {
        recusas.push({
          bloco: e.bloco,
          shipmentId: e.shipmentId,
          linha: e.linha,
          motivo: 'sem CO₂ do agente e sem contagem nem peso para estimar',
        })
        continue
      }
      nivelDado = estimativa.nivel
      co2Kg = estimativa.co2Kg
      baseDaEstimativa = estimativa.referencia.amostra
      fator = {
        categoria: estimativa.referencia.categoria,
        chave: estimativa.referencia.chave,
        // A versão é o carimbo de **quando** a média foi tirada. Sem ela, a
        // mesma média recalculada depois sobre base maior daria outro número e
        // o documento não diria qual valia (§8.2).
        versao: `carga_${atualizadoEm}`,
        valor: estimativa.referencia.valor,
        unidade: estimativa.referencia.unidade,
        vigenciaInicio: atualizadoEm,
      }
      alertas.push({
        tipo: ALERTA_ESTIMADO,
        descricao: `emissão estimada no nível "${nivelDado}"; o agente não informou CO₂`,
        severidade: severidadeDe(ALERTA_ESTIMADO),
      })
    } else {
      const atipico = detectarAtipico(
        { co2Kg: e.co2Kg, containers: e.containers, corredor },
        medianasPorCorredor,
        { limiar: parametros.limiarAtipico, amostraMinima: parametros.amostraMinimaDoCorredor },
      )
      if (atipico !== null) {
        // **Entra no total, com alerta** (§8.1.1). Tirá-la seria remover emissão
        // real do inventário por ser incomum.
        alertas.push({
          tipo: ALERTA_LINHA_ATIPICA,
          descricao: `CO₂ por contêiner ${n(atipico.razao, 2)}× a mediana do corredor`,
          severidade: severidadeDe(ALERTA_LINHA_ATIPICA),
        })
      }
    }

    // Geografia: o cadastro de portos é o que dá coordenada ao mapa, e é ele
    // que permite dizer que um código de carregamento não é porto.
    const ehAereo = modalDe(e.trans) === 'aereo'
    for (const [locode, nome] of [
      [e.locodeOrigem, e.origemNome],
      [e.locodeDestino, e.destinoNome],
    ] as [string | null, string | null][]) {
      if (locode === null) continue
      const porto = portos.get(locode)
      if (porto === undefined) {
        alertas.push({
          tipo: ALERTA_LOCODE_NAO_CADASTRADO,
          descricao: `o código ${locode} não está no cadastro de portos; rode o seed`,
          severidade: severidadeDe(ALERTA_LOCODE_NAO_CADASTRADO),
        })
        continue
      }
      if (!ehAereo && !porto.ehPorto) {
        alertas.push({
          tipo: ALERTA_LOCODE_NAO_E_PORTO,
          descricao: `${locode} não é porto marítimo na lista oficial, e o embarque é marítimo`,
          severidade: severidadeDe(ALERTA_LOCODE_NAO_E_PORTO),
        })
      }
      if (nome !== null && !mesmoLugar(nome, porto.nome)) {
        // Em transbordo e em frete aéreo o código é o ponto de carregamento e o
        // nome é a origem real. Guardar os dois é o que permite sinalizar em vez
        // de escolher um em silêncio.
        alertas.push({
          tipo: ALERTA_NOME_DIVERGE_DO_CODIGO,
          descricao: `o relatório chama ${locode} de outro lugar; o código é o que vale no mapa`,
          severidade: severidadeDe(ALERTA_NOME_DIVERGE_DO_CODIGO),
        })
      }
    }

    const doc: DocEmbarque = {
      modulo: 'maritimo',
      // Linha de relatório de agente: embarque de verdade, com identificador e
      // itinerário. O resíduo de porto entra pela outra porta (§8.2).
      unidade: 'embarque',
      // A carga aérea de fornecedor é modal aéreo dentro do módulo marítimo:
      // frete upstream, cat. 4, não viagem de passageiro, cat. 6 (§8.3).
      modal: ehAereo ? 'aereo' : 'maritimo',
      escopo: ESCOPO_FRETE,
      periodicidade: 'evento',
      ano: anoDe(e.etd),
      mes: mesDe(e.etd),
      empresa: e.empresa,
      fator,
      ...montarAlertas(alertas),
      atualizadoEm,
      agente: e.agente,
      bloco: e.bloco,
      shipmentId: e.shipmentId,
      houseRef: e.houseRef,
      trans: e.trans,
      mode: e.mode,
      portoOrigem: e.locodeOrigem,
      portoDestino: e.locodeDestino,
      portoOrigemNome: e.origemNome,
      portoDestinoNome: e.destinoNome,
      navioPartida: e.navioPartida,
      navioTransbordo: e.navioTransbordo,
      etd: e.etd,
      eta: e.eta,
      atd: e.atd,
      ata: e.ata,
      ataFinal: e.ataFinal,
      pesoKg: e.pesoKg,
      volumeM3: e.volumeM3,
      containers: e.containers,
      containersFonte: e.containersFonte,
      co2Kg,
      nivelDado,
      baseDaEstimativa,
      status: e.statusBruto,
      previsao: e.previsao,
    }

    const id = idEmbarque(e.agente, e.shipmentId)
    validarEmbarque(id, doc)
    documentos.push({ id, dados: doc })
    porNivel.set(nivelDado, (porNivel.get(nivelDado) ?? 0) + 1)
  }

  /**
   * O resíduo entra **depois** dos embarques, e a ordem não é arbitrária: ele é
   * o que a contagem tem e o detalhe não cobre, então precisa dos documentos
   * medidos já montados para saber o que subtrair.
   */
  const comResiduo = montarResiduoDePortos(
    abas,
    documentos,
    parametros,
    mapaDePortos,
    ANO_BASE_INVENTARIO,
    atualizadoEm,
  )
  if (comResiduo !== null) {
    documentos.push(...comResiduo.documentos)
    for (const d of comResiduo.documentos) {
      porNivel.set(d.dados.nivelDado, (porNivel.get(d.dados.nivelDado) ?? 0) + 1)
    }
  }

  return {
    documentos,
    recusas,
    blocos,
    semDetalhe,
    ignoradas,
    referencia,
    referencias,
    porNivel,
    residuo: comResiduo?.relatorio ?? null,
    escopos: [...blocos.map((b) => b.bloco), ...(comResiduo ? [comResiduo.relatorio.bloco] : [])],
  }
}

/* ------------------------------------------------------- resíduo de portos */

/**
 * O mapa que liga o rótulo da tabela de resumo ao código de porto.
 *
 * **Mora fora do repositório**, no molde do mapa de primeiro nome da planilha do
 * cartão (§7): o rótulo é a grafia local de um terminal, e uma lista deles no
 * código publicaria por onde a empresa importa (§2.2).
 *
 * Ausente, devolve mapa vazio em vez de falhar: cada rótulo entra com porto nulo
 * e estimativa pela média geral, e quem roda vê quantos foram. A carga é a mesma
 * função na conferência de cobertura, então as duas leem o mesmo mapa.
 */
export function lerMapaDePortos(): Map<string, string | null> {
  const caminho = caminhoDaBase(
    undefined,
    'BASE_MARITIMO_PORTOS_PATH',
    'dados/maritimo-portos-resumo.json',
  )
  try {
    return new Map(Object.entries(lerJson<Record<string, string | null>>(caminho)))
  } catch {
    return new Map()
  }
}

export type LinhaDeResiduo = {
  rotulo: string
  locode: string | null
  containers: number
  co2Kg: number
  nivel: NivelDado
  amostra: number
}

export type RelatorioDoResiduo = {
  bloco: string
  ano: number
  /** Contêineres que a tabela de resumo conta no período. */
  totalDeclarado: number
  /** Dos quais o detalhe linha a linha cobre. */
  medido: number
  /** E dos quais nenhum agente detalhou. */
  residuo: number
  co2Kg: number
  linhas: LinhaDeResiduo[]
  /** Rótulos da tabela que o mapa não liga a nenhum porto do cadastro. */
  semCorrespondencia: string[]
}

/**
 * Os contêineres que a tabela de resumo conta e nenhum agente detalhou (§8.2).
 *
 * **Isto é a cascata da §8.2 aplicada um degrau acima do embarque, e a mudança
 * é deliberada.** Até aqui a cascata estimava o CO₂ de um embarque que existia
 * no relatório sem número; ela não inventava o embarque. Agora ela também
 * responde por contêineres que existem na contagem e não têm linha nenhuma —
 * porque dois dos três agentes não entregam detalhe, e o inventário de um agente
 * só cobria menos de um terço da operação.
 *
 * **O que entra da aba de resumo é a contagem, e só ela.** Peso, CO₂ e a
 * repartição por agente daquela aba continuam fora, pelo motivo da §8.1: lá o
 * CO₂ de um sai do indicador dos outros e o peso de um é resíduo de subtração
 * dos demais. O que se usa aqui é contado, e o CO₂ vem das médias medidas no
 * agente que entrega detalhe — nunca do número que a aba declara.
 *
 * **O resíduo não é um embarque, e o documento diz isso** (`unidade`). Ele soma
 * em emissão e em contêineres, que é o ponto; não soma em contagem de embarques,
 * porque não há embarque a contar.
 */
function montarResiduoDePortos(
  abas: AbaLida[],
  jaMontados: DocumentoParaGravar<DocEmbarque>[],
  parametros: Parametros,
  mapaDePortos: Map<string, string | null>,
  anoBase: number,
  atualizadoEm: string,
): { documentos: DocumentoParaGravar<DocEmbarque>[]; relatorio: RelatorioDoResiduo } | null {
  const tabela = lerTabelaDePortos(abas)
  if (tabela === null) return null

  /**
   * **O ano da tabela precisa ser o ano-base, e a conferência é o ponto.** Um
   * arquivo de outro período aplicado ao ano-base carregaria a contagem errada
   * sem nada parecer quebrado — o total simplesmente apareceria diferente.
   */
  if (tabela.ano !== anoBase) {
    throw new Error(
      `A tabela de contêineres por porto é de ${tabela.ano} e o ano-base do ` +
        `inventário é ${anoBase}. Carregar uma no lugar da outra trocaria o período ` +
        'inteiro sem nenhum erro aparecer.',
    )
  }

  const medidosDoAno = jaMontados
    .map((d) => d.dados)
    .filter(
      (d) => d.unidade === 'embarque' && d.modal === 'maritimo' && !d.previsao && d.ano === anoBase,
    )

  /**
   * **As referências do resíduo saem do próprio ano, e não da coleção inteira.**
   *
   * A coleção atravessa três anos civis, e o CO₂ por contêiner do último é
   * sensivelmente menor que o do ano-base — uma diferença que pode ser mudança
   * no cálculo do agente, não eficiência, e que a origem ainda não confirmou.
   * Uma média com os dois períodos juntos teria amostra maior e mediria duas
   * coisas: o resíduo de um ano sairia puxado pela taxa de outro, com cara de
   * número mais robusto. Amostra grande de coisa errada continua sendo errada.
   *
   * Só entra `medido`: estimar a partir de estimativa empilharia erro sem sinal.
   */
  const referencias = montarReferencias(
    medidosDoAno
      .filter((d) => d.nivelDado === 'medido')
      .map((d) => ({
        co2Kg: d.co2Kg,
        containers: d.containers,
        pesoKg: d.pesoKg,
        corredor: d.portoOrigem === null ? null : `${d.portoOrigem}-${d.portoDestino ?? ''}`,
        destino: d.portoDestino,
      })),
    { amostraMinimaDoCorredor: parametros.amostraMinimaDoCorredor },
  )

  const medidoPorLocode = new Map<string, number>()
  for (const d of medidosDoAno) {
    const chave = d.portoDestino ?? ''
    medidoPorLocode.set(chave, (medidoPorLocode.get(chave) ?? 0) + (d.containers ?? 0))
  }
  const medidoTotal = [...medidoPorLocode.values()].reduce((a, b) => a + b, 0)

  const semCorrespondencia: string[] = []
  const medidoPorRotulo = new Map<string, number>()
  for (const porto of tabela.portos) {
    const locode = mapaDePortos.get(porto.rotulo) ?? null
    if (locode === null) semCorrespondencia.push(porto.rotulo)
    else medidoPorRotulo.set(porto.rotulo, medidoPorLocode.get(locode) ?? 0)
  }

  const residuos = calcularResiduo(tabela, medidoPorRotulo)
  const residuoTotal = residuos.reduce((s, r) => s + r.total, 0)

  /**
   * **A identidade que segura tudo:** medido mais resíduo é exatamente o que a
   * tabela conta. Ela é o que pega um porto medido que não tem linha na tabela —
   * caso em que o detalhe soma contêineres que a contagem não conhece e o total
   * passaria da contagem do período sem ninguém ver.
   */
  if (medidoTotal + residuoTotal !== tabela.total) {
    throw new Error(
      `O detalhe cobre ${medidoTotal} contêiner(es) e o resíduo ${residuoTotal}, ` +
        `somando ${medidoTotal + residuoTotal} — e a tabela de resumo conta ` +
        `${tabela.total}. Há porto no detalhe que a tabela não tem, ou o contrário.`,
    )
  }

  const documentos: DocumentoParaGravar<DocEmbarque>[] = []
  const linhas: LinhaDeResiduo[] = []

  for (const residuo of residuos) {
    if (residuo.total === 0) continue
    const locode = mapaDePortos.get(residuo.rotulo) ?? null
    let co2DoPorto = 0
    let nivel: NivelDado = 'estimado_media'
    let amostra = 0

    for (const [indice, containers] of residuo.meses.entries()) {
      if (containers === 0) continue
      const mes = `${anoBase}-${String(indice + 1).padStart(2, '0')}`

      const estimativa = estimar(
        { co2Kg: null, containers, pesoKg: null, corredor: null, destino: locode },
        referencias,
      )
      if (estimativa === null) {
        throw new Error(
          'Não há embarque medido suficiente para estimar os contêineres que nenhum ' +
            'agente detalhou. Sem referência, o resíduo não pode entrar — e deixá-lo de ' +
            'fora esconderia a maior parte da operação.',
        )
      }
      nivel = estimativa.nivel
      amostra = estimativa.referencia.amostra
      co2DoPorto += estimativa.co2Kg

      const alertas: Alerta[] = [
        {
          tipo: ALERTA_RESIDUO_ESTIMADO,
          descricao:
            `${containers} contêiner(es) sem detalhe de agente; emissão estimada no ` +
            `nível "${estimativa.nivel}"`,
          severidade: severidadeDe(ALERTA_RESIDUO_ESTIMADO),
        },
        {
          tipo: ALERTA_CONTAGEM_POR_REGISTRO_DE_DI,
          descricao: 'a contagem vem da tabela de resumo, que usa o registro de DI',
          severidade: severidadeDe(ALERTA_CONTAGEM_POR_REGISTRO_DE_DI),
        },
      ]
      if (locode === null) {
        alertas.push({
          tipo: ALERTA_ROTULO_SEM_PORTO,
          descricao: 'o rótulo da tabela não corresponde a nenhum porto do cadastro',
          severidade: severidadeDe(ALERTA_ROTULO_SEM_PORTO),
        })
      }

      const shipmentId = `RESIDUO_${mes}_${residuo.rotulo}`
      const doc: DocEmbarque = {
        modulo: 'maritimo',
        unidade: 'residuo',
        modal: 'maritimo',
        escopo: ESCOPO_FRETE,
        periodicidade: 'evento',
        ano: anoBase,
        mes,
        empresa: null,
        fator: {
          categoria: estimativa.referencia.categoria,
          chave: estimativa.referencia.chave,
          versao: `carga_${atualizadoEm}`,
          valor: estimativa.referencia.valor,
          unidade: estimativa.referencia.unidade,
          vigenciaInicio: atualizadoEm,
        },
        ...montarAlertas(alertas),
        atualizadoEm,
        agente: AGENTE_SEM_DETALHE,
        bloco: tabela.aba,
        shipmentId,
        houseRef: null,
        trans: null,
        mode: null,
        portoOrigem: null,
        portoDestino: locode,
        portoOrigemNome: null,
        portoDestinoNome: residuo.rotulo,
        navioPartida: null,
        navioTransbordo: null,
        etd: null,
        eta: null,
        atd: null,
        ata: null,
        ataFinal: null,
        pesoKg: null,
        volumeM3: null,
        containers,
        containersFonte: 'resumo',
        co2Kg: estimativa.co2Kg,
        nivelDado: estimativa.nivel,
        baseDaEstimativa: estimativa.referencia.amostra,
        status: null,
        previsao: false,
      }

      const id = idEmbarque(doc.agente, shipmentId)
      validarEmbarque(id, doc)
      documentos.push({ id, dados: doc })
    }

    linhas.push({
      rotulo: residuo.rotulo,
      locode,
      containers: residuo.total,
      co2Kg: co2DoPorto,
      nivel,
      amostra,
    })
  }

  return {
    documentos,
    relatorio: {
      bloco: tabela.aba,
      ano: tabela.ano,
      totalDeclarado: tabela.total,
      medido: medidoTotal,
      residuo: residuoTotal,
      co2Kg: linhas.reduce((s, l) => s + l.co2Kg, 0),
      linhas,
      semCorrespondencia,
    },
  }
}

/** Comparação frouxa de nome de lugar, só para decidir se vale sinalizar. */
function mesmoLugar(a: string, b: string): boolean {
  const chave = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim()
  const x = chave(a)
  const y = chave(b)
  return x === y || x.includes(y) || y.includes(x)
}

/* --------------------------------------------------------------------- main */

async function principal(): Promise<void> {
  const argumentos = process.argv.slice(2)
  const gravar = argumentos.includes('--gravar')
  const caminho = caminhoDaBase(
    argumentos.find((a) => !a.startsWith('--')),
    'BASE_MARITIMO_PATH',
    'dados/relatorio-maritimo.xlsx',
  )

  const parametros: Parametros = {
    limiarAtipico: maritimoLimiarAtipico(),
    limiarImpossivel: maritimoLimiarImpossivel(),
    amostraMinimaDoCorredor: maritimoAmostraMinimaCorredor(),
  }

  tituloDaEtapa(gravar ? 'Embarques marítimos' : 'Embarques marítimos (simulação)')

  const { db, encerrar } = conectarFirestore()
  try {
    const portosLidos = await db.collection(COLECAO.porto).get()
    const portos = new Map<string, DocPorto>(
      portosLidos.docs.map((d) => [d.id, d.data() as DocPorto]),
    )
    console.log(`  Cadastro de portos: ${portos.size} código(s).`)
    if (portos.size === 0) {
      console.log('  Rode `npm run seed:portos` antes: sem cadastro não há mapa.')
    }

    /**
     * O mapa que liga o rótulo da tabela de resumo ao código de porto.
     *
     * Ausente, a carga continua: cada rótulo entra com porto nulo e estimativa
     * pela média geral, e o relatório abaixo diz quantos. Derrubar aqui seria
     * trocar um número menos específico por nenhum número.
     */
    const mapaDePortos = lerMapaDePortos()
    console.log(
      mapaDePortos.size > 0
        ? `  Mapa de rótulos de porto: ${mapaDePortos.size} entrada(s).`
        : '  Mapa de rótulos de porto ausente: o resíduo cai na média geral.',
    )

    const abas = await lerRelatorioDoArquivo(caminho)
    const montagem = montarEmbarques(abas, portos, parametros, mapaDePortos)

    relatar(montagem, parametros)

    if (!gravar) {
      console.log('\nSimulação: nada foi gravado. Rode de novo com --gravar.')
      return
    }

    /**
     * **Grava tudo, depois limpa cada escopo** (§9.9).
     *
     * A ordem é a da recarga, e a razão de fazer os blocos juntos em vez de um
     * de cada vez é outra: um embarque que mudou de bloco entre exports seria
     * apagado pela limpeza do bloco antigo antes de a escrita do novo acontecer,
     * se os blocos fossem processados em sequência.
     */
    if (montagem.documentos.length === 0) {
      throw new Error(
        'A carga não produziu documento nenhum. Isso apagaria os blocos inteiros ' +
          'sem nada no lugar — quase sempre é erro de leitura do arquivo.',
      )
    }
    const repetidos =
      montagem.documentos.length - new Set(montagem.documentos.map((d) => d.id)).size
    if (repetidos > 0) {
      throw new Error(
        `Há ${repetidos} identificador(es) repetido(s) entre os blocos: um documento ` +
          'sobrescreveria o outro em silêncio. Confira o identificador de embarque na origem.',
      )
    }

    await gravarEmLotes(COLECAO.embarque, montagem.documentos, db)

    const novos = new Set(montagem.documentos.map((d) => d.id))
    let removidos = 0
    for (const escopo of montagem.escopos) {
      const existentes = await db
        .collection(COLECAO.embarque)
        .where('bloco', '==', escopo)
        .select()
        .get()
      const obsoletos = existentes.docs.map((d) => d.id).filter((id) => !novos.has(id))
      await apagarIds(COLECAO.embarque, obsoletos, db)
      removidos += obsoletos.length
    }

    console.log(
      `\n  Gravados ${montagem.documentos.length} embarque(s); removidos ${removidos} ` +
        'documento(s) obsoleto(s) dos mesmos blocos.',
    )
  } finally {
    await encerrar()
  }
}

function relatar(m: Montagem, parametros: Parametros): void {
  console.log(`\n  Abas de detalhe: ${m.blocos.length}`)
  for (const b of m.blocos) {
    const semStatus = b.linhasSemStatus > 0 ? `, ${b.linhasSemStatus} sem status` : ''
    console.log(
      `    ${b.bloco} (agente ${b.agente}) — cabeçalho na linha ${b.linhaDoCabecalho}, ` +
        `${b.colunas.length} coluna(s), ${b.embarques.length} embarque(s)${semStatus}`,
    )
    for (const d of b.descartadas) {
      console.log(`      linha ${d.linha} descartada: ${d.motivo}`)
    }
  }
  if (m.semDetalhe.length > 0) {
    console.log(
      `\n  ${m.semDetalhe.length} bloco(s) de agente SEM detalhe linha a linha: ` +
        `${m.semDetalhe.join(', ')}`,
    )
    console.log('    Eles não viram embarque nenhum, e o volume deles não está neste total.')
    console.log('    Isso é ausência de FONTE, não de qualidade: a cascata da §8.2 estima o')
    console.log('    que falta dentro de um embarque, não o embarque que não existe. E os')
    console.log('    totais que a aba de resumo lhes atribui não substituem o detalhe — a')
    console.log('    conta de lá é circular, e a §8.1 proíbe reproduzi-la.')
  }
  if (m.ignoradas.length > 0) {
    console.log(`  Abas ignoradas, sem forma de detalhe nem nome de bloco: ${m.ignoradas.join(', ')}`)
  }
  console.log(`  O arquivo enxerga o que aconteceu até ${m.referencia ?? '—'} (§8.3).`)

  if (m.residuo === null) {
    console.log('\n  Tabela de contêineres por porto: ausente. Só o detalhe entra.')
  } else {
    const r = m.residuo
    console.log(`\n  Contêineres que nenhum agente detalhou (§8.2), aba ${r.bloco}, ano ${r.ano}:`)
    console.log(
      `    a contagem do período é ${r.totalDeclarado}; o detalhe cobre ${r.medido} ` +
        `e ${r.residuo} entram por estimativa.`,
    )
    for (const l of r.linhas) {
      console.log(
        `    ${l.rotulo} (${l.locode ?? 'sem porto'}): ${l.containers} contêiner(es), ` +
          `${n(l.co2Kg)} kg por ${l.nivel} sobre amostra de ${l.amostra}`,
      )
    }
    console.log(`    Resíduo somado: ${n(r.co2Kg)} kg CO₂e.`)
    if (r.semCorrespondencia.length > 0) {
      console.log(
        `    ${r.semCorrespondencia.length} rótulo(s) sem porto no mapa: ` +
          `${r.semCorrespondencia.join(', ')} — entram pela média geral.`,
      )
    }
    console.log('    Esta contagem usa o registro de DI; o detalhe usa a partida (§8.3).')
  }

  console.log(`\n  Qualidade do dado (§8.2), com limiares ${JSON.stringify(parametros)}:`)
  for (const nivel of [
    'medido',
    'estimado_corredor',
    'estimado_porto',
    'estimado_media',
    'estimado_peso',
  ] as const) {
    console.log(`    ${nivel}: ${m.porNivel.get(nivel) ?? 0}`)
  }

  if (m.recusas.length > 0) {
    console.log(`\n  Linhas recusadas (${m.recusas.length}) — não entram no inventário:`)
    for (const r of m.recusas) {
      console.log(`    ${r.bloco} linha ${r.linha}, embarque ${r.shipmentId}: ${r.motivo}`)
    }
    console.log(
      '    A recusa é contada pela conferência de cobertura como diferença declarada,',
    )
    console.log('    e não como perda silenciosa (§8.4).')
  }

  const porCodigo = new Map<string, number>()
  for (const d of m.documentos) {
    for (const c of d.dados.alertasCodigos) porCodigo.set(c, (porCodigo.get(c) ?? 0) + 1)
  }
  if (porCodigo.size > 0) {
    console.log('\n  Alertas por documento afetado:')
    for (const [codigo, quantos] of [...porCodigo].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${codigo}: ${quantos}`)
    }
  }

  const total = m.documentos.reduce((s, d) => s + d.dados.co2Kg, 0)
  console.log(`\n  ${m.documentos.length} embarque(s), ${n(total / 1000, 1)} t CO₂e.`)
}

if (ehEntrada(import.meta.url)) void executar('ingest-maritimo', principal)

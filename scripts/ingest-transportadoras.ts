/**
 * Carga do relatório de entregas por filial — CLAUDE.md §9.
 *
 * O relatório é export do sistema de faturamento, uma linha por entrega. Esta
 * carga lê, descarta o que não é entrega rodoviária doméstica, calcula a emissão
 * por tonelada-quilômetro com o fator declarado em `fatorEmissao` e grava um
 * documento por entrega (§10.11).
 *
 * **O escopo de recarga é o ano da entrega.** O export é filtrado por ano na
 * origem — o rodapé do arquivo diz qual —, então recarregar um ano não encosta
 * nos outros. Não é a filial: as três vêm no mesmo relatório, e um escopo por
 * filial faria uma carga apagar as entregas das outras duas.
 *
 * **Sem fator carregado a carga falha explicitamente** (§9.2, §10.8). Não há
 * valor aproximado nem número de memória: o fator é uma média pública, com fonte
 * e vigência, e é ele que a tela de método declara. A simulação continua rodando
 * sem ele, para a leitura poder ser conferida antes de o fator existir — e diz
 * que a gravação vai parar.
 *
 * Sem `--gravar` o script **não escreve nada**: imprime o que faria. A leitura
 * tem descarte por distância, descarte silencioso de linha sem cliente e
 * derivação de identidade por ordem de linha — conferir isso antes de gravar é
 * mais barato que descobrir depois.
 *
 * Uso:
 *   npx tsx scripts/ingest-transportadoras.ts [caminho.xlsx]
 *   npx tsx scripts/ingest-transportadoras.ts [caminho.xlsx] --gravar
 */
import 'dotenv/config'

import { CATEGORIA_FRETE_RODOVIARIO } from '../src/lib/calculo/categorias'
import { co2DaEntrega } from '../src/lib/calculo/rodoviario'
import { transportadorasDistanciaMaximaKm } from '../src/lib/env'
import {
  lerRelatorioDeEntregas,
  type EntregaLida,
  type Parametros,
  type RelatorioDeEntregas,
} from '../src/lib/transportadoras'
import type { AbaLida } from '../src/lib/planilha'
import { idEntregaRodoviaria } from '../src/server/documentos/ids'
import {
  anoDe,
  hojeIso,
  mesDe,
  montarAlertas,
  type DocEntregaRodoviaria,
  type FatorAplicado,
} from '../src/server/documentos/tipos'
import { validarEntregaRodoviaria } from '../src/server/documentos/validacao'
import { gravarEmLotes, apagarIds, type DocumentoParaGravar } from '../src/server/escrita'
import { carregarFatores, FatorAusenteError } from '../src/server/fatores'
import { COLECAO } from '../src/server/firestore'
import { lerPacoteXlsx } from './_xlsx'
import {
  caminhoDaBase,
  conectarFirestore,
  ehEntrada,
  executar,
  n,
  tituloDaEtapa,
} from './_comum'

/**
 * Frete pago pela empresa e operado por terceiro: Escopo 3.
 *
 * **A categoria é que se reparte, e o escopo não** — cat. 4 no que é CIF, cat. 9
 * no que é FOB (§9.1). A operação usa os dois e o relatório não traz a
 * modalidade por linha, então todo documento grava `regimeFrete: 'indefinido'`,
 * no sentido de "não separável nesta fonte".
 */
const ESCOPO_FRETE = 3

/** A chave do fator dentro da categoria: um fator médio, não um por veículo. */
export const CHAVE_DO_FATOR = 'geral'

/* ------------------------------------------------------------------ montagem */

export type Montagem = {
  documentos: DocumentoParaGravar<DocEntregaRodoviaria>[]
  relatorio: RelatorioDeEntregas
  /** Quantas entregas cada filial trouxe, na ordem dos códigos. */
  porFilial: Map<string, { entregas: number; co2Kg: number; pesoKg: number }>
  /** Anos presentes na carga; cada um é um escopo de recarga. */
  anos: number[]
  /** Distância que sobrou depois do corte, para o relatório da carga. */
  distancia: { minimaKm: number | null; maximaKm: number | null }
  /** Nulo quando o fator não está carregado: a simulação segue, a gravação não. */
  fator: FatorAplicado | null
}

/**
 * Monta os documentos a partir das abas lidas.
 *
 * Separado da leitura de arquivo e da gravação de propósito: é o que permite
 * exercitar descarte, identidade e validação sem Firestore e sem planilha.
 *
 * `fatorEm` resolve o fator vigente na data da entrega — **a data da entrega, e
 * não a da carga**: fator que muda no meio do ano vale para o que aconteceu
 * depois dele, e cada documento carrega o que usou (§10.1).
 */
export function montarEntregas(
  abas: AbaLida[],
  parametros: Parametros,
  fatorEm: ((data: string) => FatorAplicado) | null,
): Montagem {
  const relatorio = lerRelatorioDeEntregas(abas, parametros)
  const atualizadoEm = hojeIso()

  const documentos: DocumentoParaGravar<DocEntregaRodoviaria>[] = []
  const porFilial = new Map<string, { entregas: number; co2Kg: number; pesoKg: number }>()
  const anos = new Set<number>()
  let fator: FatorAplicado | null = null

  for (const entrega of relatorio.entregas) {
    anos.add(anoDe(entrega.data))
    const soma = porFilial.get(entrega.filial) ?? { entregas: 0, co2Kg: 0, pesoKg: 0 }
    soma.entregas += 1
    soma.pesoKg += entrega.pesoKg

    if (fatorEm !== null) {
      const doFator = fatorEm(entrega.data)
      fator = doFator
      const co2Kg = co2DaEntrega(entrega, doFator.valor)
      soma.co2Kg += co2Kg
      documentos.push(montarDocumento(entrega, doFator, co2Kg, atualizadoEm))
    }

    porFilial.set(entrega.filial, soma)
  }

  const distancias = relatorio.entregas.map((e) => e.distanciaKm)

  return {
    documentos,
    relatorio,
    porFilial,
    anos: [...anos].sort(),
    distancia: {
      minimaKm: distancias.length === 0 ? null : Math.min(...distancias),
      maximaKm: distancias.length === 0 ? null : Math.max(...distancias),
    },
    fator,
  }
}

function montarDocumento(
  entrega: EntregaLida,
  fator: FatorAplicado,
  co2Kg: number,
  atualizadoEm: string,
): DocumentoParaGravar<DocEntregaRodoviaria> {
  const doc: DocEntregaRodoviaria = {
    modulo: 'transportadoras',
    modal: 'rodoviario',
    escopo: ESCOPO_FRETE,
    periodicidade: 'evento',
    ano: anoDe(entrega.data),
    mes: mesDe(entrega.data),
    // A origem não informa a empresa do grupo por entrega; nulo é categoria
    // visível na agregação, não registro ausente (§10.10, §14).
    empresa: null,
    fator,
    // A leitura não produz alerta: o que ela não entende ela recusa, com motivo,
    // e a recusa é contada no relatório da carga em vez de virar aviso no
    // documento (§9.3).
    ...montarAlertas([]),
    atualizadoEm,
    filial: entrega.filial,
    data: entrega.data,
    ordem: entrega.ordem,
    clienteCodigo: entrega.clienteCodigo,
    distanciaKm: entrega.distanciaKm,
    pesoKg: entrega.pesoKg,
    co2Kg,
    // A origem mistura CIF e FOB sem separá-los por linha (§9.1).
    regimeFrete: 'indefinido',
    nivelDado: 'calculado_tkm',
  }

  const id = idEntregaRodoviaria(entrega.filial, entrega.data, entrega.ordem)
  validarEntregaRodoviaria(id, doc)
  return { id, dados: doc }
}

/* --------------------------------------------------------------------- main */

async function principal(): Promise<void> {
  const argumentos = process.argv.slice(2)
  const gravar = argumentos.includes('--gravar')
  const caminho = caminhoDaBase(
    argumentos.find((a) => !a.startsWith('--')),
    'BASE_TRANSPORTADORAS_PATH',
    'dados/transportadoras.xlsx',
  )

  const parametros: Parametros = {
    distanciaMaximaKm: transportadorasDistanciaMaximaKm(),
  }

  tituloDaEtapa(gravar ? 'Entregas rodoviárias' : 'Entregas rodoviárias (simulação)')

  const { db, encerrar } = conectarFirestore()
  try {
    const fatores = await carregarFatores(db)
    const fatorEm = (data: string): FatorAplicado =>
      fatores.vigente(CATEGORIA_FRETE_RODOVIARIO, CHAVE_DO_FATOR, data)

    const abas = lerPacoteXlsx(caminho)

    /**
     * **A ausência do fator para a gravação e não para a simulação.**
     *
     * Na gravação, seguir sem fator seria inventar o número do módulo — e a §10.8
     * é explícita: o cálculo falha, não aproxima. Na simulação, parar aqui
     * esconderia justamente o que se quer conferir antes de existir fator:
     * quantas linhas entram, quantas saem e por quê.
     *
     * **Quem descobre a ausência é a primeira entrega, não um sondagem com data
     * inventada.** A primeira versão perguntava pela vigência numa data fixa e
     * antiga, e isso afirmava um arranjo que o fator não tem: um fator vigente a
     * partir do ano relatado era declarado ausente, a simulação nunca calculava
     * emissão e a gravação parava **com o fator carregado**. Deixando a
     * resolução acontecer na data da entrega, a mensagem de erro passa a dizer
     * qual data ficou sem cobertura — que é a falha de verdade.
     */
    let montagem: Montagem
    try {
      montagem = montarEntregas(abas, parametros, fatorEm)
    } catch (erro) {
      if (gravar || !(erro instanceof FatorAusenteError)) throw erro
      montagem = montarEntregas(abas, parametros, null)
    }

    relatar(montagem, parametros)

    if (!gravar) {
      console.log('\nSimulação: nada foi gravado. Rode de novo com --gravar.')
      return
    }

    if (montagem.documentos.length === 0) {
      throw new Error(
        'A carga não produziu documento nenhum. Isso apagaria o ano inteiro sem ' +
          'nada no lugar — quase sempre é erro de leitura do arquivo (§10.9).',
      )
    }
    const repetidos =
      montagem.documentos.length - new Set(montagem.documentos.map((d) => d.id)).size
    if (repetidos > 0) {
      throw new Error(
        `Há ${repetidos} identificador(es) repetido(s): um documento sobrescreveria ` +
          'o outro em silêncio. Confira a ordem das linhas dentro do par filial+data.',
      )
    }

    /**
     * **Grava tudo, depois limpa cada ano** (§10.9).
     *
     * A ordem é a da recarga: apagar primeiro abriria uma janela com o módulo
     * vazio, e uma falha no meio da escrita deixaria o período sem dado nenhum.
     * Os anos são limpos depois de toda a escrita, e não um a um durante, porque
     * uma entrega que mude de data entre exports seria apagada pela limpeza do
     * ano antigo antes de a escrita do novo acontecer.
     */
    await gravarEmLotes(COLECAO.entregaRodoviaria, montagem.documentos, db)

    const novos = new Set(montagem.documentos.map((d) => d.id))
    let removidos = 0
    for (const ano of montagem.anos) {
      const existentes = await db
        .collection(COLECAO.entregaRodoviaria)
        .where('ano', '==', ano)
        .select()
        .get()
      const obsoletos = existentes.docs.map((d) => d.id).filter((id) => !novos.has(id))
      await apagarIds(COLECAO.entregaRodoviaria, obsoletos, db)
      removidos += obsoletos.length
    }

    console.log(
      `\n  Gravadas ${montagem.documentos.length} entrega(s); removidos ${removidos} ` +
        `documento(s) obsoleto(s) do(s) ano(s) ${montagem.anos.join(', ')}.`,
    )
  } finally {
    await encerrar()
  }
}

function relatar(m: Montagem, parametros: Parametros): void {
  const r = m.relatorio

  console.log(
    `\n  Aba "${r.aba}", cabeçalho na linha ${r.linhaDoCabecalho}, ` +
      `colunas: ${r.colunas.join(', ')}.`,
  )
  if (r.ignoradas.length > 0) {
    console.log(`  Abas sem cabeçalho de entregas, ignoradas: ${r.ignoradas.join(', ')}`)
  }

  console.log(`\n  ${r.entregas.length} entrega(s) aceita(s), por filial:`)
  for (const [filial, soma] of [...m.porFilial].sort()) {
    const emissao = m.fator === null ? '—' : `${n(soma.co2Kg / 1000, 1)} t CO₂e`
    console.log(
      `    filial ${filial}: ${soma.entregas} entrega(s), ` +
        `${n(soma.pesoKg / 1000, 1)} t movimentada(s), ${emissao}`,
    )
  }
  console.log(`  Ano(s) na carga: ${m.anos.join(', ') || '—'}`)
  console.log(
    `  Distância que sobrou: de ${m.distancia.minimaKm === null ? '—' : n(m.distancia.minimaKm, 2)} ` +
      `a ${m.distancia.maximaKm === null ? '—' : n(m.distancia.maximaKm, 2)} km.`,
  )

  console.log(`\n  Descartes:`)
  console.log(
    `    sem cliente: ${r.semCliente} — linha em branco e rodapé de filtros do ` +
      'relatório, descarte sem alerta (§9.3)',
  )
  console.log(
    `    internacional: ${r.internacionais.linhas} acima de ` +
      `${n(parametros.distanciaMaximaKm, 0)} km` +
      (r.internacionais.linhas === 0
        ? ''
        : `, de ${n(r.internacionais.menorDistanciaKm ?? 0, 0)} a ` +
          `${n(r.internacionais.maiorDistanciaKm ?? 0, 0)} km`),
  )
  if (r.semCodigoDoCliente > 0) {
    console.log(
      `    aceitas sem código de cliente: ${r.semCodigoDoCliente} — entram com o ` +
        'campo nulo; o agregado é por filial',
    )
  }

  if (r.descartadas.length > 0) {
    console.log(`\n  Linhas recusadas com motivo (${r.descartadas.length}):`)
    const porMotivo = new Map<string, number[]>()
    for (const d of r.descartadas) {
      const linhas = porMotivo.get(d.motivo) ?? []
      linhas.push(d.linha)
      porMotivo.set(d.motivo, linhas)
    }
    for (const [motivo, linhas] of porMotivo) {
      const amostra = linhas.slice(0, 8).join(', ')
      const resto = linhas.length > 8 ? `, … (+${linhas.length - 8})` : ''
      console.log(`    ${motivo}: ${linhas.length} — linha(s) ${amostra}${resto}`)
    }
  }

  if (m.fator === null) {
    console.log(
      '\n  Fator de frete rodoviário NÃO carregado: a emissão não foi calculada e a ' +
        'gravação vai parar.',
    )
    console.log(
      `    Carregue a categoria "${CATEGORIA_FRETE_RODOVIARIO}", chave "${CHAVE_DO_FATOR}", ` +
        'em kg CO₂e por tonelada-quilômetro, com fonte e vigência (§9.2, §10.8).',
    )
    return
  }

  const total = m.documentos.reduce((s, d) => s + d.dados.co2Kg, 0)
  console.log(
    `\n  Fator: ${n(m.fator.valor, 4)} ${m.fator.unidade} — ${m.fator.categoria}/` +
      `${m.fator.chave}, versão ${m.fator.versao}, vigente desde ${m.fator.vigenciaInicio}.`,
  )
  console.log(`  ${m.documentos.length} entrega(s), ${n(total / 1000, 1)} t CO₂e.`)
  console.log(
    '  Regime de frete: indefinido em todos os documentos — a origem mistura CIF e ' +
      'FOB e não traz a modalidade por linha (§9.1).',
  )
}

if (ehEntrada(import.meta.url)) void executar('ingest-transportadoras', principal)

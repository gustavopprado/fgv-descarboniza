/**
 * Carga da pesquisa de mobilidade casa-trabalho — CLAUDE.md §6.
 *
 * RESTRIÇÃO CENTRAL (§6.1): o endereço não entra no banco. O script lê o CEP,
 * geocodifica, calcula a distância até a fábrica e grava apenas distância,
 * bairro e cidade. CEP, logradouro, número e complemento não são persistidos,
 * não vão para log, não vão para cache e não sobram em arquivo temporário —
 * as colunas de logradouro, número e complemento nem chegam a ser lidas.
 *
 * Demais regras (§6.2):
 *  - dois deslocamentos por dia útil;
 *  - dias úteis por mês e coordenada da fábrica são parâmetros de ambiente;
 *  - bicicleta e a pé emitem zero; ônibus usa fator por passageiro-km;
 *  - respostas marcadas como exceção ficam fora da média e vão para o método;
 *  - combustível fora do lugar é erro de entrada e é sinalizado.
 *
 * O fator vem da tabela `fator_emissao`; sem fator vigente a carga falha em vez
 * de assumir um valor.
 *
 * Uso:
 *   npm run ingest:mobilidade -- [caminho/da/planilha.xlsx] [--ano-base AAAA]
 *
 * Reexecutar é seguro: a carga apaga e regrava o ano-base inteiro, dentro de
 * uma transação.
 */
import ExcelJS from 'exceljs'

import {
  ALERTA_COMBUSTIVEL_AUSENTE,
  ALERTA_COMBUSTIVEL_DESCONHECIDO,
  ALERTA_COMBUSTIVEL_INDEVIDO,
  ALERTA_DISTANCIA_IMPROVAVEL,
  ALERTA_GEOCODIFICACAO,
  ALERTA_MATRICULA_NUMERICA,
  ALERTA_RESPOSTA_SUBSTITUIDA,
  ALERTA_TRANSPORTE_DESCONHECIDO,
  categoriaDoFator,
  chaveDoFator,
  combustivelDaResposta,
  emissaoMensal,
  emiteZero,
  exigeCombustivel,
  transporteDaResposta,
  type Combustivel,
  type Transporte,
} from '../src/lib/calculo/mobilidade'
import {
  criarCalculadoraDeDistancia,
  type Coordenada,
  type ModoDeDistancia,
} from '../src/lib/geo/distancia'
import { aguardar, criarGeocodificador } from '../src/lib/geo/geocodificar'
import { canonizarLugares, chaveNormalizada, uf } from '../src/lib/texto'
import { coordenadaFabrica, diasUteisMes, obrigatoria } from '../src/lib/env'
import { idFuncionario, idMobilidade } from '../src/server/documentos/ids'
import {
  hojeIso,
  montarAlertas,
  type DocFuncionario,
  type DocMobilidade,
  type FatorAplicado,
  type Severidade,
} from '../src/server/documentos/tipos'
import { validarMobilidade } from '../src/server/documentos/validacao'
import { gravarCadastro, recarregarEscopo } from '../src/server/escrita'
import { carregarFatores } from '../src/server/fatores'
import { COLECAO } from '../src/server/firestore'
import {
  caminhoDaBase,
  conectarFirestore,
  ehEntrada,
  executar,
  n,
  tituloDaEtapa,
} from './_comum'

/** Gravidade por tipo de alerta; o que não estiver aqui é "atenção". */
const SEVERIDADE: Record<string, Severidade> = {
  [ALERTA_RESPOSTA_SUBSTITUIDA]: 'informativo',
  [ALERTA_COMBUSTIVEL_INDEVIDO]: 'atencao',
  [ALERTA_COMBUSTIVEL_DESCONHECIDO]: 'atencao',
  [ALERTA_DISTANCIA_IMPROVAVEL]: 'atencao',
  [ALERTA_MATRICULA_NUMERICA]: 'atencao',
  [ALERTA_COMBUSTIVEL_AUSENTE]: 'erro',
  [ALERTA_TRANSPORTE_DESCONHECIDO]: 'erro',
  [ALERTA_GEOCODIFICACAO]: 'erro',
}

function severidadeDe(tipo: string): Severidade {
  return SEVERIDADE[tipo] ?? 'atencao'
}

/* --------------------------------------------------------------- parâmetros */

function argumentoNomeado(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function argumentoPosicional(): string | undefined {
  const bruto = process.argv.slice(2)
  const posicional: string[] = []
  for (let i = 0; i < bruto.length; i++) {
    if (bruto[i].startsWith('--')) {
      i++
      continue
    }
    posicional.push(bruto[i])
  }
  return posicional[0]
}

function anoBase(): number {
  const bruto = argumentoNomeado('ano-base') ?? process.env.MOBILIDADE_ANO_BASE
  if (!bruto) {
    throw new Error(
      'Informe o ano-base em MOBILIDADE_ANO_BASE ou em --ano-base AAAA. ' +
        'Sem ano-base não há carga.',
    )
  }
  const ano = Number(bruto)
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    throw new Error(`Ano-base inválido: ${bruto}`)
  }
  return ano
}

function modoDeDistancia(): ModoDeDistancia {
  const bruto = obrigatoria('MOBILIDADE_DISTANCIA_MODO').toLowerCase()
  if (bruto === 'rodoviaria' || bruto === 'ortodromica') return bruto
  throw new Error(
    `MOBILIDADE_DISTANCIA_MODO inválido: "${bruto}". Use "rodoviaria" ou "ortodromica".`,
  )
}

/** Acima disso o deslocamento diário não se sustenta e a resposta vira exceção. */
function distanciaMaximaKm(): number {
  const bruto = obrigatoria('MOBILIDADE_DISTANCIA_MAXIMA_KM')
  const valor = Number(bruto)
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error(`MOBILIDADE_DISTANCIA_MAXIMA_KM inválida: ${bruto}`)
  }
  return valor
}

/* ------------------------------------------------------------ leitura do xls */

type Alerta = { tipo: string; descricao: string }

/**
 * Resposta já sem endereço. O CEP existe só enquanto a linha é lida e morre no
 * fim da geocodificação — não entra nesta estrutura.
 */
export type Resposta = {
  linha: number
  matricula: string
  nome: string
  bairro: string
  cidade: string
  estado: string
  transporte: Transporte | null
  combustivel: Combustivel | null
  respondidoEm: Date | null
  alertas: Alerta[]
}

const COLUNAS = {
  matricula: 'MATRICULA',
  nome: 'NOME',
  cep: 'CEP',
  bairro: 'BAIRRO',
  cidade: 'CIDADE',
  estado: 'ESTADO',
  transporte: 'TRANSPORTE',
  combustivel: 'COMBUSTIVEL',
  dataHora: 'DATA/HORA',
} as const

/** Localiza o cabeçalho pelo conteúdo, não por índice fixo. */
function mapearColunas(ws: ExcelJS.Worksheet): {
  linhaCabecalho: number
  indice: Record<keyof typeof COLUNAS, number>
} {
  const limite = Math.min(ws.rowCount, 20)
  for (let r = 1; r <= limite; r++) {
    const rotulos = new Map<string, number>()
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, i) => {
      const texto = cell.text ?? String(cell.value ?? '')
      rotulos.set(chaveNormalizada(texto), i)
    })
    if (!rotulos.has(COLUNAS.matricula) || !rotulos.has(COLUNAS.transporte)) continue

    const indice = {} as Record<keyof typeof COLUNAS, number>
    for (const [campo, rotulo] of Object.entries(COLUNAS) as [
      keyof typeof COLUNAS,
      string,
    ][]) {
      const i = rotulos.get(rotulo)
      if (i === undefined) {
        throw new Error(`A planilha não tem a coluna "${rotulo}".`)
      }
      indice[campo] = i
    }
    return { linhaCabecalho: r, indice }
  }
  throw new Error(
    'Não encontrei a linha de cabeçalho na planilha (procuro por "Matrícula" e "Transporte").',
  )
}

/** Texto de uma célula, já aparado. Nunca converte número em texto sem aviso. */
function textoDaCelula(cell: ExcelJS.Cell): string {
  const valor = cell.value
  if (valor === null || valor === undefined) return ''
  // `text` resolve texto rico, fórmula e hyperlink; o valor cru é a reserva.
  const texto = typeof cell.text === 'string' ? cell.text : String(valor)
  return texto.trim()
}

/** `DD/MM/AAAA, HH:MM:SS` é texto na origem e precisa de parse explícito. */
export function dataDaResposta(bruto: string): Date | null {
  const m = bruto.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:,?\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  )
  if (!m) return null
  const [, dia, mes, ano, hora = '0', minuto = '0', segundo = '0'] = m
  const data = new Date(
    Number(ano),
    Number(mes) - 1,
    Number(dia),
    Number(hora),
    Number(minuto),
    Number(segundo),
  )
  return Number.isNaN(data.getTime()) ? null : data
}

export type LinhaLida = { resposta: Resposta; cep: string }

/**
 * Lê a planilha. O CEP volta separado da resposta, de propósito: quem consome
 * usa e descarta, e nada além daqui enxerga endereço.
 *
 * Exportada junto com `manterUltimaPorMatricula` para que a leitura possa ser
 * conferida contra o arquivo real sem rede e sem banco.
 */
export async function lerPlanilha(caminho: string): Promise<LinhaLida[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(caminho)
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('A planilha não tem nenhuma aba.')

  const { linhaCabecalho, indice } = mapearColunas(ws)
  const lidas: LinhaLida[] = []

  for (let r = linhaCabecalho + 1; r <= ws.rowCount; r++) {
    const linha = ws.getRow(r)
    const celulaMatricula = linha.getCell(indice.matricula)
    const matricula = textoDaCelula(celulaMatricula)
    if (matricula === '') continue // linha vazia ou de total

    const alertas: Alerta[] = []
    // Matrícula é texto de comprimento variável: converter para número perderia
    // zero à esquerda e juntaria pessoas diferentes.
    if (typeof celulaMatricula.value === 'number') {
      alertas.push({
        tipo: ALERTA_MATRICULA_NUMERICA,
        descricao:
          'a matrícula veio como número na planilha; zero à esquerda pode ter se perdido na origem',
      })
    }

    const transporteBruto = textoDaCelula(linha.getCell(indice.transporte))
    const combustivelBruto = textoDaCelula(linha.getCell(indice.combustivel))
    const transporte = transporteDaResposta(chaveNormalizada(transporteBruto))
    if (!transporte) {
      alertas.push({
        tipo: ALERTA_TRANSPORTE_DESCONHECIDO,
        descricao: `resposta de transporte não reconhecida: "${transporteBruto}"`,
      })
    }

    let combustivel: Combustivel | null = null
    if (combustivelBruto !== '') {
      combustivel = combustivelDaResposta(chaveNormalizada(combustivelBruto))
      if (!combustivel) {
        alertas.push({
          tipo: ALERTA_COMBUSTIVEL_DESCONHECIDO,
          descricao: `resposta de combustível não reconhecida: "${combustivelBruto}"`,
        })
      }
    }

    // Validação da §6.2, na leitura adotada: combustível só se aplica onde o
    // deslocamento queima o combustível do próprio respondente.
    if (transporte && exigeCombustivel(transporte) && !combustivel) {
      alertas.push({
        tipo: ALERTA_COMBUSTIVEL_AUSENTE,
        descricao: `modal "${transporte}" exige combustível e a resposta veio sem`,
      })
    }
    if (transporte && !exigeCombustivel(transporte) && combustivelBruto !== '') {
      alertas.push({
        tipo: ALERTA_COMBUSTIVEL_INDEVIDO,
        descricao: `modal "${transporte}" não usa combustível do respondente e a resposta veio preenchida`,
      })
      combustivel = null
    }

    lidas.push({
      cep: textoDaCelula(linha.getCell(indice.cep)),
      resposta: {
        linha: r,
        matricula,
        nome: textoDaCelula(linha.getCell(indice.nome)),
        bairro: textoDaCelula(linha.getCell(indice.bairro)),
        cidade: textoDaCelula(linha.getCell(indice.cidade)),
        estado: uf(textoDaCelula(linha.getCell(indice.estado))),
        transporte,
        combustivel,
        respondidoEm: dataDaResposta(textoDaCelula(linha.getCell(indice.dataHora))),
        alertas,
      },
    })
  }

  return lidas
}

/** Uma resposta por matrícula: vence a mais recente, a anterior é sinalizada. */
export function manterUltimaPorMatricula(lidas: LinhaLida[]): {
  mantidas: LinhaLida[]
  substituidas: number
} {
  const porMatricula = new Map<string, LinhaLida>()
  let substituidas = 0

  for (const atual of lidas) {
    const anterior = porMatricula.get(atual.resposta.matricula)
    if (!anterior) {
      porMatricula.set(atual.resposta.matricula, atual)
      continue
    }
    substituidas++
    const tempoAnterior = anterior.resposta.respondidoEm?.getTime() ?? 0
    const tempoAtual = atual.resposta.respondidoEm?.getTime() ?? 0
    const vencedora = tempoAtual >= tempoAnterior ? atual : anterior
    vencedora.resposta.alertas.push({
      tipo: ALERTA_RESPOSTA_SUBSTITUIDA,
      descricao: 'havia mais de uma resposta para esta matrícula; ficou a mais recente',
    })
    porMatricula.set(atual.resposta.matricula, vencedora)
  }

  return { mantidas: [...porMatricula.values()], substituidas }
}

/* ------------------------------------------------------------------ carga */

type RegistroCalculado = {
  resposta: Resposta
  distanciaKm: number
  co2KgMes: number
  excecao: boolean
  motivoExcecao: string | null
  /** Fator que produziu a emissão; nulo em modal que emite zero por definição. */
  fator: FatorAplicado | null
}

async function principal(): Promise<void> {
  const caminho = caminhoDaBase(
    argumentoPosicional(),
    'BASE_MOBILIDADE_PATH',
    'dados/mobilidade.xlsx',
  )
  const ano = anoBase()
  const dias = diasUteisMes()
  const fabrica = coordenadaFabrica()
  const modo = modoDeDistancia()
  const limiteDistancia = distanciaMaximaKm()

  const geocodificador = criarGeocodificador()
  const calculadora = criarCalculadoraDeDistancia(modo)

  tituloDaEtapa('Parâmetros')
  console.log(`  ano-base ${ano} · ${dias} dias úteis/mês · ida e volta`)
  console.log(`  distância: ${modo} (${calculadora.nome}) · geocodificação: ${geocodificador.nome}`)
  console.log(`  acima de ${n(limiteDistancia, 0)} km a resposta vira exceção`)

  /* ---------------------------------------------------------- leitura */
  tituloDaEtapa('Leitura da planilha')
  const lidas = await lerPlanilha(caminho)
  const { mantidas, substituidas } = manterUltimaPorMatricula(lidas)
  console.log(`  ${lidas.length} respostas lidas, ${mantidas.length} após deduplicar.`)
  if (substituidas > 0) console.log(`  ${substituidas} respostas substituídas por outra mais recente.`)

  // Uma grafia por cidade e por bairro, senão o agrupamento se fragmenta e a
  // supressão de grupos pequenos atua onde não deveria (§3.1).
  const cidades = canonizarLugares(mantidas.map((l) => l.resposta.cidade))
  const bairros = canonizarLugares(mantidas.map((l) => l.resposta.bairro))
  console.log(`  ${cidades.size} cidades e ${bairros.size} bairros distintos após normalizar.`)

  /* --------------------------------------------- geocodificação e distância */
  tituloDaEtapa('Geocodificação e distância')
  console.log('  o endereço é usado aqui e descartado; nada dele é gravado.')

  const registros: RegistroCalculado[] = []
  let semCoordenada = 0
  let processadas = 0

  for (const { resposta, cep } of mantidas) {
    processadas++
    if (processadas % 25 === 0) {
      console.log(`  ${processadas}/${mantidas.length}...`)
    }

    let coordenada: Coordenada | null = null
    try {
      coordenada = await geocodificador.localizar(cep)
    } catch {
      // Uma falha de rede não derruba a carga inteira: tenta de novo e, se
      // insistir, a resposta entra como exceção e aparece no método.
      await aguardar(geocodificador.intervaloMs * 2)
      try {
        coordenada = await geocodificador.localizar(cep)
      } catch {
        coordenada = null
      }
    }
    await aguardar(geocodificador.intervaloMs)

    if (!coordenada) {
      semCoordenada++
      resposta.alertas.push({
        tipo: ALERTA_GEOCODIFICACAO,
        descricao: 'não foi possível obter coordenada a partir do CEP informado',
      })
      registros.push({
        resposta,
        distanciaKm: 0,
        co2KgMes: 0,
        excecao: true,
        motivoExcecao: 'CEP não geocodificado',
        fator: null,
      })
      continue
    }

    let distanciaKm: number
    try {
      distanciaKm = await calculadora.entre(coordenada, fabrica)
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro)
      throw new Error(`Falha ao calcular distância (linha ${resposta.linha}): ${motivo}`)
    }
    // A coordenada morre aqui. A partir deste ponto só existe distância.
    distanciaKm = Math.round(distanciaKm * 100) / 100

    registros.push({
      resposta,
      distanciaKm,
      co2KgMes: 0,
      excecao: false,
      motivoExcecao: null,
      fator: null,
    })
  }
  if (semCoordenada > 0) {
    console.log(`  ${semCoordenada} respostas ficaram sem coordenada e entram como exceção.`)
  }

  /* ------------------------------------------------------------- emissão */
  const { db, encerrar } = conectarFirestore()

  try {
    const fatores = await carregarFatores(db)
    if (fatores.total === 0) {
      throw new Error(
        'A coleção fatorEmissao está vazia. Rode npm run seed:fatores-mobilidade ' +
          'antes da carga.',
      )
    }

    tituloDaEtapa('Emissão')
    // Fator vigente na virada do ano-base, e não na data de cada resposta: a
    // data da resposta não é gravada (§9.5), então só esta referência pode ser
    // reproduzida depois por scripts/verificar.ts.
    const dataDoFator = `${ano}-12-31`

    for (const registro of registros) {
      const { resposta } = registro
      if (registro.excecao) continue

      const transporte = resposta.transporte
      if (!transporte) {
        registro.excecao = true
        registro.motivoExcecao = 'transporte não reconhecido'
        continue
      }
      if (exigeCombustivel(transporte) && !resposta.combustivel) {
        registro.excecao = true
        registro.motivoExcecao = 'combustível ausente em modal que depende dele'
        continue
      }
      if (registro.distanciaKm > limiteDistancia) {
        registro.excecao = true
        registro.motivoExcecao = 'distância incompatível com deslocamento diário'
        resposta.alertas.push({
          tipo: ALERTA_DISTANCIA_IMPROVAVEL,
          descricao: `distância acima do limite de ${n(limiteDistancia, 0)} km configurado`,
        })
        continue
      }

      if (emiteZero(transporte)) {
        registro.co2KgMes = 0
        continue
      }

      const fator = fatores.vigente(
        categoriaDoFator(transporte),
        chaveDoFator(transporte, resposta.combustivel),
        dataDoFator,
      )
      registro.fator = fator
      registro.co2KgMes = emissaoMensal({
        distanciaKm: registro.distanciaKm,
        diasUteisMes: dias,
        fatorKgPorKm: fator.valor,
      })
    }

    const noCalculo = registros.filter((r) => !r.excecao)
    const totalMes = noCalculo.reduce((s, r) => s + r.co2KgMes, 0)
    console.log(
      `  ${noCalculo.length} respostas na média, ${registros.length - noCalculo.length} em exceção.`,
    )
    console.log(
      `  ${n(totalMes)} kg CO₂e/mês no total, ` +
        `${n(noCalculo.length > 0 ? totalMes / noCalculo.length : 0)} kg por funcionário/mês.`,
    )

    /* -------------------------------------------------------- funcionários */
    tituloDaEtapa('Funcionários')

    const cadastro = await db.collection(COLECAO.funcionario).get()
    const dadosPorId = new Map<string, DocFuncionario>()
    const idPorMatricula = new Map<string, string>()
    const idsPorNome = new Map<string, string[]>()
    const semMatricula = new Set<string>()

    for (const documento of cadastro.docs) {
      const f = documento.data() as DocFuncionario
      dadosPorId.set(documento.id, f)
      if (f.matricula) idPorMatricula.set(f.matricula, documento.id)
      else semMatricula.add(documento.id)
      const chave = chaveNormalizada(f.nome)
      const lista = idsPorNome.get(chave)
      if (lista) lista.push(documento.id)
      else idsPorNome.set(chave, [documento.id])
    }

    const funcionariosParaGravar: { id: string; dados: DocFuncionario }[] = []
    const idPorResposta = new Map<string, string>()
    let vinculados = 0
    let criados = 0

    for (const { resposta } of registros) {
      const jaConhecido = idPorMatricula.get(resposta.matricula)
      if (jaConhecido) {
        idPorResposta.set(resposta.matricula, jaConhecido)
        continue
      }

      // A mesma pessoa pode já existir por outra base, sem matrícula. Só
      // reaproveita quando o nome identifica um documento só, para não juntar
      // dois homônimos em um.
      const candidatos = (idsPorNome.get(chaveNormalizada(resposta.nome)) ?? []).filter(
        (id) => semMatricula.has(id),
      )

      if (candidatos.length === 1) {
        const id = candidatos[0]
        const existente = dadosPorId.get(id)
        if (!existente) throw new Error(`Cadastro inconsistente no funcionário ${id}.`)
        funcionariosParaGravar.push({
          id,
          dados: { ...existente, matricula: resposta.matricula, nome: resposta.nome },
        })
        semMatricula.delete(id)
        idPorMatricula.set(resposta.matricula, id)
        idPorResposta.set(resposta.matricula, id)
        vinculados++
        continue
      }

      const id = idFuncionario({ matricula: resposta.matricula })
      funcionariosParaGravar.push({
        id,
        dados: {
          matricula: resposta.matricula,
          nome: resposta.nome,
          email: null,
          departamento: null,
          ativo: true,
          chaveOrigem: null,
        },
      })
      idPorMatricula.set(resposta.matricula, id)
      idPorResposta.set(resposta.matricula, id)
      criados++
    }

    if (funcionariosParaGravar.length > 0) {
      await gravarCadastro(COLECAO.funcionario, funcionariosParaGravar, db)
    }
    console.log(
      `  ${criados} funcionários criados, ${vinculados} vinculados a cadastro existente.`,
    )

    /* ------------------------------------------------------------ gravação */
    tituloDaEtapa('Gravação')
    const atualizadoEm = hojeIso()

    const documentos = registros.map((registro) => {
      const { resposta } = registro
      const funcionarioId = idPorResposta.get(resposta.matricula)
      if (!funcionarioId) {
        throw new Error(`Resposta da linha ${resposta.linha} ficou sem funcionário.`)
      }
      const id = idMobilidade(ano, resposta.matricula)

      const dados: DocMobilidade = {
        modulo: 'mobilidade',
        modal: 'terrestre',
        escopo: 3,
        periodicidade: 'mensal',
        ano,
        // A pesquisa é anual: o valor vale para todo mês do ano-base (§9.5).
        mes: null,
        empresa: null,
        fator: registro.fator,
        ...montarAlertas(
          resposta.alertas.map((a) => ({
            tipo: a.tipo,
            descricao: a.descricao,
            severidade: severidadeDe(a.tipo),
          })),
        ),
        atualizadoEm,
        funcionarioId,
        anoBase: ano,
        transporte: resposta.transporte ?? 'outro',
        combustivel: resposta.combustivel,
        distanciaKm: registro.distanciaKm,
        bairro: bairros.get(chaveNormalizada(resposta.bairro)) ?? null,
        cidade: cidades.get(chaveNormalizada(resposta.cidade)) ?? null,
        diasUteisMes: dias,
        co2KgMes: registro.co2KgMes,
        excecao: registro.excecao,
        motivoExcecao: registro.motivoExcecao,
      }

      validarMobilidade(id, dados)
      return { id, dados }
    })

    const resultado = await recarregarEscopo({
      colecao: COLECAO.mobilidade,
      escopo: [{ campo: 'anoBase', valor: ano }],
      documentos,
      db,
    })

    const alertas = registros.reduce((s, r) => s + r.resposta.alertas.length, 0)
    console.log(
      `  ${resultado.gravados} registros gravados, ${alertas} alertas, ` +
        `${resultado.removidos} obsoletos removidos da carga anterior.`,
    )

    tituloDaEtapa('Hipóteses a declarar na tela de método')
    console.log(`  distância ${modo}, por ${calculadora.nome}`)
    console.log('  um ocupante por carro e por moto (a pesquisa não pergunta carona)')
    console.log('  bicicleta, a pé e "outro" com emissão zero')
    console.log(`  ${dias} dias úteis por mês, dois deslocamentos por dia`)
    console.log('Confira a carga com: npm run verificar')
  } finally {
    await encerrar()
  }
}

if (ehEntrada(import.meta.url)) void executar('ingest-mobilidade', principal)

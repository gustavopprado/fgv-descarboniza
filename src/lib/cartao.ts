/**
 * Leitura da planilha de viagens do cartão empresarial — CLAUDE.md §7.
 *
 * É uma **terceira fonte**, ao lado do relatório da agência e do formulário do
 * viajante: são viagens pagas no cartão, que não passam pela agência e por isso
 * não estão na base histórica.
 *
 * A planilha é digitada à mão e mostra: código IATA e nome de cidade misturados
 * na mesma célula, erro de digitação, separador irregular, e a data só na
 * primeira linha de cada bloco. Este módulo lê **ao pé da letra** e **sinaliza o
 * que não entende** — nunca adivinha. A regra é a mesma da §8.3 para o relatório
 * marítimo: coluna ausente é ausente, linha que não dá para ler vira alerta.
 *
 * O módulo é puro: recebe linhas já lidas e devolve trechos. Quem abre arquivo é
 * o script de carga.
 */
import { chaveNormalizada } from './texto'

export type LinhaDoCartao = {
  /** Como veio na planilha; vazio quando a célula está em branco. */
  usuario: string
  /** `AAAA-MM-DD`, ou nulo quando a célula está em branco. */
  data: string | null
  /** O texto de origem e destino, como foi digitado. */
  rota: string
  /** Verdadeiro na linha em branco que separa um bloco do seguinte. */
  vazia: boolean
}

export type AlertaDoCartao = { tipo: string; descricao: string }

export type TrechoDoCartao = {
  /** Bloco a que o trecho pertence; vira o identificador da viagem. */
  bloco: number
  ordem: number
  usuario: string
  data: string
  origem: string
  destino: string
  /** O texto original, para conferência. */
  bruto: string
  alertas: AlertaDoCartao[]
}

export type LeituraDoCartao = {
  trechos: TrechoDoCartao[]
  /** Linhas que não viraram trecho, com o motivo. */
  descartadas: { linha: number; bruto: string; motivo: string }[]
}

export const ALERTA_CODIGO_POR_APELIDO = 'codigo_resolvido_por_apelido'
export const ALERTA_DATA_HERDADA = 'data_herdada_do_bloco'
export const ALERTA_SEQUENCIA_QUEBRADA = 'sequencia_de_trechos_quebrada'
export const ALERTA_BLOCO_COM_VARIOS_NOMES = 'bloco_com_mais_de_um_nome'

/**
 * Nome de cidade ou aeroporto para código IATA.
 *
 * A tabela cobre **o que aparece nesta planilha**, incluindo os erros de
 * digitação que ela tem. Não é um cadastro de aeroportos: é um dicionário de
 * apelidos, e cada entrada existe porque uma linha real precisou dela. Toda
 * resolução por apelido é sinalizada no trecho, para a tela de método mostrar
 * quantas linhas dependeram de tradução.
 */
export const APELIDOS: Readonly<Record<string, string>> = {
  GUARULHOS: 'GRU',
  'SAO PAULO': 'GRU',
  CURITIBA: 'CWB',
  BRASILIA: 'BSB',
  MANAUS: 'MAO',
  'BOA VISTA': 'BVB',
  FRANKFURT: 'FRA',
  FRANKURT: 'FRA',
  'ADDIS ABABA': 'ADD',
  'ADIS ABEBA': 'ADD',
  GUANGZHOU: 'CAN',
  'HONG KONG': 'HKG',
  // Digitação de um código que não existe; a linha real traz "GRUA- CWB".
  GRUA: 'GRU',
}

/** Códigos que a planilha usa e que não podem ser confundidos com apelido. */
const CODIGO = /^[A-Z]{3}$/

/**
 * Resolve um pedaço de texto em código IATA.
 *
 * O apelido é consultado **antes** do código de três letras, senão "BOA VISTA"
 * viraria "BOA" — um código que não existe, silenciosamente.
 */
export function resolverCodigo(
  pedaco: string,
): { codigo: string; porApelido: boolean } | null {
  const limpo = pedaco.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase()
  if (limpo === '') return null

  const apelido = Object.keys(APELIDOS)
    .filter((nome) => chaveNormalizada(limpo).includes(chaveNormalizada(nome)))
    // O apelido mais longo ganha: "BOA VISTA" antes de "VISTA".
    .sort((a, b) => b.length - a.length)[0]
  if (apelido !== undefined) return { codigo: APELIDOS[apelido], porApelido: true }

  const codigo = limpo.split(' ').find((p) => CODIGO.test(p))
  return codigo === undefined ? null : { codigo, porApelido: false }
}

/**
 * Separa a célula de origem e destino.
 *
 * O separador é o hífen, e o texto costuma repetir o lugar por extenso depois do
 * código — "GRU- FRA- FRANKURT" é Guarulhos para Frankfurt, não três escalas.
 * Por isso a regra é **primeiro pedaço e último pedaço**, com os do meio
 * servindo só de confirmação.
 */
export function separarRota(
  rota: string,
): { origem: string; destino: string; porApelido: boolean } | null {
  const pedacos = rota.split('-').map((p) => p.trim()).filter((p) => p !== '')
  if (pedacos.length < 2) return null

  const resolvidos = pedacos
    .map(resolverCodigo)
    .filter((r): r is { codigo: string; porApelido: boolean } => r !== null)
  if (resolvidos.length < 2) return null

  const origem = resolvidos[0].codigo
  // De trás para frente: o último código diferente da origem é o destino.
  const destino = [...resolvidos].reverse().find((r) => r.codigo !== origem)
  if (destino === undefined) return null

  // O mesmo lugar costuma aparecer duas vezes, como código e por extenso. Só
  // conta como tradução o código que **nunca** apareceu literalmente: em
  // "GRU- FRA- FRANKFURT" o destino estava escrito como código, e a repetição
  // por extenso não torna a leitura menos direta.
  const apenasPorApelido = (codigo: string): boolean =>
    !resolvidos.some((r) => r.codigo === codigo && !r.porApelido)

  return {
    origem,
    destino: destino.codigo,
    porApelido: apenasPorApelido(origem) || apenasPorApelido(destino.codigo),
  }
}

/**
 * Monta os trechos a partir das linhas da planilha.
 *
 * **Bloco é o que a linha em branco separa** — é a única estrutura que a
 * planilha realmente tem, e vira a viagem. A data e o nome valem para o bloco
 * inteiro a partir da linha em que aparecem; linha sem rota legível é
 * descartada com motivo, não silenciosamente.
 */
export function lerCartao(linhas: LinhaDoCartao[]): LeituraDoCartao {
  const trechos: TrechoDoCartao[] = []
  const descartadas: LeituraDoCartao['descartadas'] = []

  let bloco = 0
  let blocoAberto = false
  let usuario = ''
  let data: string | null = null
  let nomesDoBloco = new Set<string>()
  let ordem = 0
  let ultimoDestino: string | null = null

  linhas.forEach((linha, i) => {
    const numero = i + 1

    if (linha.vazia) {
      blocoAberto = false
      return
    }

    if (!blocoAberto) {
      bloco++
      blocoAberto = true
      ordem = 0
      ultimoDestino = null
      nomesDoBloco = new Set()
      // Nome e data não atravessam a linha em branco: bloco novo recomeça do
      // que estiver escrito nele.
      usuario = ''
      data = null
    }

    if (linha.usuario !== '') {
      usuario = linha.usuario
      nomesDoBloco.add(chaveNormalizada(linha.usuario))
    }
    if (linha.data !== null) data = linha.data

    if (linha.rota.trim() === '') {
      // Linha só com data e nome: é o cabeçalho do bloco, e já cumpriu o papel.
      return
    }

    const separada = separarRota(linha.rota)
    if (separada === null) {
      descartadas.push({
        linha: numero,
        bruto: linha.rota,
        motivo: 'não foi possível ler origem e destino',
      })
      return
    }
    if (data === null) {
      descartadas.push({
        linha: numero,
        bruto: linha.rota,
        motivo: 'bloco sem data; o mês do voo não pode ser deduzido',
      })
      return
    }
    if (usuario === '') {
      descartadas.push({
        linha: numero,
        bruto: linha.rota,
        motivo: 'bloco sem nome de viajante',
      })
      return
    }

    ordem++
    const alertas: AlertaDoCartao[] = []
    if (separada.porApelido) {
      alertas.push({
        tipo: ALERTA_CODIGO_POR_APELIDO,
        descricao: 'origem ou destino veio como nome de lugar, não como código',
      })
    }
    if (linha.data === null) {
      alertas.push({
        tipo: ALERTA_DATA_HERDADA,
        descricao: 'a linha não traz data; herdou a do bloco',
      })
    }
    if (ultimoDestino !== null && ultimoDestino !== separada.origem) {
      alertas.push({
        tipo: ALERTA_SEQUENCIA_QUEBRADA,
        descricao: 'o trecho não começa onde o anterior terminou',
      })
    }
    if (nomesDoBloco.size > 1) {
      alertas.push({
        tipo: ALERTA_BLOCO_COM_VARIOS_NOMES,
        descricao: 'o bloco tem mais de um nome; a atribuição pode estar errada',
      })
    }

    trechos.push({
      bloco,
      ordem,
      usuario,
      data,
      origem: separada.origem,
      destino: separada.destino,
      bruto: linha.rota,
      alertas,
    })
    ultimoDestino = separada.destino
  })

  return { trechos, descartadas }
}

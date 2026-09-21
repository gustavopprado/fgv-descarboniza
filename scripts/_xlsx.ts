/**
 * Leitura de pacote `.xlsx` sem dependência nova — infraestrutura de carga.
 *
 * **Por que este arquivo existe.** O leitor que as outras cargas usam não abre o
 * export do sistema de faturamento: o pacote é OOXML válido, mas escreve o XML
 * com prefixo de namespace (`<x:worksheet>`) e grava as partes numa ordem que o
 * leitor de stream não espera. Medido: com o arquivo cru ele lança antes de
 * chegar às abas, e com o pacote reempacotado ele **pendura o processo** — que é
 * pior que falhar. Converter o arquivo à mão antes de cada carga resolveria uma
 * vez e voltaria na próxima; esta base é para carga recorrente (§9).
 *
 * **O que ele lê, e o que recusa.** Só o necessário para virar matriz de
 * células: nomes de aba, texto compartilhado e a grade. Formato de célula,
 * estilo, largura de coluna e tudo mais são ignorados de propósito — quanto
 * menos do pacote este leitor interpreta, menos ele tem para errar. Tudo que ele
 * não entende **falha alto**, nomeando o que encontrou: pacote que este leitor
 * não sabe ler tem que parar a carga, nunca devolver planilha pela metade.
 *
 * > **A data volta como número, e isso é deliberado.** O Excel guarda data como
 * > número de série, e saber que uma célula é data exige interpretar o formato
 * > dela — a parte mais frágil de ler xlsx. Aqui o número sai cru, e quem sabe
 * > que aquela coluna significa data faz a conversão (`dataDeSerieOuNulo`, em
 * > `src/lib/planilha.ts`). A regra vale no sentido inverso também: nenhuma
 * > coluna vira data por acidente.
 */
import { readFileSync } from 'node:fs'
import { crc32, inflateRawSync } from 'node:zlib'

import type { AbaLida, CelulaBruta } from '../src/lib/planilha'

/* ------------------------------------------------------------------- zip */

type EntradaZip = {
  nome: string
  metodo: number
  comprimido: number
  cru: number
  crc: number
  offset: number
}

const ASSINATURA_FIM = 0x06054b50
const ASSINATURA_CENTRAL = 0x02014b50
const ASSINATURA_LOCAL = 0x04034b50
const MARCA_ZIP64 = 0xffffffff

function falhar(motivo: string): never {
  throw new Error(
    `Pacote .xlsx que este leitor não sabe ler: ${motivo}. ` +
      'A carga para em vez de seguir com planilha incompleta (scripts/_xlsx.ts).',
  )
}

/**
 * O diretório central do zip, que é a única lista confiável do que há dentro.
 *
 * Ele é lido do fim para o começo, porque é lá que o formato o coloca: o
 * registro de fim pode ter comentário depois dele, então a assinatura é
 * procurada de trás para frente.
 */
function lerDiretorio(pacote: Buffer): Map<string, EntradaZip> {
  let fim = -1
  for (let i = pacote.length - 22; i >= 0 && i >= pacote.length - 22 - 0xffff; i--) {
    if (pacote.readUInt32LE(i) === ASSINATURA_FIM) {
      fim = i
      break
    }
  }
  if (fim < 0) falhar('não tem registro de fim de zip')

  const quantas = pacote.readUInt16LE(fim + 10)
  const inicio = pacote.readUInt32LE(fim + 16)
  if (inicio === MARCA_ZIP64 || quantas === 0xffff) {
    falhar('é zip64, e este leitor não trata a extensão de 64 bits')
  }

  const entradas = new Map<string, EntradaZip>()
  let p = inicio
  for (let i = 0; i < quantas; i++) {
    if (pacote.readUInt32LE(p) !== ASSINATURA_CENTRAL) {
      falhar('diretório central inconsistente')
    }
    const metodo = pacote.readUInt16LE(p + 10)
    const crc = pacote.readUInt32LE(p + 16)
    const comprimido = pacote.readUInt32LE(p + 20)
    const cru = pacote.readUInt32LE(p + 24)
    const tamNome = pacote.readUInt16LE(p + 28)
    const tamExtra = pacote.readUInt16LE(p + 30)
    const tamComentario = pacote.readUInt16LE(p + 32)
    const offset = pacote.readUInt32LE(p + 42)
    const nome = pacote.toString('utf8', p + 46, p + 46 + tamNome)
    if (comprimido === MARCA_ZIP64 || cru === MARCA_ZIP64 || offset === MARCA_ZIP64) {
      falhar(`tem entrada em zip64: ${nome}`)
    }
    entradas.set(nome, { nome, metodo, comprimido, cru, crc, offset })
    p += 46 + tamNome + tamExtra + tamComentario
  }
  return entradas
}

/**
 * Uma parte do pacote, em texto.
 *
 * O CRC é conferido: arquivo truncado ou corrompido no meio do caminho falha
 * aqui, com o nome da parte, em vez de virar aba com metade das linhas.
 */
function lerParte(pacote: Buffer, entrada: EntradaZip): string {
  if (pacote.readUInt32LE(entrada.offset) !== ASSINATURA_LOCAL) {
    falhar(`a entrada ${entrada.nome} não começa onde o diretório diz`)
  }
  const tamNome = pacote.readUInt16LE(entrada.offset + 26)
  const tamExtra = pacote.readUInt16LE(entrada.offset + 28)
  const inicio = entrada.offset + 30 + tamNome + tamExtra
  const bruto = pacote.subarray(inicio, inicio + entrada.comprimido)

  let conteudo: Buffer
  if (entrada.metodo === 0) conteudo = Buffer.from(bruto)
  else if (entrada.metodo === 8) conteudo = inflateRawSync(bruto)
  else falhar(`a entrada ${entrada.nome} usa compressão ${entrada.metodo}`)

  if (conteudo.length !== entrada.cru) {
    falhar(
      `a entrada ${entrada.nome} descomprimiu ${conteudo.length} bytes, não ${entrada.cru}`,
    )
  }
  if (crc32(conteudo) !== entrada.crc) falhar(`a entrada ${entrada.nome} não confere o CRC`)

  // O BOM aparece nos exports do sistema de faturamento e atrapalharia o
  // primeiro casamento de tag.
  return conteudo.toString('utf8').replace(/^﻿/, '')
}

/* ------------------------------------------------------------------- xml */

/**
 * Atributo de uma tag, **ignorando o prefixo de namespace**.
 *
 * O prefixo é escolha de quem escreveu o pacote — `r:id` num export e `id` em
 * outro —, e prender a leitura a ele é a razão pela qual o leitor anterior não
 * abre este arquivo.
 */
function atributo(tag: string, nome: string): string | null {
  const m = new RegExp(`(?:^|\\s)(?:[A-Za-z0-9]+:)?${nome}\\s*=\\s*"([^"]*)"`).exec(tag)
  return m === null ? null : desescapar(m[1])
}

function desescapar(texto: string): string {
  if (!texto.includes('&')) return texto
  return texto
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
}

/**
 * Elementos de um nome local, com ou sem prefixo de namespace.
 *
 * **A forma vazia vem primeiro, e a forma com corpo recusa terminar em `/`.**
 * Sem as duas coisas, `<c />` é lido como abertura de célula e o corpo dela
 * passa a ser tudo até o próximo `</c>` — a célula vazia engole a seguinte e a
 * linha se desloca **sem nada parecer errado**. Foi o primeiro defeito deste
 * leitor, e é a razão de haver um teste com célula vazia no meio da linha: no
 * fim da linha o erro não aparece, porque não há fechamento à frente para
 * capturar.
 *
 * Grupos: 1 são os atributos da forma vazia, 2 os da forma com corpo e 3 o
 * corpo. Corpo `undefined` significa elemento vazio.
 */
function elementos(nomeLocal: string): RegExp {
  const abre = `<(?:[A-Za-z0-9]+:)?${nomeLocal}`
  return new RegExp(
    `${abre}((?:\\s[^>]*?)?)/>` +
      `|${abre}((?:\\s[^>]*?)?)(?<!/)>([\\s\\S]*?)</(?:[A-Za-z0-9]+:)?${nomeLocal}>`,
    'g',
  )
}

type Elemento = { tag: string; corpo: string | undefined }

function* percorrer(xml: string, nomeLocal: string): Generator<Elemento> {
  for (const m of xml.matchAll(elementos(nomeLocal))) {
    yield { tag: m[1] ?? m[2] ?? '', corpo: m[3] }
  }
}

/** O texto de todos os `<t>` de um pedaço de XML, concatenado na ordem. */
function textoDosT(xml: string): string {
  let junto = ''
  for (const t of percorrer(xml, 't')) junto += desescapar(t.corpo ?? '')
  return junto
}

/* ---------------------------------------------------------------- células */

/** `A1` → 0, `B1` → 1, `AA1` → 26. Nulo quando a referência não tem coluna. */
export function colunaDaReferencia(referencia: string | null): number | null {
  if (referencia === null) return null
  const m = /^([A-Z]+)/.exec(referencia.toUpperCase())
  if (m === null) return null
  let coluna = 0
  for (const letra of m[1]) coluna = coluna * 26 + (letra.charCodeAt(0) - 64)
  return coluna - 1
}

const EXPRESSAO_V =
  /<(?:[A-Za-z0-9]+:)?v(?:\s[^>]*?)?>([\s\S]*?)<\/(?:[A-Za-z0-9]+:)?v>/

/**
 * Valor de uma célula, pelo tipo que o pacote declara.
 *
 * Os tipos tratados são os que uma exportação produz: número sem tipo, texto
 * compartilhado (`s`), texto embutido (`inlineStr`), texto de fórmula (`str`),
 * booleano (`b`) e valor de erro (`e`). **Tipo desconhecido para a carga**, em
 * vez de virar nulo — nulo passaria por célula vazia, e célula vazia é dado
 * ausente, não dado que não se soube ler.
 *
 * O erro de planilha volta como o próprio texto, de propósito: ele não derruba a
 * carga inteira, e a coluna que o receber recusa só a linha dela. É a
 * granularidade da §10.8 — uma linha ruim não leva as outras.
 */
function valorDaCelula(tag: string, corpo: string, compartilhadas: string[]): CelulaBruta {
  const tipo = atributo(tag, 't')
  const v = EXPRESSAO_V.exec(corpo)
  const bruto = v === null ? null : desescapar(v[1])

  switch (tipo) {
    case null:
    case 'n': {
      if (bruto === null || bruto.trim() === '') return null
      const numero = Number(bruto)
      if (!Number.isFinite(numero)) falhar(`célula numérica com valor "${bruto}"`)
      return numero
    }
    case 's': {
      if (bruto === null) return null
      const i = Number(bruto)
      if (!Number.isInteger(i) || i < 0 || i >= compartilhadas.length) {
        falhar(`índice de texto compartilhado fora da lista: ${bruto}`)
      }
      return compartilhadas[i]
    }
    case 'inlineStr': {
      const texto = textoDosT(corpo)
      return texto === '' ? null : texto
    }
    case 'str':
    case 'e': {
      return bruto === null || bruto === '' ? null : bruto
    }
    case 'b': {
      return bruto === '1'
    }
    default:
      return falhar(`célula de tipo "${tipo}"`)
  }
}

/**
 * A grade de uma aba.
 *
 * **A posição vem da referência da célula quando ela existe, e da ordem quando
 * não existe.** As duas formas aparecem: quem exporta do sistema de faturamento
 * escreve as células de toda linha, inclusive as vazias, e não escreve
 * referência nenhuma; quem salva pelo Excel escreve `r="C5"` e omite a vazia.
 * Ler por ordem um arquivo que omite célula deslocaria a linha inteira em
 * silêncio — e é por isso que a referência, quando vem, é ela que manda.
 */
function lerGrade(xml: string, compartilhadas: string[]): CelulaBruta[][] {
  const linhas: CelulaBruta[][] = []

  for (const linha of percorrer(xml, 'row')) {
    const numero = atributo(linha.tag, 'r')
    const indice = numero === null ? linhas.length : Number(numero) - 1
    if (!Number.isInteger(indice) || indice < 0) falhar(`linha com referência "${numero}"`)

    const celulas: CelulaBruta[] = []
    let proxima = 0
    for (const celula of percorrer(linha.corpo ?? '', 'c')) {
      const coluna = colunaDaReferencia(atributo(celula.tag, 'r')) ?? proxima
      while (celulas.length < coluna) celulas.push(null)
      celulas[coluna] =
        celula.corpo === undefined
          ? null
          : valorDaCelula(celula.tag, celula.corpo, compartilhadas)
      proxima = coluna + 1
    }

    while (linhas.length < indice) linhas.push([])
    linhas[indice] = celulas
  }
  return linhas
}

/* ----------------------------------------------------------------- pacote */

/**
 * Abre o pacote e devolve as abas em matriz, na ordem em que a pasta de trabalho
 * as declara.
 */
export function lerPacoteXlsx(caminho: string): AbaLida[] {
  const pacote = readFileSync(caminho)
  const entradas = lerDiretorio(pacote)

  const parte = (nome: string): string | null => {
    const entrada = entradas.get(nome)
    return entrada === undefined ? null : lerParte(pacote, entrada)
  }

  const workbook = parte('xl/workbook.xml')
  if (workbook === null) falhar('não tem xl/workbook.xml')

  /**
   * O outro sistema de data do Excel desloca tudo em quatro anos, e a conversão
   * de série assume 1900. Recusar é a única saída honesta: seguir daria um
   * inventário inteiro com data errada e nada parecendo quebrado.
   */
  if (/date1904\s*=\s*"(1|true)"/i.test(workbook)) {
    falhar('usa o sistema de data de 1904')
  }

  const alvoPorId = new Map<string, string>()
  const rels = parte('xl/_rels/workbook.xml.rels') ?? ''
  for (const relacao of percorrer(rels, 'Relationship')) {
    const id = atributo(relacao.tag, 'Id')
    const alvo = atributo(relacao.tag, 'Target')
    if (id !== null && alvo !== null) alvoPorId.set(id, alvo)
  }

  const compartilhadas: string[] = []
  const strings = parte('xl/sharedStrings.xml')
  if (strings !== null) {
    for (const si of percorrer(strings, 'si')) compartilhadas.push(textoDosT(si.corpo ?? ''))
  }

  const abas: AbaLida[] = []
  let ordem = 0
  for (const aba of percorrer(workbook, 'sheet')) {
    const nome = atributo(aba.tag, 'name')
    if (nome === null) continue
    ordem += 1

    const id = atributo(aba.tag, 'id')
    const alvo = id === null ? null : alvoPorId.get(id)
    // Sem relação declarada, a convenção de nome é o último recurso: é o que
    // permite ler um pacote cujo `.rels` não nomeia a aba.
    const caminhoDaAba = (alvo ?? `worksheets/sheet${ordem}.xml`).replace(/^\/?(xl\/)?/, '')
    const xml = parte(`xl/${caminhoDaAba}`)
    if (xml === null) {
      falhar(`a aba "${nome}" aponta para xl/${caminhoDaAba}, que não está no pacote`)
    }

    abas.push({ nome, linhas: lerGrade(xml, compartilhadas) })
  }

  if (abas.length === 0) falhar('não declara nenhuma aba')
  return abas
}

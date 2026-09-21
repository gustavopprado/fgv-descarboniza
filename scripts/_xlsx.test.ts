/**
 * Guardas do leitor de `.xlsx` — `scripts/_xlsx.ts`.
 *
 * O leitor existe porque o export do sistema de faturamento não abre no leitor
 * das outras cargas, e ele interpreta o pacote **por conta própria**: zip, XML e
 * tipo de célula. Isso é exatamente o lugar onde um erro de leitura não estoura
 * — devolve planilha deslocada —, então cada forma que ele aceita tem teste, e
 * cada forma que ele recusa também.
 *
 * **Toda massa aqui é fictícia, inventada do zero** (§2.2): nome de cliente,
 * valor e data são inventados, e o pacote é montado byte a byte pelo próprio
 * teste. Nenhuma linha vem de base real.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { crc32, deflateRawSync } from 'node:zlib'

import { colunaDaReferencia, lerPacoteXlsx } from './_xlsx'

/* --------------------------------------------------------- pacote de ensaio */

type Parte = { nome: string; conteudo: string }

/**
 * Monta um zip mínimo, na mesma ordem de partes que o export usa — a planilha
 * antes das relações, que é o que o leitor de stream anterior não aceitava.
 */
function montarZip(partes: Parte[]): Buffer {
  const locais: Buffer[] = []
  const centrais: Buffer[] = []
  let offset = 0

  for (const parte of partes) {
    const nome = Buffer.from(parte.nome, 'utf8')
    const cru = Buffer.from(parte.conteudo, 'utf8')
    const comprimido = deflateRawSync(cru)
    const soma = crc32(cru)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(soma, 14)
    local.writeUInt32LE(comprimido.length, 18)
    local.writeUInt32LE(cru.length, 22)
    local.writeUInt16LE(nome.length, 26)
    locais.push(local, nome, comprimido)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(soma, 16)
    central.writeUInt32LE(comprimido.length, 20)
    central.writeUInt32LE(cru.length, 24)
    central.writeUInt16LE(nome.length, 28)
    central.writeUInt32LE(offset, 42)
    centrais.push(central, nome)

    offset += local.length + nome.length + comprimido.length
  }

  const corpo = Buffer.concat(locais)
  const diretorio = Buffer.concat(centrais)
  const fim = Buffer.alloc(22)
  fim.writeUInt32LE(0x06054b50, 0)
  fim.writeUInt16LE(partes.length, 8)
  fim.writeUInt16LE(partes.length, 10)
  fim.writeUInt32LE(diretorio.length, 12)
  fim.writeUInt32LE(corpo.length, 16)

  return Buffer.concat([corpo, diretorio, fim])
}

function gravarPacote(partes: Parte[]): string {
  const pasta = mkdtempSync(join(tmpdir(), 'fgv-xlsx-'))
  const caminho = join(pasta, 'ensaio.xlsx')
  writeFileSync(caminho, montarZip(partes))
  return caminho
}

const RELS =
  '<?xml version="1.0" encoding="utf-8"?><Relationships ' +
  'xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Type="worksheet" Target="/xl/worksheets/sheet1.xml" Id="R1" />' +
  '</Relationships>'

/** Pacote na forma do export: prefixo de namespace e texto embutido. */
function pacoteComPrefixo(sheetData: string, atributosDoWorkbook = ''): Parte[] {
  return [
    {
      nome: 'xl/workbook.xml',
      conteudo:
        '<?xml version="1.0" encoding="utf-8"?><x:workbook ' +
        'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        `${atributosDoWorkbook}<x:sheets><x:sheet name="Export" sheetId="1" r:id="R1" ` +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" />' +
        '</x:sheets></x:workbook>',
    },
    { nome: '_rels/.rels', conteudo: '<?xml version="1.0"?><Relationships />' },
    { nome: 'xl/_rels/workbook.xml.rels', conteudo: RELS },
    {
      nome: 'xl/worksheets/sheet1.xml',
      conteudo:
        '<?xml version="1.0" encoding="utf-8"?><x:worksheet ' +
        'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        `<x:sheetData>${sheetData}</x:sheetData></x:worksheet>`,
    },
  ]
}

function textoEmbutido(valor: string): string {
  return `<x:c t="inlineStr"><x:is><x:t>${valor}</x:t></x:is></x:c>`
}

/* -------------------------------------------------------------------- lê */

test('lê o pacote com prefixo de namespace e sem texto compartilhado', () => {
  const linhas =
    `<x:row>${textoEmbutido('Data')}${textoEmbutido('Cliente')}` +
    `${textoEmbutido('Distância (km)')}</x:row>` +
    `<x:row><x:c s="8"><x:v>45658</x:v></x:c>${textoEmbutido('CLIENTE FICTÍCIO LTDA')}` +
    '<x:c><x:v>12.5</x:v></x:c></x:row>'

  const abas = lerPacoteXlsx(gravarPacote(pacoteComPrefixo(linhas)))

  assert.equal(abas.length, 1)
  assert.equal(abas[0].nome, 'Export')
  assert.deepEqual(abas[0].linhas[0], ['Data', 'Cliente', 'Distância (km)'])
  assert.deepEqual(abas[0].linhas[1], [45658, 'CLIENTE FICTÍCIO LTDA', 12.5])
})

/**
 * **A guarda central deste arquivo.**
 *
 * A primeira versão lia `<c />` como abertura de célula e engolia tudo até o
 * próximo `</c>`: a célula vazia consumia a seguinte e a linha se deslocava uma
 * coluna, **sem nada parecer errado**. No fim da linha o defeito não aparece,
 * porque não há fechamento à frente para capturar — por isso o vazio aqui está
 * no meio, e há um par de vazios seguidos, que é a outra forma de acertar por
 * acidente.
 */
test('célula vazia no meio da linha não engole a seguinte', () => {
  const linhas =
    `<x:row>${textoEmbutido('01')}<x:c /><x:c />${textoEmbutido('CLIENTE FICTÍCIO LTDA')}` +
    '<x:c><x:v>7.25</x:v></x:c><x:c /></x:row>'

  const [aba] = lerPacoteXlsx(gravarPacote(pacoteComPrefixo(linhas)))

  assert.deepEqual(aba.linhas[0], ['01', null, null, 'CLIENTE FICTÍCIO LTDA', 7.25, null])
})

test('linha vazia continua sendo uma linha, e não some da grade', () => {
  const linhas =
    `<x:row>${textoEmbutido('primeira')}</x:row><x:row />` +
    `<x:row>${textoEmbutido('terceira')}</x:row>`

  const [aba] = lerPacoteXlsx(gravarPacote(pacoteComPrefixo(linhas)))

  assert.equal(aba.linhas.length, 3)
  assert.deepEqual(aba.linhas[1], [])
  assert.deepEqual(aba.linhas[2], ['terceira'])
})

/**
 * A outra forma do mesmo arquivo: quem salva pelo Excel escreve texto
 * compartilhado, referência de célula e **omite a célula vazia**. Ler por ordem
 * um arquivo assim deslocaria a linha — é a referência que manda.
 */
test('lê a forma do Excel: texto compartilhado e posição pela referência', () => {
  const partes: Parte[] = [
    {
      nome: '[Content_Types].xml',
      conteudo: '<?xml version="1.0"?><Types />',
    },
    {
      nome: 'xl/workbook.xml',
      conteudo:
        '<?xml version="1.0"?><workbook ' +
        'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<sheets><sheet name="Planilha1" sheetId="1" r:id="R1" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" />' +
        '</sheets></workbook>',
    },
    { nome: 'xl/_rels/workbook.xml.rels', conteudo: RELS },
    {
      nome: 'xl/sharedStrings.xml',
      conteudo:
        '<?xml version="1.0"?><sst>' +
        '<si><t>CLIENTE FICTÍCIO LTDA</t></si>' +
        '<si><r><t>PARTE </t></r><r><t>PARTIDA</t></r></si>' +
        '</sst>',
    },
    {
      nome: 'xl/worksheets/sheet1.xml',
      conteudo:
        '<?xml version="1.0"?><worksheet>' +
        '<sheetData>' +
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="D1" t="s"><v>1</v></c></row>' +
        '<row r="3"><c r="B3"><v>3.5</v></c></row>' +
        '</sheetData></worksheet>',
    },
  ]

  const [aba] = lerPacoteXlsx(gravarPacote(partes))

  assert.equal(aba.nome, 'Planilha1')
  // O texto compartilhado com mais de um trecho chega concatenado, na ordem.
  assert.deepEqual(aba.linhas[0], ['CLIENTE FICTÍCIO LTDA', null, null, 'PARTE PARTIDA'])
  // A linha 2 não existe no pacote e continua existindo na grade, vazia.
  assert.deepEqual(aba.linhas[1], [])
  assert.deepEqual(aba.linhas[2], [null, 3.5])
})

test('erro de planilha vira texto, e não derruba a leitura', () => {
  const linhas = '<x:row><x:c t="e"><x:v>#N/A</x:v></x:c><x:c><x:v>1</x:v></x:c></x:row>'

  const [aba] = lerPacoteXlsx(gravarPacote(pacoteComPrefixo(linhas)))

  assert.deepEqual(aba.linhas[0], ['#N/A', 1])
})

/* ----------------------------------------------------------------- recusa */

test('recusa o sistema de data de 1904, que deslocaria o inventário em quatro anos', () => {
  const partes = pacoteComPrefixo(
    '<x:row><x:c><x:v>45658</x:v></x:c></x:row>',
    '<x:workbookPr date1904="1" />',
  )

  assert.throws(() => lerPacoteXlsx(gravarPacote(partes)), /1904/)
})

test('recusa tipo de célula que não sabe ler, em vez de devolver vazio', () => {
  const linhas = '<x:row><x:c t="marciano"><x:v>7</x:v></x:c></x:row>'

  assert.throws(() => lerPacoteXlsx(gravarPacote(pacoteComPrefixo(linhas))), /marciano/)
})

test('recusa índice de texto compartilhado fora da lista', () => {
  const partes = pacoteComPrefixo('<x:row><x:c t="s"><x:v>9</x:v></x:c></x:row>')

  assert.throws(() => lerPacoteXlsx(gravarPacote(partes)), /compartilhado/)
})

/**
 * Arquivo truncado ou corrompido no caminho falha aqui, nomeando a parte, em vez
 * de virar aba com metade das linhas — que é a forma silenciosa de perder
 * entrega.
 */
test('recusa parte cujo CRC não confere', () => {
  const partes = pacoteComPrefixo(
    `<x:row>${textoEmbutido('primeira')}</x:row>`,
  )
  const pacote = montarZip(partes)
  // Estraga o CRC declarado da última parte no diretório central.
  const marca = pacote.lastIndexOf(Buffer.from('xl/worksheets/sheet1.xml', 'utf8'))
  pacote.writeUInt32LE(0xdeadbeef, marca - 46 + 16)

  const pasta = mkdtempSync(join(tmpdir(), 'fgv-xlsx-'))
  const caminho = join(pasta, 'estragado.xlsx')
  writeFileSync(caminho, pacote)

  assert.throws(() => lerPacoteXlsx(caminho), /CRC/)
})

test('recusa arquivo que não é zip', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'fgv-xlsx-'))
  const caminho = join(pasta, 'naoezip.xlsx')
  writeFileSync(caminho, 'isto é um texto qualquer')

  assert.throws(() => lerPacoteXlsx(caminho), /fim de zip/)
})

/* ------------------------------------------------------------- referência */

test('referência de célula vira índice de coluna', () => {
  assert.equal(colunaDaReferencia('A1'), 0)
  assert.equal(colunaDaReferencia('B12'), 1)
  assert.equal(colunaDaReferencia('Z1'), 25)
  assert.equal(colunaDaReferencia('AA1'), 26)
  assert.equal(colunaDaReferencia('AB100'), 27)
  assert.equal(colunaDaReferencia(null), null)
  assert.equal(colunaDaReferencia('12'), null)
})

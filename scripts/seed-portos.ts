/**
 * Cadastro de portos, pelo código UN/LOCODE — CLAUDE.md §8, §10.4.
 *
 * O mapa do módulo marítimo precisa de coordenada, e o relatório do agente não
 * traz nenhuma — traz o **código** de embarque e de desembarque. Este script
 * resolve esses códigos na lista oficial UN/LOCODE e grava o cadastro.
 *
 * **Por que a lista oficial e não geocodificação.** O nome do lugar no relatório
 * é texto livre: há nome de aeroporto, nome composto com barra e nome entre
 * parênteses. Geocodificar texto assim põe o ponto no lugar errado sem nenhum
 * erro aparecer — e em embarque aéreo e em transbordo o nome nem é o lugar do
 * código. A lista ainda traz o **classificador de função**, que a geocodificação
 * não daria: é ele que permite sinalizar embarque marítimo cujo código de
 * carregamento não é porto.
 *
 * **Origem:** UN/LOCODE, publicado pela UNECE, que o declara de uso livre e sem
 * responsabilidade do Secretariado das Nações Unidas pelo uso. O arquivo usado é
 * a consolidação em CSV mantida em `datasets/un-locode`, sob ODC PDDL:
 *   https://raw.githubusercontent.com/datasets/un-locode/main/data/code-list.csv
 *
 * **O arquivo não é versionado** (§2.2). Ele é genérico, mas filtrá-lo para os
 * códigos desta base produziria a lista de onde a empresa importa, que é dado
 * real. Ele mora em `dados/`, como as demais bases, e o script o baixa se não o
 * encontrar.
 *
 * **Quais códigos.** Saem do próprio relatório marítimo. Não há lista de portos
 * escrita neste repositório, e não pode haver.
 *
 * Sem `--gravar` o script **não escreve nada**: imprime o que encontrou. Código
 * mal resolvido põe um porto do outro lado do mundo e o mapa mente em silêncio —
 * a conferência é humana, como no cadastro de aeroportos.
 *
 * Uso:
 *   npx tsx scripts/seed-portos.ts [relatorio.xlsx]
 *   npx tsx scripts/seed-portos.ts [relatorio.xlsx] --gravar
 */
import 'dotenv/config'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

import { lerRelatorioMaritimo } from '../src/lib/maritimo'
import { lerUnlocode, type RegistroUnlocode } from '../src/lib/unlocode'
import { idPorto } from '../src/server/documentos/ids'
import type { DocPorto } from '../src/server/documentos/tipos'
import { validarPorto } from '../src/server/documentos/validacao'
import { gravarCadastro } from '../src/server/escrita'
import { COLECAO } from '../src/server/firestore'
import { lerRelatorioDoArquivo } from './ingest-maritimo'
import {
  caminhoDaBase,
  conectarFirestore,
  ehEntrada,
  executar,
  tituloDaEtapa,
} from './_comum'

const ORIGEM_UNLOCODE =
  'https://raw.githubusercontent.com/datasets/un-locode/main/data/code-list.csv'

/**
 * Procedência gravada em cada documento, para o cadastro ser auditável.
 *
 * A lista tem duas edições por ano, e a data do download é o que permite saber
 * depois qual delas produziu uma coordenada.
 */
function procedencia(): string {
  return 'UN/LOCODE (UNECE), consolidação datasets/un-locode sob ODC PDDL'
}

/**
 * Baixa a lista se ela não estiver em disco.
 *
 * Por `curl`, e não por `fetch`, pelo mesmo motivo do gerador de contorno: é
 * ferramenta que já está na máquina de quem opera a carga, e a mensagem de erro
 * diz o que fazer em vez de devolver falha de rede solta.
 */
function garantirLista(caminho: string): string {
  if (existsSync(caminho)) return readFileSync(caminho, 'utf8')

  console.log(`  A lista não está em ${caminho}. Baixando de ${ORIGEM_UNLOCODE} …`)
  let conteudo: string
  try {
    conteudo = execFileSync('curl', ['-sS', '-L', '--fail', ORIGEM_UNLOCODE], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch (erro) {
    throw new Error(
      `não consegui baixar a lista UN/LOCODE (${(erro as Error).message}). É preciso ` +
        `rede e o comando curl no PATH, ou baixe o arquivo à mão para ${caminho}.`,
    )
  }
  writeFileSync(caminho, conteudo, 'utf8')
  console.log('  Baixada. O arquivo não é versionado (§2.2).')
  return conteudo
}

export type Achado = {
  locode: string
  registro: RegistroUnlocode | null
  /** Como o relatório chama esse código; mais de um nome é o caso a conferir. */
  nomesNoRelatorio: string[]
  embarques: number
  /** Verdadeiro quando algum embarque marítimo usa este código. */
  usadoEmMaritimo: boolean
}

/** Junta o que o relatório usa com o que a lista oficial sabe. */
export function cruzar(
  usos: Map<string, { nomes: Set<string>; embarques: number; maritimo: boolean }>,
  lista: Map<string, RegistroUnlocode>,
): Achado[] {
  return [...usos.entries()]
    .map(([locode, uso]) => ({
      locode,
      registro: lista.get(locode) ?? null,
      nomesNoRelatorio: [...uso.nomes].sort(),
      embarques: uso.embarques,
      usadoEmMaritimo: uso.maritimo,
    }))
    .sort((a, b) => b.embarques - a.embarques || a.locode.localeCompare(b.locode))
}

function documentoDe(achado: Achado): DocPorto | null {
  if (achado.registro === null) return null
  const r = achado.registro
  return {
    locode: r.locode,
    nome: r.nome,
    pais: r.pais,
    subdivisao: r.subdivisao,
    latitude: r.latitude,
    longitude: r.longitude,
    funcao: r.funcao,
    ehPorto: r.ehPorto,
    fonte: procedencia(),
  }
}

async function principal(): Promise<void> {
  const argumentos = process.argv.slice(2)
  const gravar = argumentos.includes('--gravar')
  const caminhoRelatorio = caminhoDaBase(
    argumentos.find((a) => !a.startsWith('--')),
    'BASE_MARITIMO_PATH',
    'dados/relatorio-maritimo.xlsx',
  )
  const caminhoLista = caminhoDaBase(
    undefined,
    'BASE_UNLOCODE_PATH',
    'dados/unlocode-code-list.csv',
  )

  tituloDaEtapa(gravar ? 'Cadastro de portos' : 'Cadastro de portos (simulação)')

  const abas = await lerRelatorioDoArquivo(caminhoRelatorio)
  const { blocos } = lerRelatorioMaritimo(abas)

  const usos = new Map<string, { nomes: Set<string>; embarques: number; maritimo: boolean }>()
  for (const bloco of blocos) {
    for (const e of bloco.embarques) {
      const maritimo = (e.trans ?? '').trim().toUpperCase() !== 'AIR'
      for (const [locode, nome] of [
        [e.locodeOrigem, e.origemNome],
        [e.locodeDestino, e.destinoNome],
      ] as [string | null, string | null][]) {
        if (locode === null) continue
        const uso = usos.get(locode) ?? { nomes: new Set<string>(), embarques: 0, maritimo: false }
        if (nome !== null) uso.nomes.add(nome)
        uso.embarques += 1
        uso.maritimo = uso.maritimo || maritimo
        usos.set(locode, uso)
      }
    }
  }

  console.log(`  ${blocos.length} bloco(s) de detalhe, ${usos.size} código(s) distinto(s).`)
  if (usos.size === 0) {
    console.log('  Nenhum código no relatório: não há o que cadastrar.')
    return
  }

  const lista = lerUnlocode(garantirLista(caminhoLista), usos.keys())
  const achados = cruzar(usos, lista)

  console.log('\n  código   embarques  coordenada        função     nome na lista oficial')
  for (const a of achados) {
    const r = a.registro
    const coordenada =
      r === null
        ? '—'
        : r.latitude === null
          ? 'sem coordenada'
          : `${r.latitude.toFixed(2)}, ${r.longitude!.toFixed(2)}`
    console.log(
      `  ${a.locode.padEnd(8)} ${String(a.embarques).padStart(9)}  ` +
        `${coordenada.padEnd(17)} ${(r?.funcao ?? '—').padEnd(10)} ${r?.nome ?? '(não está na lista)'}`,
    )
  }

  /**
   * O que precisa de olho humano antes de gravar. Os três casos são diferentes
   * e nenhum deles impede o cadastro — o que eles impedem é gravar sem saber.
   */
  const ausentes = achados.filter((a) => a.registro === null)
  const semCoordenada = achados.filter((a) => a.registro !== null && a.registro.latitude === null)
  const naoPorto = achados.filter((a) => a.usadoEmMaritimo && a.registro !== null && !a.registro.ehPorto)
  const nomeDiverge = achados.filter((a) => a.nomesNoRelatorio.length > 1)

  if (ausentes.length > 0) {
    console.log(`\n  ${ausentes.length} código(s) não estão na lista oficial:`)
    for (const a of ausentes) console.log(`    ${a.locode} — ${a.nomesNoRelatorio.join(' / ')}`)
    console.log('    Eles não entram no cadastro, e os embarques deles ficam fora do mapa.')
  }
  if (semCoordenada.length > 0) {
    console.log(`\n  ${semCoordenada.length} código(s) sem coordenada na lista oficial:`)
    for (const a of semCoordenada) console.log(`    ${a.locode} — ${a.registro!.nome}`)
    console.log('    Entram no cadastro assim mesmo: ausência de coordenada é fato a')
    console.log('    declarar, e o embarque fica fora do mapa com a proporção anunciada.')
  }
  if (naoPorto.length > 0) {
    console.log(`\n  ${naoPorto.length} código(s) usados em embarque marítimo não são porto:`)
    for (const a of naoPorto) {
      console.log(`    ${a.locode} — função ${a.registro!.funcao}, ${a.registro!.nome}`)
    }
    console.log('    É preenchimento da origem: ponto interior ou aeroporto no lugar do')
    console.log('    porto de carregamento. A carga sinaliza cada embarque afetado.')
  }
  if (nomeDiverge.length > 0) {
    console.log(`\n  ${nomeDiverge.length} código(s) aparecem no relatório com mais de um nome:`)
    for (const a of nomeDiverge) {
      console.log(`    ${a.locode} — ${a.nomesNoRelatorio.join(' / ')} (lista: ${a.registro?.nome ?? '—'})`)
    }
    console.log('    Em transbordo e em frete aéreo o código é o ponto de carregamento e o')
    console.log('    nome é a origem real. O código é o que vale no mapa; confira acima.')
  }

  const documentos = achados
    .map((a) => ({ achado: a, doc: documentoDe(a) }))
    .filter((x): x is { achado: Achado; doc: DocPorto } => x.doc !== null)
    .map(({ doc }) => {
      const id = idPorto(doc.locode)
      validarPorto(id, doc)
      return { id, dados: doc }
    })

  console.log(`\n  ${documentos.length} porto(s) prontos para o cadastro.`)
  if (!gravar) {
    console.log('  Simulação: nada foi gravado. Confira a tabela acima e rode com --gravar.')
    return
  }
  if (documentos.length === 0) {
    console.log('  Nada a gravar.')
    return
  }

  const { db, encerrar } = conectarFirestore()
  try {
    // Cadastro é cumulativo, não período que se substitui: um porto que sumiu
    // do relatório deste ano continua sendo o porto de embarques antigos.
    await gravarCadastro(COLECAO.porto, documentos, db)
    console.log(`  Gravados ${documentos.length} porto(s).`)
  } finally {
    await encerrar()
  }
}

if (ehEntrada(import.meta.url)) void executar('seed-portos', principal)

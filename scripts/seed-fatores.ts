/**
 * Carga dos fatores de emissão aéreos para a tabela `fator_emissao`.
 *
 * Os valores vêm do bloco `fatores_emissao` do JSON da base de viagens
 * (CLAUDE.md §7.2) — nunca de constante no código. A vigência é informada por
 * variável de ambiente ou por argumento, porque é decisão de quem opera a
 * carga, não do código.
 *
 * Uso:
 *   npm run seed:fatores -- [caminho/do/base_viagens.json]
 *                          [--vigencia-inicio AAAA-MM-DD]
 *                          [--vigencia-fim AAAA-MM-DD]
 *
 * Reexecutar é seguro: a linha é identificada por
 * (categoria, chave, versao, vigencia_inicio) e atualizada no lugar.
 */
import {
  CATEGORIA_AEREO_CLASSE,
  CATEGORIA_AEREO_FAIXA,
  CATEGORIA_AEREO_FAIXA_LIMITE,
  CATEGORIA_AEREO_UPLIFT,
} from '../src/lib/calculo/categorias'
import { idFatorEmissao } from '../src/server/documentos/ids'
import type { DocFatorEmissao } from '../src/server/documentos/tipos'
import { validarFatorEmissao } from '../src/server/documentos/validacao'
import { gravarCadastro } from '../src/server/escrita'
import { COLECAO } from '../src/server/firestore'
import {
  caminhoDaBase,
  conectarFirestore,
  ehEntrada,
  executar,
  lerJson,
  tituloDaEtapa,
} from './_comum'

type BaseViagens = {
  fatores_emissao: {
    versao: string
    fonte: string
    unidade: string
    base: string
    uplift_gcd: number
    faixas: {
      id: string
      rotulo: string
      min_km: number
      max_km: number | null
      fator: number
    }[]
    multiplicador_classe: Record<string, number>
    classe_assumida: string
  }
}

type LinhaDeFator = DocFatorEmissao

function argumentoNomeado(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function argumentoPosicional(): string | undefined {
  const bruto = process.argv.slice(2)
  const posicional: string[] = []
  for (let i = 0; i < bruto.length; i++) {
    const item = bruto[i]
    if (item.startsWith('--')) {
      i++ // pula o valor do argumento nomeado
      continue
    }
    posicional.push(item)
  }
  return posicional[0]
}

function dataValida(rotulo: string, valor: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw new Error(`${rotulo} deve estar no formato AAAA-MM-DD. Recebido: ${valor}`)
  }
  return valor
}

/**
 * Monta as linhas da tabela a partir do bloco de fatores da base.
 *
 * Além do fator por faixa, gravamos os limites de cada faixa e o multiplicador
 * de classe: são parte da definição do fator e, sem eles na tabela, o cálculo
 * do formulário precisaria de número no código.
 */
export function montarLinhas(
  base: BaseViagens,
  vigenciaInicio: string,
  vigenciaFim: string | null,
): LinhaDeFator[] {
  const f = base.fatores_emissao
  if (!f) throw new Error('A base não tem o bloco `fatores_emissao`.')

  const comum = {
    fonte: `${f.fonte} — ${f.base}`,
    versao: f.versao,
    vigenciaInicio,
    vigenciaFim,
  }

  const linhas: LinhaDeFator[] = []

  for (const faixa of f.faixas) {
    linhas.push({
      ...comum,
      categoria: CATEGORIA_AEREO_FAIXA,
      chave: faixa.id,
      valor: faixa.fator,
      unidade: f.unidade,
    })
    linhas.push({
      ...comum,
      categoria: CATEGORIA_AEREO_FAIXA_LIMITE,
      chave: `${faixa.id}.min_km`,
      valor: faixa.min_km,
      unidade: 'km',
    })
    // Faixa sem teto não gera linha de máximo: ausência é o próprio "sem teto".
    if (faixa.max_km !== null && faixa.max_km !== undefined) {
      linhas.push({
        ...comum,
        categoria: CATEGORIA_AEREO_FAIXA_LIMITE,
        chave: `${faixa.id}.max_km`,
        valor: faixa.max_km,
        unidade: 'km',
      })
    }
  }

  for (const [classe, multiplicador] of Object.entries(f.multiplicador_classe)) {
    linhas.push({
      ...comum,
      categoria: CATEGORIA_AEREO_CLASSE,
      chave: classe,
      valor: multiplicador,
      unidade: 'multiplicador',
    })
  }

  linhas.push({
    ...comum,
    categoria: CATEGORIA_AEREO_UPLIFT,
    chave: 'gcd',
    valor: f.uplift_gcd,
    unidade: 'fator',
  })

  return linhas
}

async function principal(): Promise<void> {
  const caminho = caminhoDaBase(
    argumentoPosicional(),
    'BASE_VIAGENS_PATH',
    'dados/base_viagens.json',
  )

  const inicio = argumentoNomeado('vigencia-inicio') ?? process.env.FATORES_VIGENCIA_INICIO
  if (!inicio) {
    throw new Error(
      'Informe a vigência inicial dos fatores em FATORES_VIGENCIA_INICIO ' +
        'ou em --vigencia-inicio AAAA-MM-DD. Sem vigência não há carga.',
    )
  }
  const fim = argumentoNomeado('vigencia-fim') ?? null

  const vigenciaInicio = dataValida('A vigência inicial', inicio)
  const vigenciaFim = fim ? dataValida('A vigência final', fim) : null

  const base = lerJson<BaseViagens>(caminho)
  const linhas = montarLinhas(base, vigenciaInicio, vigenciaFim)

  // O ID carrega os quatro campos que identificavam a linha no modelo anterior,
  // então recarregar a mesma versão atualiza o documento em vez de criar uma
  // segunda vigência idêntica.
  const documentos = linhas.map((linha) => {
    const id = idFatorEmissao(
      linha.categoria,
      linha.chave,
      linha.versao,
      linha.vigenciaInicio,
    )
    validarFatorEmissao(id, linha)
    return { id, dados: linha }
  })

  const { db, encerrar } = conectarFirestore()
  try {
    tituloDaEtapa('Fatores de emissão')
    for (const linha of linhas) {
      console.log(
        `  ${linha.categoria.padEnd(26)} ${linha.chave.padEnd(14)} ` +
          `${String(linha.valor).padStart(10)} ${linha.unidade}`,
      )
    }
    await gravarCadastro(COLECAO.fatorEmissao, documentos, db)
    console.log(
      `\n${linhas.length} fatores gravados. Versão ${base.fatores_emissao.versao}, ` +
        `vigência ${vigenciaInicio} → ${vigenciaFim ?? 'em aberto'}.`,
    )
    console.log(
      `Classe assumida no histórico: ${base.fatores_emissao.classe_assumida} ` +
        '(declarar na tela de método).',
    )
  } finally {
    await encerrar()
  }
}

if (ehEntrada(import.meta.url)) void executar('seed-fatores', principal)

/**
 * Carga dos fatores de emissão da mobilidade para a tabela `fator_emissao`.
 *
 * Os fatores da mobilidade não vêm de nenhuma base do inventário: são escolha
 * metodológica de quem assina o relatório. Este script não inventa valor nem
 * traz número de memória — ele lê um arquivo JSON que você monta com a fonte
 * adotada (GHG Protocol Brasil, DEFRA, o que for) e grava com fonte, versão e
 * vigência, para a tela de método declarar de onde veio cada número.
 *
 * O arquivo não é versionado. Estrutura esperada:
 *
 * {
 *   "versao": "nome-da-versao",
 *   "fonte": "quem publica, qual tabela, qual ano",
 *   "vigencia_inicio": "AAAA-MM-DD",
 *   "vigencia_fim": null,
 *   "fatores": [
 *     { "transporte": "carro",  "combustivel": "gasolina", "valor": 0.0,
 *       "unidade": "kg CO2e por km" },
 *     { "transporte": "moto",   "combustivel": "etanol",   "valor": 0.0,
 *       "unidade": "kg CO2e por km" },
 *     { "transporte": "onibus", "valor": 0.0,
 *       "unidade": "kg CO2e por passageiro-km" }
 *   ]
 * }
 *
 * `combustivel` é obrigatório para carro e moto, onde o fator depende dele, e
 * proibido no resto. Bicicleta, a pé e "outro" não precisam de linha: emitem
 * zero por definição (§6.2).
 *
 * Uso:
 *   npm run seed:fatores-mobilidade -- [caminho/do/fatores_mobilidade.json]
 *
 * Reexecutar é seguro: a linha é identificada por
 * (categoria, chave, versão, início de vigência).
 */
import {
  categoriaDoFator,
  chaveDoFator,
  emiteZero,
  exigeCombustivel,
  type Combustivel,
  type Transporte,
} from '../src/lib/calculo/mobilidade'
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

type ArquivoDeFatores = {
  versao: string
  fonte: string
  vigencia_inicio: string
  vigencia_fim?: string | null
  fatores: {
    transporte: Transporte
    combustivel?: Combustivel | null
    valor: number
    unidade: string
  }[]
}

function argumentoPosicional(): string | undefined {
  return process.argv.slice(2).find((a) => !a.startsWith('--'))
}

function dataValida(rotulo: string, valor: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw new Error(`${rotulo} deve estar no formato AAAA-MM-DD. Recebido: ${valor}`)
  }
  return valor
}

export function montarLinhas(arquivo: ArquivoDeFatores): DocFatorEmissao[] {
  for (const campo of ['versao', 'fonte', 'vigencia_inicio', 'fatores'] as const) {
    if (arquivo[campo] === undefined) {
      throw new Error(`O arquivo de fatores não tem o campo obrigatório "${campo}".`)
    }
  }

  const vigenciaInicio = dataValida('A vigência inicial', arquivo.vigencia_inicio)
  const vigenciaFim = arquivo.vigencia_fim
    ? dataValida('A vigência final', arquivo.vigencia_fim)
    : null

  return arquivo.fatores.map((f) => {
    if (emiteZero(f.transporte)) {
      throw new Error(
        `O modal "${f.transporte}" emite zero por definição (§6.2) e não deve ter fator.`,
      )
    }
    if (exigeCombustivel(f.transporte) && !f.combustivel) {
      throw new Error(
        `O fator de "${f.transporte}" precisa de combustível: o valor depende dele.`,
      )
    }
    if (!exigeCombustivel(f.transporte) && f.combustivel) {
      throw new Error(
        `O fator de "${f.transporte}" não deve trazer combustível: o fator é por ` +
          'passageiro-km e não depende dele.',
      )
    }
    if (typeof f.valor !== 'number' || !Number.isFinite(f.valor) || f.valor < 0) {
      throw new Error(`Valor inválido no fator de "${f.transporte}": ${f.valor}`)
    }
    if (!f.unidade) {
      throw new Error(`O fator de "${f.transporte}" está sem unidade.`)
    }

    return {
      categoria: categoriaDoFator(f.transporte),
      chave: chaveDoFator(f.transporte, f.combustivel ?? null),
      valor: f.valor,
      unidade: f.unidade,
      fonte: arquivo.fonte,
      versao: arquivo.versao,
      vigenciaInicio,
      vigenciaFim,
    }
  })
}

async function principal(): Promise<void> {
  const caminho = caminhoDaBase(
    argumentoPosicional(),
    'BASE_FATORES_MOBILIDADE_PATH',
    'dados/fatores_mobilidade.json',
  )
  const arquivo = lerJson<ArquivoDeFatores>(caminho)
  const linhas = montarLinhas(arquivo)

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
    tituloDaEtapa('Fatores de emissão — mobilidade')
    for (const linha of linhas) {
      console.log(
        `  ${linha.categoria.padEnd(24)} ${linha.chave.padEnd(12)} ` +
          `${String(linha.valor).padStart(10)} ${linha.unidade}`,
      )
    }
    await gravarCadastro(COLECAO.fatorEmissao, documentos, db)
    console.log(
      `\n${linhas.length} fatores gravados. Versão ${arquivo.versao}, vigência ` +
        `${linhas[0]?.vigenciaInicio} → ${linhas[0]?.vigenciaFim ?? 'em aberto'}.`,
    )
    console.log(
      'Bicicleta, a pé e "outro" não têm fator: emitem zero por definição (§6.2).',
    )
  } finally {
    await encerrar()
  }
}

if (ehEntrada(import.meta.url)) void executar('seed-fatores-mobilidade', principal)

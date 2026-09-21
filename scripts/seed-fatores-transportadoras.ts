/**
 * Carga do fator de frete rodoviário de carga para `fatorEmissao` — §9.2.
 *
 * Como o da mobilidade, este script **não traz valor nenhum**: ele lê um arquivo
 * JSON que quem assina o relatório monta com a fonte adotada, valida a forma e
 * grava com fonte, versão e vigência, para a tela de método declarar de onde o
 * número veio. O valor não mora no código nem neste repositório (§10.8).
 *
 * O arquivo não é versionado. Estrutura esperada:
 *
 * {
 *   "versao": "nome-da-versao",
 *   "fonte": "quem publica, qual tabela, qual linha, qual ano, e a derivação",
 *   "vigencia_inicio": "AAAA-MM-DD",
 *   "vigencia_fim": null,
 *   "fatores": [
 *     { "chave": "geral", "valor": 0.0,
 *       "unidade": "kg CO2e por tonelada-quilometro" }
 *   ]
 * }
 *
 * Uso:
 *   npm run seed:fatores-transportadoras -- [caminho/do/arquivo.json]
 *
 * Reexecutar é seguro: a linha é identificada por
 * (categoria, chave, versão, início de vigência).
 */
import { CATEGORIA_FRETE_RODOVIARIO } from '../src/lib/calculo/categorias'
import { idFatorEmissao } from '../src/server/documentos/ids'
import type { DocFatorEmissao } from '../src/server/documentos/tipos'
import { validarFatorEmissao } from '../src/server/documentos/validacao'
import { gravarCadastro } from '../src/server/escrita'
import { COLECAO } from '../src/server/firestore'
import { CHAVE_DO_FATOR } from './ingest-transportadoras'
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
  fatores: { chave: string; valor: number; unidade: string }[]
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

/**
 * A unidade precisa ser por tonelada-quilômetro, e a guarda não é preciosismo.
 *
 * A conta do módulo multiplica **tonelada-quilômetro** pelo fator (§9.2). Um
 * fator por quilômetro — que existe na mesma tabela da fonte, na coluna ao lado —
 * produziria um número centenas de vezes errado **sem nada parecer quebrado**:
 * a carga rodaria, o total fecharia com a soma das entregas e a tela desenharia
 * tudo. É a classe de erro que só aparece em auditoria, e o nome da unidade é a
 * única coisa que a separa de um número plausível.
 */
function unidadeCompativel(unidade: string): boolean {
  const chave = unidade
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Hífen, ponto, espaço e sublinhado são grafia, não unidade: "tonelada-quilometro",
    // "tonelada quilometro" e "t.km" dizem a mesma coisa, e uma guarda que reprova a
    // primeira é alarme falso — que é como uma guarda começa a ser ignorada.
    .replace(/[\s._-]/g, '')
  return chave.includes('toneladaquilometro') || chave.includes('tkm')
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

  const linhas = arquivo.fatores.map((f) => {
    if (!f.chave) throw new Error('Todo fator precisa de chave.')
    // Zero zeraria o módulo inteiro em silêncio — o total fecharia e a tela
    // desenharia um inventário sem emissão nenhuma de distribuição.
    if (typeof f.valor !== 'number' || !Number.isFinite(f.valor) || f.valor <= 0) {
      throw new Error(`Valor inválido no fator "${f.chave}": ${f.valor}`)
    }
    if (!f.unidade) throw new Error(`O fator "${f.chave}" está sem unidade.`)
    if (!unidadeCompativel(f.unidade)) {
      throw new Error(
        `A unidade do fator "${f.chave}" não é por tonelada-quilômetro: "${f.unidade}". ` +
          'A conta do módulo multiplica t.km (§9.2); um fator por km entraria ' +
          'centenas de vezes errado sem nada parecer quebrado.',
      )
    }

    return {
      categoria: CATEGORIA_FRETE_RODOVIARIO,
      chave: f.chave,
      valor: f.valor,
      unidade: f.unidade,
      fonte: arquivo.fonte,
      versao: arquivo.versao,
      vigenciaInicio,
      vigenciaFim,
    }
  })

  // Sem a chave que a carga procura, o seed "funcionaria" e a carga pararia
  // depois reclamando de fator ausente — erro no lugar errado.
  if (!linhas.some((l) => l.chave === CHAVE_DO_FATOR)) {
    throw new Error(
      `O arquivo não traz a chave "${CHAVE_DO_FATOR}", que é a que a carga de ` +
        'entregas procura. Sem ela o módulo falharia na carga, não aqui.',
    )
  }

  return linhas
}

async function principal(): Promise<void> {
  const caminho = caminhoDaBase(
    argumentoPosicional(),
    'BASE_FATORES_TRANSPORTADORAS_PATH',
    'dados/fatores_transportadoras.json',
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
    tituloDaEtapa('Fatores de emissão — transportadoras')
    for (const linha of linhas) {
      console.log(
        `  ${linha.categoria.padEnd(22)} ${linha.chave.padEnd(10)} ` +
          `${String(linha.valor).padStart(10)} ${linha.unidade}`,
      )
    }
    await gravarCadastro(COLECAO.fatorEmissao, documentos, db)
    console.log(
      `\n${linhas.length} fator(es) gravado(s). Versão ${arquivo.versao}, vigência ` +
        `${linhas[0]?.vigenciaInicio} → ${linhas[0]?.vigenciaFim ?? 'em aberto'}.`,
    )
    console.log(
      'O regime de frete continua indefinido: o fator não decide se é cat. 4 ou ' +
        'cat. 9 (§9.1, §14).',
    )
  } finally {
    await encerrar()
  }
}

if (ehEntrada(import.meta.url)) void executar('seed-fatores-transportadoras', principal)

/**
 * A fronteira da §0.1, conferida **dos dois lados**.
 *
 * Este repositório abriga dois sistemas que compartilham casca, sessão e visual,
 * e nada mais. O inventário é relatório de emissão da empresa, alimentado por
 * fonte administrativa completa do período; o programa de viagens é registro
 * voluntário, preenchido por quem viajou. **Somar os dois produz uma série cuja
 * variação mede quanta gente preencheu e parece medir emissão** — uma queda de
 * adesão seria lida como redução de emissão, num relatório que alguém assina.
 *
 * A separação já é estrutural: são duas coleções, e não um campo discriminador,
 * justamente para não haver filtro que alguém possa esquecer. O que este arquivo
 * acrescenta é o que a estrutura sozinha não pega — **alguém trocando o nome da
 * coleção numa consulta, ou importando o módulo do outro lado numa tela.** Esses
 * dois erros compilam, passam em todo o resto e não estouram em lugar nenhum.
 *
 * Por isso a guarda é dupla, e as duas metades são de propósito:
 *
 *  - **estática**, sobre o texto dos arquivos: quem lê o quê;
 *  - **executável**, sobre o comportamento: um documento do programa não entra
 *    no total do inventário, e um documento do inventário não entra no total do
 *    programa.
 *
 * As duas foram conferidas ligando a mistura: com a consulta do inventário lendo
 * `viagemRegistrada`, as duas metades reprovam. Guarda que não morde não é
 * guarda.
 *
 * **Toda a massa é fictícia, inventada do zero** (§2.2).
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Firestore } from 'firebase-admin/firestore'

import type {
  DocViagemRegistrada,
  DocViagemTrecho,
  Papel,
} from '../documentos/tipos'
import type { ContextoDeAcesso } from './acesso'
import { consultarViagens } from './inventario'
import { consultarMinhasViagens, consultarPrograma } from './programa'

/* ------------------------------------------------------------- estática */

/** A coleção do programa. Nome literal, para o teste não seguir a constante. */
const COLECAO_DO_PROGRAMA = 'viagemRegistrada'

/** As coleções de emissão do inventário (§10.2). */
const COLECOES_DO_INVENTARIO = [
  'viagemTrecho',
  'mobilidade',
  'embarque',
  'entregaRodoviaria',
]

/** Módulos de consulta de cada lado. */
const CONSULTA_DO_INVENTARIO = [
  'src/server/consultas/inventario.ts',
  'src/server/consultas/visao-geral.ts',
]
const CONSULTA_DO_PROGRAMA = ['src/server/consultas/programa.ts']

/** As telas do inventário (§11) e as do programa. */
const TELAS_DO_INVENTARIO = [
  'src/app/page.tsx',
  'src/app/visao-geral',
  'src/app/mobilidade',
  'src/app/viagens',
  'src/app/maritimo',
  'src/app/transportadoras',
]
const TELAS_DO_PROGRAMA = ['src/app/programa']

/**
 * As peças de desenho compartilhadas pelas duas telas.
 *
 * **Compartilhar desenho é legítimo; compartilhar dado não é** (§7.5). Estas
 * peças existem fora das duas pastas justamente para isso — e a guarda é que
 * elas não conheçam nenhum dos dois lados. Se o componente falasse o tipo de uma
 * das consultas, a outra tela teria que importar o módulo do lado errado para
 * desenhar, e a fronteira cairia por uma porta que ninguém revisaria.
 */
const DESENHO_COMPARTILHADO = [
  'src/app/mapa-de-rotas.tsx',
  'src/app/serie-mensal.tsx',
  'src/app/grafico-de-barras.tsx',
  'src/app/componentes.tsx',
]

function arquivosDe(caminho: string): string[] {
  let existe = true
  let ehPasta = false
  try {
    ehPasta = statSync(caminho).isDirectory()
  } catch {
    existe = false
  }
  // Tela ainda não construída não é violação; é tela que não existe.
  if (!existe) return []
  if (!ehPasta) return [caminho]

  let encontrados: string[] = []
  for (const nome of readdirSync(caminho)) {
    encontrados = encontrados.concat(arquivosDe(join(caminho, nome)))
  }
  return encontrados.filter((c) => /\.tsx?$/.test(c))
}

function conteudoDe(caminhos: string[]): { caminho: string; texto: string }[] {
  return caminhos
    .flatMap((c) => arquivosDe(c))
    .map((caminho) => ({ caminho, texto: readFileSync(caminho, 'utf8') }))
}

/**
 * O que conta como leitura, e o que é só a palavra escrita.
 *
 * Os dois módulos **falam** um do outro o tempo todo, em comentário, porque a
 * separação precisa estar explicada onde alguém vá mexer. Proibir a palavra
 * transformaria o teste num que reprova a própria explicação — foi o que
 * aconteceu com o teste que proibia "corte" na fonte de viagens, registrado na
 * §14. O que se procura aqui é **uso**: o nome da coleção dentro de uma chamada
 * de `collection`, ou pela constante que a nomeia.
 */
function usaColecao(texto: string, colecao: string): boolean {
  const semComentarios = texto
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  return (
    new RegExp(`COLECAO\\.${colecao}\\b`).test(semComentarios) ||
    new RegExp(`collection\\(\\s*['"\`]${colecao}['"\`]`).test(semComentarios)
  )
}

test('a consulta do inventário não alcança a coleção do programa', () => {
  const infratores = conteudoDe(CONSULTA_DO_INVENTARIO)
    .filter(({ texto }) => usaColecao(texto, COLECAO_DO_PROGRAMA))
    .map(({ caminho }) => caminho)

  assert.deepEqual(
    infratores,
    [],
    `Consulta do inventário lendo "${COLECAO_DO_PROGRAMA}": autodeclaração voluntária ` +
      'entraria no relatório da empresa, e a série passaria a medir adesão (§0.1).',
  )
})

test('a consulta do programa não alcança coleção de emissão do inventário', () => {
  const infratores: string[] = []
  for (const { caminho, texto } of conteudoDe(CONSULTA_DO_PROGRAMA)) {
    for (const colecao of COLECOES_DO_INVENTARIO) {
      if (usaColecao(texto, colecao)) infratores.push(`${caminho} lê ${colecao}`)
    }
  }

  assert.deepEqual(
    infratores,
    [],
    'Consulta do programa lendo coleção de emissão do inventário: o programa ' +
      'mostraria como adesão o que veio de planilha (§0.1). Cadastro de apoio — ' +
      'funcionário, aeroporto — não está nesta lista, e é o que ele pode ler.',
  )
})

test('tela de inventário não importa a consulta do programa, nem o contrário', () => {
  const infratores: string[] = []

  for (const { caminho, texto } of conteudoDe(TELAS_DO_INVENTARIO)) {
    if (/from '[^']*consultas\/programa'/.test(texto)) {
      infratores.push(`${caminho} importa a consulta do programa`)
    }
  }
  for (const { caminho, texto } of conteudoDe(TELAS_DO_PROGRAMA)) {
    if (/from '[^']*consultas\/inventario'/.test(texto)) {
      infratores.push(`${caminho} importa a consulta do inventário`)
    }
  }

  assert.deepEqual(
    infratores,
    [],
    'Nenhuma tela mistura as duas origens — nem somadas, nem lado a lado, nem ' +
      'como comparação (§10). Querer os dois números na mesma página é decisão ' +
      'nova, que exige rediscutir a §0.1.',
  )
})

test('o desenho compartilhado não conhece nenhum dos dois lados', () => {
  const infratores: string[] = []

  for (const { caminho, texto } of conteudoDe(DESENHO_COMPARTILHADO)) {
    // `consultas/agregacao` é exceção declarada: são tipos de agregado puros,
    // sem coleção e sem lado — é o que permite a lista de grupos ser uma peça só.
    const importes = texto.match(/from '[^']*consultas\/[a-z-]+'/g) ?? []
    for (const importe of importes) {
      if (importe.includes('consultas/agregacao')) continue
      infratores.push(`${caminho} importa ${importe}`)
    }
  }

  assert.deepEqual(
    infratores,
    [],
    'Peça de desenho compartilhada amarrada a uma das consultas: a outra tela ' +
      'passaria a importar o módulo do lado errado só para desenhar (§0.1, §7.5).',
  )
})

/* ----------------------------------------------------------- executável */

const ANO = 2032

function ctx(papel: Papel = 'admin'): ContextoDeAcesso {
  return {
    uid: 'uid-ficticio-1',
    email: 'pessoa.ficticia@exemplo.invalid',
    papel,
    empresa: null,
    funcionarioId: null,
  }
}

function doInventario(): DocViagemTrecho {
  return {
    modulo: 'viagens',
    modal: 'aereo',
    escopo: 3,
    periodicidade: 'evento',
    ano: ANO,
    mes: `${ANO}-04`,
    empresa: null,
    fator: null,
    alertas: [],
    alertasCodigos: [],
    atualizadoEm: '2032-04-01',
    reservaId: 'reserva-ficticia',
    ordem: 1,
    funcionarioId: 'pessoa-ficticia-1',
    tipo: 'aereo',
    fonte: 'agencia',
    contabilizar: true,
    dataIda: '2032-04-10',
    dataVolta: null,
    origem: 'AAA',
    destino: 'BBB',
    companhia: null,
    voo: null,
    dataVoo: '2032-04-10',
    distanciaKm: 100,
    faixaDistancia: 'curta',
    passageiros: 1,
    co2Kg: 700,
    classeCabine: 'economica',
    multiplicadorClasse: 1,
    propriedadeVeiculo: null,
    combustivel: null,
    ocupantes: null,
  }
}

function doPrograma(parcial: Partial<DocViagemRegistrada> = {}): DocViagemRegistrada {
  return {
    modal: 'aereo',
    escopo: 3,
    ano: ANO,
    mes: `${ANO}-04`,
    fator: null,
    alertas: [],
    alertasCodigos: [],
    atualizadoEm: '2032-04-01',
    reservaId: 'registro-ficticio',
    ordem: 1,
    criadoPorUid: 'uid-ficticio-1',
    funcionarioId: null,
    tipo: 'aereo',
    dataIda: '2032-04-11',
    dataVolta: null,
    origem: 'AAA',
    destino: 'CCC',
    distanciaKm: 50,
    co2Kg: 13,
    faixaDistancia: 'curta',
    classeCabine: 'economica',
    multiplicadorClasse: 1,
    propriedadeVeiculo: null,
    combustivel: null,
    ocupantes: null,
    ...parcial,
  }
}

/** Banco falso que devolve o que houver na coleção pedida, e nada mais. */
function bancoCom(dados: Record<string, unknown[]>): Firestore {
  const colecao = (nome: string) => {
    const consulta = {
      where: () => consulta,
      select: () => consulta,
      get: async () => ({
        size: (dados[nome] ?? []).length,
        docs: (dados[nome] ?? []).map((d, i) => ({
          id: `doc-ficticio-${i}`,
          data: () => d,
        })),
      }),
    }
    return consulta
  }
  return { collection: colecao } as unknown as Firestore
}

async function comAmbiente<T>(
  valores: Record<string, string>,
  tarefa: () => Promise<T>,
): Promise<T> {
  const anterior = { ...process.env }
  Object.assign(process.env, valores)
  try {
    return await tarefa()
  } finally {
    process.env = anterior
  }
}

test('viagem registrada pelo colaborador não entra no total do inventário', async () => {
  const banco = bancoCom({
    viagemTrecho: [doInventario()],
    viagemRegistrada: [doPrograma(), doPrograma({ ordem: 2, co2Kg: 999 })],
    aeroporto: [],
  })

  const dados = await comAmbiente({ MOBILIDADE_SUPRESSAO_MINIMA: '5' }, () =>
    consultarViagens(ctx(), { ano: ANO }, banco),
  )

  assert.equal(dados.trechos, 1, 'o inventário conta só o que veio de carga')
  // **Esta linha é a que de fato morde, e o motivo vale guardar.** As demais
  // olham o que entra no total, e o total já filtra por `contabilizar` — campo
  // que a coleção do programa não tem. Um documento do programa lido por engano
  // pela consulta do inventário cairia nesse filtro e somaria zero: o erro
  // existiria e não apareceria em nenhum número. `trechosForaDoTotal` conta os
  // documentos lidos, antes do filtro, e por isso é onde a leitura indevida
  // aparece.
  assert.equal(
    dados.trechosForaDoTotal,
    0,
    'a consulta do inventário leu documento que não veio de carga: só itinerário ' +
      'duplicado do relatório da agência fica gravado e fora do total (§7.2)',
  )
  assert.equal(
    dados.co2Kg,
    700,
    'a emissão do inventário não pode carregar nada do programa: a série passaria ' +
      'a subir e descer com a adesão ao formulário',
  )
  assert.equal(
    dados.destinos.some((d) => d.rotulo.includes('CCC')),
    false,
    'destino que só existe no programa não pode aparecer num recorte do inventário',
  )
})

test('trecho do inventário não entra no total do programa', async () => {
  const banco = bancoCom({
    viagemTrecho: [doInventario()],
    viagemRegistrada: [doPrograma()],
    funcionario: [],
  })

  const dados = await consultarPrograma(ctx(), { ano: ANO }, banco)

  assert.equal(dados.trechos, 1, 'o programa conta só o que foi registrado à mão')
  assert.equal(
    dados.co2Kg,
    13,
    'o programa mostraria como adesão o que veio de planilha, e a cobertura ' +
      'passaria a medir carga, não preenchimento',
  )

  const minhas = await consultarMinhasViagens(ctx('colaborador'), banco)
  assert.equal(minhas.viagens.length, 1)
  assert.equal(minhas.co2Kg, 13)
})

/**
 * A recíproca da anterior, pelo lado que a estrutura não protege sozinha: se as
 * duas coleções fossem **a mesma**, o inventário somaria as duas coisas. O teste
 * põe o documento do programa dentro da coleção do inventário e confere que o
 * total muda — é o que demonstra que a separação de cima está segurando algo
 * real, e não apenas descrevendo um banco vazio.
 */
test('a mistura, se acontecesse, mudaria o número — e é por isso que ela é impossível', async () => {
  const misturado = bancoCom({
    viagemTrecho: [
      doInventario(),
      // O mesmo registro do programa, se estivesse na coleção errada.
      { ...doInventario(), reservaId: 'r-do-programa', destino: 'CCC', co2Kg: 13 },
    ],
    aeroporto: [],
  })

  const dados = await comAmbiente({ MOBILIDADE_SUPRESSAO_MINIMA: '5' }, () =>
    consultarViagens(ctx(), { ano: ANO }, misturado),
  )

  assert.equal(dados.co2Kg, 713)
  assert.notEqual(
    dados.co2Kg,
    700,
    'se este total fosse igual ao do inventário puro, o teste anterior não estaria ' +
      'provando nada: a diferença é a emissão que a §0.1 mantém fora',
  )
})

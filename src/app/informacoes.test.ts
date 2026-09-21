/**
 * **Nenhuma declaração pode perder endereço** — CLAUDE.md §10.5 e §13.
 *
 * A tela de Método saiu em 19/09 e o que ela declarava foi para um botão fixo em
 * cada tela. A §13 avisou qual era o risco da mudança, e não era apagar a tela:
 * era apagar o **endereço** das declarações. Uma escolha que muda o número e não
 * aparece em lugar nenhum deixa o número sem lastro, e nada quebra — o
 * inventário continua somando certo e para de poder ser conferido.
 *
 * **A proteção principal não é este arquivo: é a forma.** Cada tela mostra
 * `<Parametros>` **sem lista de chaves**, então ela mostra todos os parâmetros
 * do próprio módulo — parâmetro novo aparece sozinho, e não há lista para
 * alguém esquecer de atualizar. É o mesmo argumento da §0.1: a mistura passa de
 * proibida a impossível quando não há filtro para esquecer.
 *
 * O que sobra para o teste é o que a forma não garante: que todo parâmetro tenha
 * um módulo, que a tela daquele módulo exista e mostre a lista, e que o botão
 * seja um só por tela.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const FONTE_DO_METODO = 'src/server/consultas/metodo.ts'

/** A tela de cada módulo, e a peça que mostra o resumo dele. */
const TELA_DO_MODULO: Record<string, string> = {
  mobilidade: 'src/app/mobilidade/page.tsx',
  viagens: 'src/app/viagens/page.tsx',
  maritimo: 'src/app/maritimo/page.tsx',
  transportadoras: 'src/app/transportadoras/page.tsx',
}

/** Toda tela do inventário tem um botão fixo — inclusive a Visão geral. */
const TELAS_COM_RESUMO = [
  ...Object.values(TELA_DO_MODULO),
  'src/app/visao-geral/conteudo.tsx',
]

/** Cada `lista.push({...})` do construtor de parâmetros, inteiro. */
function blocosDeParametro(): string[] {
  const fonte = readFileSync(FONTE_DO_METODO, 'utf8')
  const blocos: string[] = []
  let i = 0
  for (;;) {
    const j = fonte.indexOf('lista.push({', i)
    if (j === -1) return blocos
    const k = fonte.indexOf('\n    })', j)
    blocos.push(fonte.slice(j, k))
    i = k
  }
}

function campo(bloco: string, nome: string): string | null {
  return new RegExp(`${nome}: '([^']+)'`).exec(bloco)?.[1] ?? null
}

test('todo parâmetro declarado tem módulo, e o módulo tem tela', () => {
  const blocos = blocosDeParametro()
  assert.ok(blocos.length > 0, 'nenhum parâmetro foi encontrado no fonte do método')

  const semEndereco = blocos
    .map((b) => ({ chave: campo(b, 'chave'), escopo: campo(b, 'escopo') }))
    .filter((p) => p.escopo === null || TELA_DO_MODULO[p.escopo] === undefined)
    .map((p) => `${p.chave} (escopo: ${p.escopo})`)

  assert.deepEqual(
    semEndereco,
    [],
    'Parâmetro sem tela que o mostre: a escolha continua mudando o número e ' +
      'deixa de aparecer em qualquer lugar. Era isto que a tela de Método fazia, ' +
      'e é isto que o botão de cada tela passou a fazer (§10.5).',
  )
})

test('a tela de cada módulo mostra todos os parâmetros dele, sem lista a esquecer', () => {
  for (const [modulo, caminho] of Object.entries(TELA_DO_MODULO)) {
    const texto = readFileSync(caminho, 'utf8')

    assert.ok(
      /<Parametros parametros=\{metodo\.parametros\} \/>/.test(texto),
      `${caminho} não mostra os parâmetros do módulo, ou passa uma lista de ` +
        'chaves — com lista, um parâmetro novo nasce invisível e ninguém é ' +
        'avisado.',
    )
    assert.ok(
      texto.includes(`modulo: '${modulo}'`) || texto.includes(`modulo="${modulo}"`),
      `${caminho} não pede o método do próprio módulo.`,
    )
  }
})

test('cada tela tem um botão de resumo, e só um', () => {
  for (const caminho of TELAS_COM_RESUMO) {
    const texto = readFileSync(caminho, 'utf8')
    const quantos = (texto.match(/<SobreATela\b/g) ?? []).length
    assert.equal(
      quantos,
      1,
      `${caminho} tem ${quantos} botões de resumo. Um lugar previsível responde ` +
        'antes de ser procurado; vários voltam a ser a tela de Método espalhada.',
    )
  }
})

test('nenhuma chave é duplicada', () => {
  const chaves = blocosDeParametro().map((b) => campo(b, 'chave'))
  const vistas = new Set<string | null>()
  const repetidas = chaves.filter((c) => (vistas.has(c) ? true : (vistas.add(c), false)))

  assert.deepEqual(
    repetidas,
    [],
    'Duas declarações com a mesma chave: o resumo mostraria uma e esconderia a ' +
      'outra, e qual das duas depende da ordem em que a lista foi montada.',
  )
})

/**
 * **A telinha é um bloco, e bloco não entra em `<p>` nem em título.**
 *
 * O analisador de HTML fecha o parágrafo antes dela, o DOM deixa de bater com o
 * que o React renderizou e **a hidratação falha** — e hidratação que falha não é
 * um aviso no console: é a página inteira parando de hidratar, com todo botão
 * virando enfeite. Foi o que aconteceu quando o botão era filho do `<h2>` do
 * painel e do `<p>` do cartão.
 *
 * Agora o botão e a telinha ficam na raiz da tela. O teste prende isso: eles não
 * podem voltar para dentro de um painel ou de um cartão.
 */
test('o botão de resumo fica na raiz da tela, fora de painel e de cartão', () => {
  // **Pela indentação, e não por contagem de tags.** A primeira versão contava
  // `<Cartao>` aberto contra fechado, e a contagem quebrou no primeiro cartão
  // cujo atributo continha JSX: um `>` dentro do atributo encerra a tag para
  // qualquer expressão regular honesta. A indentação diz a mesma coisa sem
  // fingir que sabe analisar JSX — filho direto da casca fica raso, aninhado
  // fica fundo.
  const RASO = 8

  for (const caminho of TELAS_COM_RESUMO) {
    const linha = readFileSync(caminho, 'utf8')
      .split(/\r?\n/)
      .find((l) => l.includes('<SobreATela'))
    assert.notEqual(linha, undefined, `${caminho} perdeu o botão de resumo.`)

    const recuo = linha!.length - linha!.trimStart().length
    assert.ok(
      recuo <= RASO,
      `${caminho}: o botão de resumo está aninhado (recuo ${recuo}). A telinha é ` +
        'um bloco, e bloco dentro de título ou de parágrafo derruba a hidratação ' +
        'da página inteira — ele fica na raiz da tela.',
    )
  }
})

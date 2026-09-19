/**
 * Guarda de layout: **a casca é contêiner, cada peça declara a própria medida.**
 *
 * Enquanto a casca tinha `max-width: 1180px`, uma peça de prosa sem medida de
 * leitura não incomodava — o teto da casca a limitava por acidente. Tirado o
 * teto (ver `casca.tsx`), a mesma peça vira uma linha de duzentos caracteres num
 * monitor largo, e o mesmo vale para um desenho de `viewBox`, que amplia o
 * próprio texto em vez de refluir.
 *
 * É exatamente o tipo de regressão que não aparece em typecheck, em teste de
 * número nem em build: só aparece para quem abre a tela numa largura que quem
 * escreveu não usou. Por isso é conferida aqui.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const RAIZ_DAS_TELAS = 'src/app'

function arquivosDe(diretorio: string): string[] {
  let encontrados: string[] = []
  for (const nome of readdirSync(diretorio)) {
    const caminho = join(diretorio, nome)
    if (statSync(caminho).isDirectory()) {
      encontrados = encontrados.concat(arquivosDe(caminho))
    } else if (/\.tsx$/.test(nome)) {
      encontrados.push(caminho)
    }
  }
  return encontrados
}

/** Tags de abertura de um elemento, com tudo que vai dentro dos colchetes. */
function tagsDe(conteudo: string, elemento: string): string[] {
  const achadas: string[] = []
  const padrao = new RegExp(`<${elemento}\\b[^>]*>`, 'g')
  for (const achado of conteudo.matchAll(padrao)) achadas.push(achado[0])
  return achadas
}

test('a casca não impõe medida — quem impõe é cada peça', () => {
  const casca = readFileSync(join(RAIZ_DAS_TELAS, 'casca.tsx'), 'utf8')
  const principais = tagsDe(casca, 'main')

  assert.equal(principais.length, 1, 'A casca tem um <main> só.')
  assert.ok(
    !principais[0].includes('max-w-'),
    'O <main> da casca voltou a ter teto de largura. Ele é contêiner, não medida: ' +
      'teto aqui é um número arbitrário que devolve branco ancorado à direita um ' +
      'monitor adiante. Quem declara limite é a peça — prosa em ch, desenho em px.',
  )
})

test('toda legenda de figura declara medida de leitura', () => {
  const semMedida: string[] = []

  for (const caminho of arquivosDe(RAIZ_DAS_TELAS)) {
    for (const tag of tagsDe(readFileSync(caminho, 'utf8'), 'figcaption')) {
      if (!/max-w-\[\d+ch\]/.test(tag)) semMedida.push(caminho)
    }
  }

  assert.deepEqual(
    semMedida,
    [],
    'Legenda de figura sem medida de leitura: numa casca sem teto ela vira uma ' +
      'linha da largura do monitor. A legenda do mapa usa 70ch.',
  )
})

test('as peças compartilhadas de prosa declaram medida', () => {
  const componentes = readFileSync(join(RAIZ_DAS_TELAS, 'componentes.tsx'), 'utf8')

  // O corpo de cada peça, do nome dela até a próxima declaração de topo.
  const corpoDe = (nome: string) => {
    const inicio = componentes.indexOf(`export function ${nome}(`)
    assert.notEqual(inicio, -1, `A peça ${nome} sumiu de componentes.tsx.`)
    const fim = componentes.indexOf('\nexport ', inicio + 1)
    return componentes.slice(inicio, fim === -1 ? undefined : fim)
  }

  for (const nome of ['Nota', 'Vazio', 'Painel', 'Secao', 'Cabecalho']) {
    assert.ok(
      /max-w-\[\d+ch\]/.test(corpoDe(nome)),
      `A peça ${nome} perdeu a medida de leitura do texto dela.`,
    )
  }
})

test('nenhuma grade estica o item curto', () => {
  // Qualquer conjunto de classes que ligue `display: grid`, venha ele da peça
  // compartilhada ou escrito numa tela. A varredura é sobre o texto porque é
  // assim que a classe chega ao navegador.
  const infratores: string[] = []

  for (const caminho of arquivosDe(RAIZ_DAS_TELAS)) {
    const conteudo = readFileSync(caminho, 'utf8')
    for (const achado of conteudo.matchAll(/['"`]([^'"`\n]*\bgrid\b[^'"`\n]*)['"`]/g)) {
      const classes = achado[1]
      // `grid-cols-…` sozinho é modificador de uma grade declarada em outro
      // lugar — quem precisa do alinhamento é quem liga o `grid`.
      if (!/(^|\s)grid(\s|$)/.test(classes)) continue
      if (!classes.includes('items-start')) infratores.push(`${caminho}: "${classes}"`)
    }
  }

  assert.deepEqual(
    infratores,
    [],
    'Grade sem `items-start`: item de grade estica por padrão, e a esticada é ' +
      'branco dentro de uma caixa com borda — que se lê como dado faltando, não ' +
      'como painel pequeno. A borda encosta no conteúdo, sempre.',
  )
})

test('nenhuma grade pode ser alargada por dentro', () => {
  // O mínimo automático de um item de grade é o min-content dele, e um item que
  // contenha largura mínima declarada — o envoltório de rolagem — arrasta esse
  // mínimo para a coluna. A coluna cresce, a grade passa do contêiner e a PÁGINA
  // ganha rolagem lateral, com o envoltório nunca chegando a rolar. Medido: 622px
  // de painel num aparelho de 390.
  const infratores: string[] = []

  for (const caminho of arquivosDe(RAIZ_DAS_TELAS)) {
    const conteudo = readFileSync(caminho, 'utf8')
    for (const achado of conteudo.matchAll(/['"`]([^'"`\n]*\bgrid\b[^'"`\n]*)['"`]/g)) {
      const classes = achado[1]
      if (!/(^|\s)grid(\s|$)/.test(classes)) continue
      if (!classes.includes('[&>*]:min-w-0')) infratores.push(`${caminho}: "${classes}"`)
    }
  }

  assert.deepEqual(
    infratores,
    [],
    'Grade sem `[&>*]:min-w-0`: o item leva o próprio min-content para a coluna, ' +
      'a coluna cresce e a página inteira passa a rolar de lado. `grid-cols-1` ' +
      'não resolve — o problema é o mínimo do item, não o número de colunas.',
  )
})

/**
 * `viewBox` é escala, não tamanho — e escala erra para os dois lados.
 *
 * Para cima, largura a mais multiplica o desenho inteiro, texto incluído: sem
 * teto o mapa passa de mil pixels de altura e o valor no topo da barra fica
 * maior que o título da tela. Para baixo, largura a menos **reduz o texto junto**:
 * num celular a série mensal saía com rótulo de mês a 6,7px. Cada desenho
 * declara as duas pontas, e a de baixo é rolagem, não encolhimento.
 */
test('os desenhos que ampliam em vez de refluir têm teto e piso', () => {
  const pontas: [string, string, string | null][] = [
    ['mapa-de-rotas.tsx', 'LARGURA_MAXIMA', 'LARGURA_MINIMA'],
    ['grafico-de-barras.tsx', 'AMPLIACAO_MAXIMA', 'REDUCAO_MAXIMA'],
    ['visao-geral/serie-empilhada.tsx', 'AMPLIACAO_MAXIMA', 'REDUCAO_MAXIMA'],
    // O radar não tem piso de propósito: são quatro rótulos, e a legenda
    // carrega o significado. Ele degrada bem onde os outros viram sujeira.
    ['mobilidade/radar.tsx', 'LARGURA_MAXIMA', null],
  ]

  for (const [arquivo, teto, piso] of pontas) {
    const conteudo = readFileSync(join(RAIZ_DAS_TELAS, arquivo), 'utf8')

    assert.ok(
      conteudo.includes(`const ${teto}`) && /max(Width|imo)[=:]/.test(conteudo),
      `${arquivo} perdeu o teto de largura do desenho (${teto}).`,
    )
    if (piso !== null) {
      assert.ok(
        conteudo.includes(`const ${piso}`) && /minimo[=:]/.test(conteudo),
        `${arquivo} perdeu o piso de largura (${piso}): abaixo dele o desenho ` +
          'tem de rolar, nunca encolher o próprio texto.',
      )
    }
  }
})

test('toda célula numérica leva o rótulo da coluna junto', () => {
  // No celular a tabela vira lista (`tabela-empilha`, em globals.css) e o
  // cabeçalho some — o rótulo passa a vir de `data-rotulo`, colado no valor.
  // Sem ele, uma célula numérica no telefone é um número solto sem nome, que é
  // pior que a rolagem lateral que isto substituiu.
  const semRotulo: string[] = []

  for (const caminho of arquivosDe(RAIZ_DAS_TELAS)) {
    const conteudo = readFileSync(caminho, 'utf8')
    for (const achado of conteudo.matchAll(/<td\b[^>]*TABELA\.tdNum[^>]*>/g)) {
      if (!achado[0].includes('data-rotulo')) semRotulo.push(`${caminho}: ${achado[0]}`)
    }
  }

  assert.deepEqual(
    semRotulo,
    [],
    'Célula numérica sem `data-rotulo`: no celular ela vira um número sem nome, ' +
      'porque o cabeçalho da tabela não existe mais nessa largura.',
  )
})

test('toda tabela rola em vez de espremer', () => {
  // Cinco colunas em 280px úteis dão 56px cada, e só a de período precisa de
  // mais que isso: a tabela estoura o painel e empurra a PÁGINA para rolar de
  // lado. Por isso a rolagem é da tabela, e declarada onde ela é escrita.
  const semRolagem: string[] = []

  for (const caminho of arquivosDe(RAIZ_DAS_TELAS)) {
    const conteudo = readFileSync(caminho, 'utf8')
    const tabelas = (conteudo.match(/<table\b/g) ?? []).length
    if (tabelas === 0) continue
    const rolaveis = (conteudo.match(/<Rolavel\b/g) ?? []).length
    if (rolaveis < tabelas) {
      semRolagem.push(`${caminho}: ${tabelas} tabela(s), ${rolaveis} rolável(is)`)
    }
  }

  assert.deepEqual(
    semRolagem,
    [],
    'Tabela sem rolagem própria: em largura de celular ela estoura o painel e ' +
      'faz a página inteira rolar de lado — defeito que se sente e não se localiza.',
  )
})

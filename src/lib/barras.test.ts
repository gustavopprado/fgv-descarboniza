/**
 * Testes da geometria do gráfico de barras.
 *
 * **Toda a massa aqui é fictícia, inventada do zero** (§2.2).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { montarBarras, montarBarrasEmpilhadas } from './barras'

const MOLDURA = { largura: 420, altura: 260 }

function valores(...pares: [string, number][]) {
  return pares.map(([rotulo, valor]) => ({ rotulo, valor }))
}

test('a barra maior é a mais alta, e nenhuma passa da base', () => {
  const { barras, base } = montarBarras(valores(['a', 10], ['b', 40], ['c', 25]), MOLDURA)

  assert.ok(barras[1].altura > barras[2].altura)
  assert.ok(barras[2].altura > barras[0].altura)
  for (const barra of barras) {
    assert.ok(barra.altura >= 0)
    assert.ok(barra.y >= 0, 'barra estourou o topo da moldura')
    assert.ok(barra.y + barra.altura <= base + 1e-9, 'barra passou da linha de base')
  }
})

test('série inteira zerada não vira NaN nem barra cheia', () => {
  const { barras } = montarBarras(valores(['a', 0], ['b', 0]), MOLDURA)
  for (const barra of barras) {
    assert.equal(barra.altura, 0)
    assert.ok(Number.isFinite(barra.x) && Number.isFinite(barra.y))
  }
})

test('valor pequeno não some: barra ausente e barra invisível não são a mesma coisa', () => {
  const { barras } = montarBarras(valores(['grande', 10000], ['minusculo', 1]), MOLDURA)
  assert.equal(barras[0].valor > 0 && barras[0].altura > 0, true)
  assert.ok(
    barras[1].altura >= 2,
    'valor não nulo precisa de um fio de altura para não parecer ausente',
  )
})

test('valor zero continua com altura zero', () => {
  const { barras } = montarBarras(valores(['tem', 10], ['nao tem', 0]), MOLDURA)
  assert.equal(barras[1].altura, 0)
})

test('as barras não se sobrepõem e ficam dentro da largura', () => {
  const { barras } = montarBarras(
    valores(['a', 1], ['b', 2], ['c', 3], ['d', 4], ['e', 5]),
    MOLDURA,
  )
  for (let i = 1; i < barras.length; i++) {
    assert.ok(
      barras[i].x >= barras[i - 1].x + barras[i - 1].largura,
      'barras se sobrepondo',
    )
  }
  const ultima = barras[barras.length - 1]
  assert.ok(ultima.x + ultima.largura <= MOLDURA.largura)
})

test('série longa rareia o rótulo e esconde o valor no topo', () => {
  const curta = montarBarras(valores(...Array.from({ length: 6 }, (_, i) => [`m${i}`, i + 1] as [string, number])), MOLDURA)
  assert.equal(curta.saltoDoRotulo, 1)
  assert.equal(curta.mostrarValores, true)

  const longa = montarBarras(
    valores(...Array.from({ length: 24 }, (_, i) => [`m${i}`, i + 1] as [string, number])),
    MOLDURA,
  )
  assert.equal(longa.saltoDoRotulo, 2)
  assert.equal(longa.mostrarValores, false)
})

test('lista vazia não estoura', () => {
  const vazio = montarBarras([], MOLDURA)
  assert.deepEqual(vazio.barras, [])
  assert.equal(vazio.base, MOLDURA.altura - 30)
})

/* ------------------------------------------------------ barras empilhadas */

function empilhados(...pares: [string, number[]][]) {
  return pares.map(([rotulo, partes]) => ({ rotulo, partes }))
}

/**
 * **A pilha soma a coluna, e a coluna soma o total do mês.**
 *
 * É a invariante da peça, e a razão de não haver altura mínima por segmento: um
 * mínimo faria a pilha ficar mais alta que a própria coluna, e o desenho passaria
 * a afirmar um total que o indicador da tela não tem.
 */
test('a pilha fecha exatamente na altura da coluna', () => {
  const { barras, base } = montarBarrasEmpilhadas(
    empilhados(['jan', [10, 5, 85]], ['fev', [10, 0, 30]], ['mar', [10, 2, 0]]),
    MOLDURA,
  )

  for (const barra of barras) {
    const somaDasAlturas = barra.segmentos.reduce((s, seg) => s + seg.altura, 0)
    const topo = Math.min(...barra.segmentos.map((seg) => seg.y))
    assert.ok(
      Math.abs(base - topo - somaDasAlturas) < 1e-9,
      `a pilha de ${barra.rotulo} não fecha na coluna`,
    )
    assert.ok(barra.segmentos.every((seg) => seg.y >= 0), 'segmento estourou o topo')
    assert.ok(
      barra.segmentos.every((seg) => seg.y + seg.altura <= base + 1e-9),
      'segmento passou da linha de base',
    )
  }
})

test('as alturas são proporcionais ao valor, e a escala é a mesma em toda a série', () => {
  const { barras } = montarBarrasEmpilhadas(
    empilhados(['jan', [10, 10, 10]], ['fev', [20, 0, 0]]),
    MOLDURA,
  )

  const [a, b, c] = barras[0].segmentos
  assert.ok(Math.abs(a.altura - b.altura) < 1e-9)
  assert.ok(Math.abs(b.altura - c.altura) < 1e-9)
  assert.ok(
    Math.abs(barras[1].segmentos[0].altura - 2 * a.altura) < 1e-9,
    'uma parte de valor dobrado precisa ter o dobro da altura',
  )
})

test('os segmentos se empilham sem buraco e sem sobreposição', () => {
  const { barras, base } = montarBarrasEmpilhadas(
    empilhados(['jan', [10, 20, 30]]),
    MOLDURA,
  )

  let esperado = base
  for (const seg of barras[0].segmentos) {
    assert.ok(
      Math.abs(seg.y + seg.altura - esperado) < 1e-9,
      'o segmento não começa onde o anterior terminou',
    )
    esperado = seg.y
  }
})

test('parte zerada tem altura zero e não desloca as de cima', () => {
  const comZero = montarBarrasEmpilhadas(empilhados(['jan', [10, 0, 30]]), MOLDURA)
  const sem = montarBarrasEmpilhadas(empilhados(['jan', [10, 30]]), MOLDURA)

  assert.equal(comZero.barras[0].segmentos[1].altura, 0)
  assert.ok(
    Math.abs(comZero.barras[0].segmentos[2].y - sem.barras[0].segmentos[1].y) < 1e-9,
    'a parte zerada empurrou a de cima',
  )
})

test('série empilhada inteira zerada não vira NaN', () => {
  const { barras } = montarBarrasEmpilhadas(
    empilhados(['jan', [0, 0, 0]], ['fev', [0, 0, 0]]),
    MOLDURA,
  )

  for (const barra of barras) {
    assert.equal(barra.total, 0)
    for (const seg of barra.segmentos) {
      assert.equal(seg.altura, 0)
      assert.ok(Number.isFinite(seg.y))
    }
  }
})

/**
 * A banda constante precisa **sair constante**: é ela que declara, sozinha, que
 * a mobilidade é taxa repetida nos doze meses e não medição mensal (§10.0).
 */
test('a banda de base é plana quando o valor não muda', () => {
  const { barras } = montarBarrasEmpilhadas(
    empilhados(['jan', [10, 1, 90]], ['fev', [10, 40, 2]], ['mar', [10, 0, 0]]),
    MOLDURA,
  )

  const alturas = new Set(barras.map((b) => b.segmentos[0].altura.toFixed(9)))
  assert.equal(alturas.size, 1, 'a banda da base variou com o total do mês')
})

test('as colunas empilhadas não se sobrepõem', () => {
  const { barras } = montarBarrasEmpilhadas(
    empilhados(...Array.from({ length: 12 }, (_, i): [string, number[]] => [
      `m${i}`,
      [1, i, 12 - i],
    ])),
    MOLDURA,
  )

  for (let i = 1; i < barras.length; i++) {
    assert.ok(
      barras[i].x >= barras[i - 1].x + barras[i - 1].largura,
      'colunas vizinhas se sobrepõem',
    )
  }
  assert.equal(barras.length, 12)
  assert.equal(
    montarBarrasEmpilhadas(empilhados(), MOLDURA).barras.length,
    0,
    'lista vazia não pode estourar',
  )
})

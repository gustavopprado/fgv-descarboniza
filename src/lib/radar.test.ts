/**
 * Testes do radar de mobilidade — CLAUDE.md §3.1.
 *
 * A garantia que importa não é geométrica: é que **só distância entra**. O
 * teste fixa a assinatura e os invariantes que fazem o desenho ser legível sem
 * dizer quem é quem.
 *
 * **Toda a massa aqui é fictícia, inventada do zero** (§2.2).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ANEIS_DO_RADAR, faixasDeDistancia, montarRadar } from './radar'

const RAIO = 100

function comprimento(ponto: { x: number; y: number }): number {
  return Math.sqrt(ponto.x ** 2 + ponto.y ** 2)
}

test('um ponto por pessoa, e nada além de coordenada em cada um', () => {
  const { pontos } = montarRadar([5, 10, 20], { raio: RAIO })
  assert.equal(pontos.length, 3)
  for (const ponto of pontos) {
    // `angulo` entrou para a varredura poder revelar cada ponto na hora certa.
    // Continua não havendo nada além de geometria: nenhum identificador,
    // nenhum lugar, nenhum modal.
    assert.deepEqual(Object.keys(ponto).sort(), ['angulo', 'x', 'y'])
    assert.ok(ponto.angulo >= 0 && ponto.angulo < Math.PI * 2)
  }
})

test('quem mora mais longe fica mais longe do centro', () => {
  const { pontos } = montarRadar([5, 10, 40], { raio: RAIO })
  const raios = pontos.map(comprimento)
  assert.ok(raios[0] < raios[1])
  assert.ok(raios[1] < raios[2])
  // O mais distante encosta na borda: a escala usa o raio inteiro.
  assert.ok(Math.abs(raios[2] - RAIO) < 1e-9)
})

test('distâncias iguais não viram o mesmo ponto', () => {
  const { pontos } = montarRadar([12, 12, 12, 12], { raio: RAIO })
  const chaves = new Set(pontos.map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`))
  assert.equal(chaves.size, 4, 'pontos empilhados escondem quantas pessoas são')
})

test('conjunto vazio não vira NaN', () => {
  const radar = montarRadar([], { raio: RAIO })
  assert.deepEqual(radar.pontos, [])
  assert.equal(radar.distanciaMaximaKm, 0)
  assert.ok(radar.aneis.every((a) => Number.isFinite(a.raio)))
})

test('todo mundo na distância zero não divide por zero', () => {
  const { pontos } = montarRadar([0, 0], { raio: RAIO })
  assert.ok(pontos.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)))
})

test('o desenho é determinístico', () => {
  const primeiro = montarRadar([3, 9, 27], { raio: RAIO })
  const segundo = montarRadar([3, 9, 27], { raio: RAIO })
  assert.deepEqual(primeiro, segundo)
})

test('os anéis dobram de valor e cabem dentro do maior deslocamento', () => {
  const { aneis, distanciaMaximaKm } = montarRadar([2, 9, 37], { raio: RAIO, aneis: 4 })
  const escada = aneis.filter((a) => !a.naBorda)

  assert.ok(escada.length >= 2)
  for (let i = 1; i < escada.length; i++) {
    assert.equal(escada[i].distanciaKm, escada[i - 1].distanciaKm * 2)
    assert.ok(escada[i].raio > escada[i - 1].raio)
  }
  for (const anel of aneis) {
    assert.ok(anel.distanciaKm <= distanciaMaximaKm, 'anel além do que existe no dado')
    assert.ok(anel.raio <= RAIO + 1e-9)
  }
})

test('a borda do radar nunca fica sem anel', () => {
  for (const distancias of [[2, 9, 37], [1, 3, 8], [4, 60], [12]]) {
    const { aneis } = montarRadar(distancias, { raio: RAIO, aneis: 4 })
    const maisExterno = aneis[aneis.length - 1]
    assert.ok(
      maisExterno !== undefined && maisExterno.raio >= RAIO * 0.92,
      `borda muda com ${distancias.join(', ')}: o limite do desenho não diz nada`,
    )
  }
})

test('a escala de raiz espalha o que a linear empilharia', () => {
  // Quase todo mundo perto e um ponto longe: na escala linear os de perto
  // caem todos no primeiro décimo do raio.
  const { pontos } = montarRadar([1, 2, 3, 4, 100], { raio: RAIO })
  const raios = pontos.map(comprimento)

  assert.ok(
    raios[3] > RAIO * 0.15,
    'com escala de raiz, quem mora perto ainda ocupa área visível',
  )
  assert.ok(raios[0] < raios[1] && raios[1] < raios[2] && raios[2] < raios[3])
})


/* ------------------------------------------------ as faixas que se clicam */

/**
 * A faixa é o recorte que a tela abre (§3.1.1), e ela precisa cobrir a régua
 * inteira: quem cair num vão entre dois anéis some da contagem sem nada
 * quebrar — o radar continua desenhando o ponto e o agregado deixa de somá-lo.
 */
test('as faixas se encaixam, sem vão e sem sobreposição', () => {
  for (const maior of [37, 8, 60, 12, 9, 1.5, 214]) {
    const faixas = faixasDeDistancia(maior, ANEIS_DO_RADAR)

    assert.ok(faixas.length > 0, `nenhuma faixa com maior = ${maior}`)
    assert.equal(faixas[0].deKm, 0, 'a primeira faixa não começa na fábrica')
    assert.ok(
      faixas[faixas.length - 1].ateKm >= maior,
      `a última faixa fecha antes de quem mora mais longe (maior = ${maior})`,
    )
    for (let i = 1; i < faixas.length; i++) {
      assert.equal(
        faixas[i].deKm,
        faixas[i - 1].ateKm,
        `vão ou sobreposição entre faixas com maior = ${maior}`,
      )
    }
  }
})

test('toda distância cai em exatamente uma faixa', () => {
  const distancias = [0, 0.4, 2, 5.5, 12, 26.9, 37]
  const faixas = faixasDeDistancia(Math.max(...distancias), ANEIS_DO_RADAR)

  for (const d of distancias) {
    const quantas = faixas.filter(
      (f, i) => (d > f.deKm || i === 0) && d <= f.ateKm,
    ).length
    assert.equal(quantas, 1, `a distância ${d} caiu em ${quantas} faixas`)
  }
})

/**
 * **O que se clica tem de ser o que se vê.** A faixa `i` é desenhada até o anel
 * `i`; se as duas listas tiverem tamanhos diferentes, a tela oferece um alvo
 * onde não há anel, ou deixa um anel sem alvo — e o número que abre é de outra
 * faixa, que é o pior dos dois.
 */
test('há uma faixa por anel, e ela termina onde o anel é desenhado', () => {
  for (const distancias of [[2, 9, 37], [1, 3, 8], [4, 60], [12]]) {
    const maior = Math.max(...distancias)
    const { aneis } = montarRadar(distancias, { raio: 100, aneis: ANEIS_DO_RADAR })
    const faixas = faixasDeDistancia(maior, ANEIS_DO_RADAR)

    assert.equal(
      faixas.length,
      aneis.length,
      `faixas e anéis discordam com ${distancias.join(', ')}`,
    )
    faixas.forEach((faixa, i) => {
      const esperado =
        i === faixas.length - 1
          ? Math.max(aneis[i].distanciaKm, maior)
          : aneis[i].distanciaKm
      assert.equal(faixa.ateKm, esperado)
    })
  }
})

test('sem ninguém não há faixa a clicar', () => {
  assert.deepEqual(faixasDeDistancia(0, ANEIS_DO_RADAR), [])
})

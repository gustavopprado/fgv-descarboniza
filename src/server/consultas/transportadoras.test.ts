/**
 * O agregado da distribuição rodoviária, na camada de consulta — §9.4, §9.5.
 *
 * Três coisas decidem o que esta tela mostra, e as três são o tipo de regra que
 * não estoura quando quebra:
 *
 *  - **as três filiais aparecem sempre**, mesmo sem entrega no período. Filial
 *    que some do mapa num ano fraco é lida como filial fechada, e zero é zero
 *    medido, não ausência (§10.10).
 *  - **não há supressão** (§3.1.3, pelo raciocínio do marítimo): entrega não tem
 *    pessoa, e um limite por contagem esconderia filial pequena sem proteger
 *    ninguém.
 *  - **nada que aponte para um cliente sai daqui**: o agregado é por filial
 *    (§9.4), e o código do cliente nem é lido.
 *
 * **Toda a massa é fictícia, inventada do zero** (§2.2): nenhum código, data,
 * peso ou distância sai de base real.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Firestore } from 'firebase-admin/firestore'

import type { DocEntregaRodoviaria, Papel } from '../documentos/tipos'
import { AcessoNegadoError, type ContextoDeAcesso } from './acesso'
import { consultarTransportadoras } from './inventario'

const ANO = 2031

function ctx(papel: Papel = 'admin'): ContextoDeAcesso {
  return {
    uid: 'uid-ficticio',
    email: 'pessoa.ficticia@exemplo.invalid',
    papel,
    empresa: null,
    funcionarioId: null,
  }
}

function entrega(parcial: Partial<DocEntregaRodoviaria> = {}): DocEntregaRodoviaria {
  const data = parcial.data ?? `${ANO}-03-10`
  return {
    modulo: 'transportadoras',
    modal: 'rodoviario',
    escopo: 3,
    periodicidade: 'evento',
    ano: Number(data.slice(0, 4)),
    mes: data.slice(0, 7),
    empresa: null,
    fator: {
      categoria: 'frete_rodoviario_tkm',
      chave: 'geral',
      versao: 'ficticia-1',
      valor: 0.1,
      unidade: 'kg CO2e por tonelada-quilometro',
      vigenciaInicio: '2031-01-01',
    },
    alertas: [],
    alertasCodigos: [],
    atualizadoEm: '2031-04-01',
    filial: '01',
    data,
    ordem: 1,
    clienteCodigo: '11111 01',
    distanciaKm: 100,
    pesoKg: 1000,
    co2Kg: 10,
    regimeFrete: 'indefinido',
    nivelDado: 'calculado_tkm',
    ...parcial,
  }
}

/**
 * Banco falso que **respeita o `where`**.
 *
 * Sem isso, o recorte por ano e a ausência de recorte devolvem a mesma coisa e o
 * teste do filtro passa nos dois casos — que é o pior resultado possível para
 * uma guarda (lição de 19/09, na Visão geral).
 */
function bancoCom(entregas: DocEntregaRodoviaria[]): {
  db: Firestore
  colecoesLidas: string[]
} {
  const colecoesLidas: string[] = []
  const colecao = (nome: string) => {
    const filtros: { campo: string; valor: unknown }[] = []
    const consulta = {
      where: (campo: string, _op: string, valor: unknown) => {
        filtros.push({ campo, valor })
        return consulta
      },
      select: () => consulta,
      get: async () => {
        colecoesLidas.push(nome)
        const docs = nome === 'entregaRodoviaria' ? entregas : []
        const filtrados = docs.filter((d) =>
          filtros.every((f) => (d as unknown as Record<string, unknown>)[f.campo] === f.valor),
        )
        return { docs: filtrados.map((d) => ({ data: () => d })) }
      },
    }
    return consulta
  }
  return { db: { collection: colecao } as unknown as Firestore, colecoesLidas }
}

/* ------------------------------------------------------------- agregação */

test('soma por filial, por mês e no total, com o peso movimentado', async () => {
  const { db } = bancoCom([
    entrega({ filial: '01', co2Kg: 10, pesoKg: 1000, data: `${ANO}-01-05` }),
    entrega({ filial: '01', co2Kg: 25, pesoKg: 2000, data: `${ANO}-02-11` }),
    entrega({ filial: '02', co2Kg: 65, pesoKg: 3000, data: `${ANO}-02-20` }),
  ])

  const dados = await consultarTransportadoras(ctx(), {}, db)

  assert.equal(dados.entregas, 3)
  assert.equal(dados.co2Kg, 100)
  assert.equal(dados.co2Toneladas, 0.1)
  assert.equal(dados.pesoKg, 6000)

  const filial = (codigo: string) => dados.porFilial.find((f) => f.filial === codigo)!
  assert.equal(filial('01').entregas, 2)
  assert.equal(filial('01').co2Kg, 35)
  assert.equal(filial('01').pesoKg, 3000)
  assert.equal(filial('02').co2Kg, 65)

  assert.deepEqual(
    dados.porMes.map((m) => [m.mes, m.co2Kg]),
    [
      [`${ANO}-01`, 10],
      [`${ANO}-02`, 90],
    ],
  )
  // A soma das filiais é o total: nenhum documento pode sumir do agrupamento.
  assert.equal(
    dados.porFilial.reduce((s, f) => s + f.co2Kg, 0),
    dados.co2Kg,
  )
})

/**
 * Filial sem entrega no período **continua no agregado**, porque ela é o mapa
 * (§9.5). A diferença entre zero e ausência é a diferença entre "não despachou"
 * e "não existe".
 */
test('as três filiais aparecem sempre, com o ponto do município', async () => {
  const { db } = bancoCom([entrega({ filial: '01' })])

  const dados = await consultarTransportadoras(ctx(), {}, db)

  assert.deepEqual(
    dados.porFilial.map((f) => f.filial),
    ['01', '02', '03'],
  )
  const vazia = dados.porFilial.find((f) => f.filial === '03')!
  assert.equal(vazia.entregas, 0)
  assert.equal(vazia.co2Kg, 0)

  // O ponto vem do centroide do município, e não de coordenada escrita à mão.
  for (const f of dados.porFilial) {
    assert.equal(typeof f.latitude, 'number', `${f.filial} ficou sem ponto`)
    assert.equal(typeof f.longitude, 'number')
    assert.match(f.cidade ?? '', /\/[A-Z]{2}$/)
    assert.ok(f.rotulo.length > 0)
  }
})

/**
 * Código de filial que esteja no banco sem estar na lista **aparece pelo próprio
 * código**. Se ele sumisse, o total geral deixaria de bater com a contagem de
 * documentos — e um documento que some de agregação é erro que só aparece em
 * auditoria (§10.10).
 */
test('filial fora da lista não some do agregado', async () => {
  const { db } = bancoCom([
    entrega({ filial: '01', co2Kg: 10 }),
    entrega({ filial: '04' as '01', co2Kg: 90 }),
  ])

  const dados = await consultarTransportadoras(ctx(), {}, db)

  assert.equal(dados.entregas, 2)
  assert.equal(dados.co2Kg, 100)
  const estranha = dados.porFilial.find((f) => f.filial === '04')
  assert.notEqual(estranha, undefined, 'a filial desconhecida sumiu do agrupamento')
  assert.equal(estranha?.co2Kg, 90)
  assert.equal(
    dados.porFilial.reduce((s, f) => s + f.entregas, 0),
    dados.entregas,
  )
})

/**
 * **Marítimo e transportadoras não suprimem** (§3.1.3). Uma filial com uma
 * entrega só continua aparecendo pelo nome: não há pessoa a reidentificar, e um
 * limite por contagem mediria número de entregas fingindo medir privacidade.
 */
test('recorte de uma entrega só aparece pelo nome, sem virar "outros"', async () => {
  const { db } = bancoCom([entrega({ filial: '03', co2Kg: 7 })])

  const dados = await consultarTransportadoras(ctx(), {}, db)

  const sozinha = dados.porFilial.find((f) => f.filial === '03')!
  assert.equal(sozinha.entregas, 1)
  assert.equal(sozinha.co2Kg, 7)
  const serializado = JSON.stringify(dados)
  assert.equal(serializado.includes('outros'), false)
  assert.equal(serializado.includes('agrupadoPorSupressao'), false)
})

test('o recorte por ano filtra na consulta, e não depois da leitura', async () => {
  const { db } = bancoCom([
    entrega({ data: `${ANO}-05-02`, co2Kg: 10 }),
    entrega({ data: `${ANO + 1}-05-02`, co2Kg: 90 }),
  ])

  const doAno = await consultarTransportadoras(ctx(), { ano: ANO }, db)
  assert.equal(doAno.entregas, 1)
  assert.equal(doAno.co2Kg, 10)
  assert.equal(doAno.ano, ANO)

  const tudo = await consultarTransportadoras(ctx(), {}, db)
  assert.equal(tudo.entregas, 2)
  assert.deepEqual(tudo.anos, [ANO, ANO + 1])
  assert.equal(tudo.ano, null)
})

/**
 * **O agregado não lê o regime de frete, e a ausência é decisão** (§9.1). A
 * origem mistura CIF e FOB sem separar, então o campo é o mesmo em toda a
 * coleção: ele não recorta nada aqui e agruparia tudo num balde só. Quem
 * declara a mistura é o resumo da tela; quem a confere documento a documento é
 * o `verificar`. O que esta guarda prende é o corolário — **o regime não
 * trafega para o cliente**, como não trafega o código do cliente.
 */
test('o regime de frete não sai no agregado', async () => {
  const { db } = bancoCom([entrega({ co2Kg: 10 }), entrega({ co2Kg: 30, ordem: 2 })])

  const dados = await consultarTransportadoras(ctx(), {}, db)

  assert.equal(JSON.stringify(dados).includes('indefinido'), false)
  assert.equal(JSON.stringify(dados).includes('regime'), false)
})

/* ---------------------------------------------------------- autorização */

test('quem não pode ver o módulo é recusado antes de qualquer leitura', async () => {
  for (const papel of ['importacao', 'colaborador'] as const) {
    const { db, colecoesLidas } = bancoCom([entrega()])
    await assert.rejects(
      () => consultarTransportadoras(ctx(papel), {}, db),
      AcessoNegadoError,
    )
    assert.deepEqual(colecoesLidas, [], `${papel} chegou a ler a coleção`)
  }
})

test('os três perfis do inventário recebem o mesmo agregado', async () => {
  for (const papel of ['admin', 'sustentabilidade', 'gestor'] as const) {
    const { db } = bancoCom([entrega({ co2Kg: 42 })])
    const dados = await consultarTransportadoras(ctx(papel), {}, db)
    assert.equal(dados.co2Kg, 42)
  }
})

/* -------------------------------------------------------------- vazamento */

/**
 * O cliente não é dimensão deste módulo: o agregado é por filial (§9.4), e nome
 * de cliente não aparece em tela nenhuma. O código também não sai — ele existe
 * no documento para a carga ser reproduzível, e morre na camada.
 */
test('nada que aponte para um cliente sai na resposta', async () => {
  const { db } = bancoCom([
    entrega({ clienteCodigo: '98765 43' }),
    entrega({ clienteCodigo: null, ordem: 2 }),
  ])

  const dados = await consultarTransportadoras(ctx(), {}, db)
  const serializado = JSON.stringify(dados)

  assert.equal(serializado.includes('98765'), false)
  assert.equal(serializado.includes('clienteCodigo'), false)
  // E nenhum identificador de pessoa, que esta coleção nem tem.
  assert.equal(serializado.includes('funcionarioId'), false)
  assert.equal(serializado.includes('uid'), false)
})

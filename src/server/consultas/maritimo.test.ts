/**
 * As exclusões do módulo marítimo, na camada de consulta — CLAUDE.md §8.3, §10.4.
 *
 * Três regras decidem o número desta tela, e **as três nascem sem nada para
 * excluir** no estado atual da base: a previsão marca pouquíssimo depois da
 * derivação por grau, e o frete aéreo é uma fração pequena. Guarda que nunca
 * disparou é guarda que ninguém sabe se morde, então cada uma aqui é exercitada
 * contra massa fabricada **e com a regra desligada**, para a aprovação não ser
 * acidente.
 *
 *  - **Previsão fica fora de todos os totais.** O CO₂ já vem lançado, mas a
 *    viagem não aconteceu; somá-lo seria relatar como emitido o que não foi.
 *  - **Frete aéreo fica no total do módulo e fora do que é por contêiner** — o
 *    indicador, os corredores, a tabela de portos e o mapa. Ele não tem
 *    contêiner, e o destino dele não é porto.
 *  - **Marítimo não suprime** (§3.1.3). Embarque não tem pessoa, e um limite
 *    aqui mediria número de embarques fingindo medir privacidade.
 *
 * **Toda a massa é fictícia, inventada do zero** (§2.2): nenhum nome de agente,
 * de porto, de navio ou de empresa, e nenhum número, sai de base real.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Firestore } from 'firebase-admin/firestore'

import type { DocEmbarque, DocPorto, Papel } from '../documentos/tipos'
import type { ContextoDeAcesso } from './acesso'
import { consultarMaritimo } from './inventario'

const ANO = 2031

function ctx(papel: Papel = 'admin', empresa: string | null = null): ContextoDeAcesso {
  return {
    uid: 'uid-ficticio',
    email: 'pessoa.ficticia@exemplo.invalid',
    papel,
    empresa,
    funcionarioId: null,
  }
}

function porto(locode: string, pais: string, lat: number, lon: number): DocPorto {
  return {
    locode,
    nome: `Porto fictício ${locode}`,
    pais,
    subdivisao: null,
    latitude: lat,
    longitude: lon,
    funcao: '1-------',
    ehPorto: true,
    fonte: 'ficticia',
  }
}

const CADASTRO = [
  porto('XAAAA', 'XA', 22.5, 113.5),
  porto('XBBBB', 'XA', 23.4, 116.7),
  porto('BRZZZ', 'BR', -26.9, -48.6),
  porto('BRYYY', 'BR', -25.5, -48.5),
]

function embarque(parcial: Partial<DocEmbarque>): DocEmbarque {
  return {
    modulo: 'maritimo',
    unidade: 'embarque',
    modal: 'maritimo',
    escopo: 3,
    periodicidade: 'evento',
    ano: ANO,
    mes: `${ANO}-03`,
    empresa: null,
    fator: null,
    alertas: [],
    alertasCodigos: [],
    atualizadoEm: '2031-04-01',
    agente: 'XX',
    bloco: 'XX_2031',
    shipmentId: 'ZZ-0001',
    houseRef: null,
    trans: 'SEA',
    mode: 'FCL',
    portoOrigem: 'XAAAA',
    portoDestino: 'BRZZZ',
    portoOrigemNome: 'Porto fictício XAAAA',
    portoDestinoNome: 'Porto fictício BRZZZ',
    navioPartida: null,
    navioTransbordo: null,
    etd: '2031-03-10',
    eta: '2031-04-20',
    atd: '2031-03-11',
    ata: null,
    ataFinal: '2031-04-21',
    pesoKg: 20000,
    volumeM3: 50,
    containers: 1,
    containersFonte: 'coluna',
    co2Kg: 1000,
    nivelDado: 'medido',
    baseDaEstimativa: null,
    status: null,
    previsao: false,
    ...parcial,
  }
}

function bancoCom(embarques: DocEmbarque[], portos: DocPorto[] = CADASTRO): Firestore {
  const dados: Record<string, unknown[]> = { embarque: embarques, porto: portos }
  const colecao = (nome: string) => {
    const consulta = {
      where: () => consulta,
      get: async () => ({ docs: (dados[nome] ?? []).map((d) => ({ data: () => d })) }),
    }
    return consulta
  }
  return { collection: colecao } as unknown as Firestore
}

/* -------------------------------------------------------------- previsão */

test('previsão fica fora de todos os totais, e sai declarada à parte', async () => {
  const dados = await consultarMaritimo(
    ctx(),
    {},
    bancoCom([
      embarque({ shipmentId: 'A', co2Kg: 1000, containers: 1 }),
      embarque({ shipmentId: 'B', co2Kg: 3000, containers: 2 }),
      // O agente já lançou o CO₂, e a viagem não aconteceu.
      embarque({
        shipmentId: 'C',
        co2Kg: 8000,
        containers: 4,
        previsao: true,
        atd: null,
        ata: null,
        ataFinal: null,
      }),
    ]),
  )

  assert.equal(dados.embarques, 2, 'o previsto não conta como embarque do período')
  assert.equal(dados.co2Kg, 4000)
  assert.equal(dados.containers, 3)
  // E a série mensal também: um mês não pode crescer por causa do que não foi.
  assert.equal(dados.porMes.find((m) => m.mes === '2031-03')?.co2Kg, 4000)
  // Ele não some — continua contado, para a tela poder dizer que existe.
  assert.deepEqual(dados.previsoes, { embarques: 1, co2Kg: 8000 })
  // E não entra no corredor nem no mapa, pelo mesmo motivo.
  assert.equal(dados.mapa.corredores[0].embarques, 2)
  assert.equal(dados.mapa.co2KgDesenhado, 4000)
})

test('sem a regra, o previsto entraria — é ela que o segura', async () => {
  // A mesma massa, com a flag desligada: o total sobe exatamente o que a
  // previsão vale. É o que a exclusão evita, e é por isso que ela existe.
  const dados = await consultarMaritimo(
    ctx(),
    {},
    bancoCom([
      embarque({ shipmentId: 'A', co2Kg: 1000, containers: 1 }),
      embarque({ shipmentId: 'B', co2Kg: 3000, containers: 2 }),
      embarque({ shipmentId: 'C', co2Kg: 8000, containers: 4, previsao: false }),
    ]),
  )
  assert.equal(dados.embarques, 3)
  assert.equal(dados.co2Kg, 12000)
  assert.deepEqual(dados.previsoes, { embarques: 0, co2Kg: 0 })
})

/* ----------------------------------------------------------------- aéreo */

test('frete aéreo entra no total do módulo e sai do indicador por contêiner', async () => {
  const dados = await consultarMaritimo(
    ctx(),
    {},
    bancoCom([
      embarque({ shipmentId: 'A', co2Kg: 2000, containers: 2 }),
      // Frete aéreo com "contêiner" na coluna numérica: ali ela conta volumes.
      embarque({
        shipmentId: 'B',
        modal: 'aereo',
        trans: 'AIR',
        mode: 'LSE',
        co2Kg: 6000,
        containers: 1,
        portoDestino: 'BRYYY',
        atd: null,
      }),
    ]),
  )

  // No total do módulo: é Escopo 3 cat. 4, frete upstream, emissão da empresa.
  assert.equal(dados.co2Kg, 8000)
  assert.equal(dados.embarques, 2)
  assert.equal(dados.co2KgAereo, 6000)
  assert.equal(dados.embarquesAereos, 1)

  // Fora do indicador, nas duas pontas da conta: 2000 sobre 2 contêineres.
  assert.equal(dados.co2KgMaritimo, 2000)
  assert.equal(dados.containers, 2)
  assert.equal(dados.co2KgPorContainer, 1000)

  // Fora da tabela de portos: o destino aéreo não é porto de desembarque.
  assert.deepEqual(
    dados.porPorto.map((p) => p.porto),
    ['BRZZZ'],
  )
  // Fora dos corredores e do mapa: aquela linha não é rota de navio.
  assert.equal(dados.corredores.length, 1)
  assert.equal(dados.mapa.corredores.length, 1)
  assert.equal(dados.mapa.co2KgDesenhado, 2000)
})

test('sem a regra, o aéreo estragaria o indicador nos dois sentidos', async () => {
  // Mesma massa, com o embarque aéreo declarado como marítimo: o numerador
  // ganha emissão que não coube em contêiner nenhum e o denominador ganha um
  // contêiner que não existe. O indicador sobe, e continua parecendo plausível.
  const dados = await consultarMaritimo(
    ctx(),
    {},
    bancoCom([
      embarque({ shipmentId: 'A', co2Kg: 2000, containers: 2 }),
      embarque({
        shipmentId: 'B',
        modal: 'maritimo',
        co2Kg: 6000,
        containers: 1,
        portoDestino: 'BRYYY',
      }),
    ]),
  )
  assert.equal(dados.co2KgPorContainer, 8000 / 3)
  assert.equal(dados.porPorto.length, 2)
  assert.equal(dados.mapa.corredores.length, 2)
})

/* ------------------------------------------------------------ supressão */

test('marítimo não suprime: corredor de um embarque aparece pelo próprio nome', async () => {
  // Embarque não tem pessoa (§3.1.3). Um limite passado à função de agrupamento
  // trataria cada documento como uma pessoa distinta e esconderia corredor
  // pouco usado — supressão que mede número de embarques e finge medir
  // privacidade.
  const dados = await consultarMaritimo(
    ctx(),
    {},
    bancoCom([
      embarque({ shipmentId: 'A', portoOrigem: 'XBBBB', portoDestino: 'BRYYY' }),
      ...Array.from({ length: 6 }, (_, i) =>
        embarque({ shipmentId: `L${i}`, co2Kg: 100 }),
      ),
    ]),
  )

  const sozinho = dados.corredores.find((c) => c.origemRotulo.includes('XBBBB'))
  assert.ok(sozinho, 'o corredor de um embarque só precisa aparecer nomeado')
  assert.equal(sozinho.embarques, 1)
  // Nada de balde: não existe "outros" nem recorte agrupado neste módulo.
  assert.equal(dados.corredores.length, 2)
  assert.equal(
    dados.corredores.reduce((t, c) => t + c.co2Kg, 0),
    dados.co2KgMaritimo,
    'a soma dos corredores é a emissão marítima do recorte',
  )
})

/* ---------------------------------------------------------------- mapa */

test('o mapa declara o que não pôde desenhar, e o resto continua somando', async () => {
  const dados = await consultarMaritimo(
    ctx(),
    {},
    bancoCom([
      embarque({ shipmentId: 'A', co2Kg: 1000 }),
      // Código que o cadastro não tem: sem coordenada não há ponto.
      embarque({ shipmentId: 'B', co2Kg: 700, portoOrigem: 'XQQQQ' }),
      // Sem código numa das pontas.
      embarque({ shipmentId: 'C', co2Kg: 300, portoDestino: null }),
    ]),
  )

  assert.equal(dados.co2Kg, 2000, 'o que não se desenha continua no total')
  assert.equal(dados.mapa.semGeografia, 2)
  assert.equal(dados.mapa.co2KgSemGeografia, 1000)
  assert.equal(dados.mapa.co2KgDesenhado, 1000)
  // **A tabela lista o que o mapa não desenha.** Somar menos que o total sem
  // uma palavra é o defeito que a legenda existe para declarar.
  assert.equal(dados.corredores.length, 3)
  assert.equal(
    dados.corredores.reduce((t, c) => t + c.co2Kg, 0),
    dados.co2KgMaritimo,
  )
})

test('o lado doméstico do ponto sai do país do código, não do nome', async () => {
  // Reconhecer país pelo texto do rótulo seria uma lista de nomes escrita dentro
  // do desenho — e nome de porto não entra neste repositório (§2.2).
  const dados = await consultarMaritimo(ctx(), {}, bancoCom([embarque({})]))
  const corredor = dados.mapa.corredores[0]
  assert.equal(corredor.origemDomestico, false)
  assert.equal(corredor.destinoDomestico, true)
  assert.equal(corredor.origemRotulo, 'Porto fictício XAAAA')
})

test('o corredor do mapa carrega período e contagem', async () => {
  const dados = await consultarMaritimo(
    ctx(),
    {},
    bancoCom([
      embarque({ shipmentId: 'A', etd: '2031-03-10', co2Kg: 1000, containers: 1 }),
      embarque({ shipmentId: 'B', etd: '2031-01-05', co2Kg: 500, containers: 2 }),
    ]),
  )
  const corredor = dados.mapa.corredores[0]
  assert.equal(corredor.embarques, 2)
  assert.equal(corredor.containers, 3)
  assert.equal(corredor.primeira, '2031-01-05')
  assert.equal(corredor.ultima, '2031-03-10')
})

/* --------------------------------------------------------------- perfil */

test('o perfil de importação vê o módulo, e a empresa dele recorta a consulta', async () => {
  // §5: "somente módulo marítimo, podendo ser filtrado por empresa". O recorte
  // acontece na consulta, junto do dado — nunca escondendo item de menu.
  const dados = await consultarMaritimo(
    ctx('importacao', 'Empresa Fictícia A'),
    {},
    bancoCom([embarque({ empresa: 'Empresa Fictícia A' })]),
  )
  assert.equal(dados.embarques, 1)
})

/* ------------------------------------------------- resíduo de porto (§8.2) */

/** Os contêineres que a contagem do período tem e nenhum agente detalhou. */
function residuo(parcial: Partial<DocEmbarque> = {}): DocEmbarque {
  return embarque({
    unidade: 'residuo',
    agente: 'SEM_DETALHE',
    bloco: 'RESUMO',
    shipmentId: 'RESIDUO_2031-03_XX',
    portoOrigem: null,
    portoOrigemNome: null,
    etd: null,
    eta: null,
    atd: null,
    ata: null,
    ataFinal: null,
    pesoKg: null,
    volumeM3: null,
    containersFonte: 'resumo',
    nivelDado: 'estimado_porto',
    baseDaEstimativa: 5,
    fator: {
      categoria: 'maritimo_media_porto',
      chave: 'BRZZZ',
      versao: 'carga_2031-06-01',
      valor: 1000,
      unidade: 'kg CO2e/contêiner',
      vigenciaInicio: '2031-06-01',
    },
    ...parcial,
  })
}

test('o resíduo soma em emissão e em contêineres, e não em contagem de embarques', async () => {
  // É a separação inteira: sem ela, a tela declara embarques que não existem —
  // e o número continua plausível, que é o pior resultado possível.
  const dados = await consultarMaritimo(
    ctx(),
    {},
    bancoCom([
      embarque({ shipmentId: 'A', co2Kg: 1000, containers: 1 }),
      residuo({ shipmentId: 'R1', co2Kg: 4000, containers: 4 }),
    ]),
  )

  assert.equal(dados.embarques, 1, 'só a linha de relatório é embarque')
  assert.equal(dados.containers, 5, 'o contêiner do resíduo é contêiner movimentado')
  assert.equal(dados.co2Kg, 5000, 'e a emissão dele é emissão do escopo')
  assert.equal(dados.residuo.containers, 4)
  assert.equal(dados.residuo.co2Kg, 4000)
  assert.equal(dados.co2KgPorContainer, 1000)
})

test('o resíduo não conta como agente com detalhe', async () => {
  // A tela declara quantos agentes o recorte tem detalhe de, e o resíduo é
  // justamente o que nenhum agente detalhou: contá-lo inverteria a frase.
  const dados = await consultarMaritimo(
    ctx(),
    {},
    bancoCom([
      embarque({ shipmentId: 'A', agente: 'Agente Fictício' }),
      residuo({ shipmentId: 'R1', co2Kg: 4000, containers: 4 }),
    ]),
  )
  assert.equal(dados.agentes, 1)
})

test('o resíduo entra na série mensal e na cascata de qualidade', async () => {
  // Fora da série, o gráfico somaria menos que o indicador acima dele — e isso
  // se lê como falha de carga, não como estimativa.
  const dados = await consultarMaritimo(
    ctx(),
    {},
    bancoCom([
      embarque({ shipmentId: 'A', co2Kg: 1000, containers: 1, mes: `${ANO}-03` }),
      residuo({ shipmentId: 'R1', co2Kg: 4000, containers: 4, mes: `${ANO}-07` }),
    ]),
  )

  assert.equal(
    dados.porMes.reduce((s, m) => s + m.co2Kg, 0),
    dados.co2Kg,
    'a soma dos meses reproduz o total do módulo',
  )
  assert.equal(dados.porMes.find((m) => m.mes === `${ANO}-07`)?.co2Kg, 4000)

  const estimado = dados.qualidade.find((q) => q.nivel === 'estimado_porto')
  assert.equal(estimado?.co2Kg, 4000)
  assert.equal(estimado?.proporcao, 0.8)
})

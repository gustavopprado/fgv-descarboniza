/**
 * As guardas do consolidado — CLAUDE.md §10.0.1.
 *
 * **Todas as daqui são silenciosas por natureza, e é isso que as torna caras.**
 * Nenhuma delas quebra alguma coisa quando é violada: o total simplesmente
 * aparece maior ou menor, num número que ninguém tem com o que comparar. Um
 * módulo inteiro somindo da Visão geral não levanta erro, não muda a forma da
 * tela e não aparece em typecheck, teste de outro módulo ou build — aparece só
 * numa auditoria que talvez não aconteça.
 *
 * Por isso cada uma foi conferida **ligando a violação**, e o que segue é o que
 * reprova quando ela é ligada. Guarda que não morde não é guarda.
 *
 * O banco falso daqui **respeita `where`**, ao contrário do usado nos outros
 * arquivos: sem isso, metade destas guardas não teria como existir — elas são
 * exatamente sobre qual recorte cada módulo recebe.
 *
 * **Toda a massa é fictícia, inventada do zero** (§2.2).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Firestore } from 'firebase-admin/firestore'

import { ANO_BASE_INVENTARIO } from '@/lib/env'
import type {
  DocEmbarque,
  DocEntregaRodoviaria,
  DocMobilidade,
  DocViagemRegistrada,
  DocViagemTrecho,
  Papel,
} from '../documentos/tipos'
import type { ContextoDeAcesso } from './acesso'
import { AcessoNegadoError } from './acesso'
import { consultarVisaoGeral, type ModuloDaVisaoGeral } from './visao-geral'

/** O ano-base da pesquisa de mobilidade, que **não** é o ano relatado. */
const ANO_DA_PESQUISA = ANO_BASE_INVENTARIO + 1

const AMBIENTE = {
  MOBILIDADE_SUPRESSAO_MINIMA: '5',
  MOBILIDADE_ANO_BASE: String(ANO_DA_PESQUISA),
}

function ctx(papel: Papel = 'admin'): ContextoDeAcesso {
  return {
    uid: 'uid-ficticio',
    email: 'pessoa.ficticia@exemplo.invalid',
    papel,
    empresa: null,
    funcionarioId: null,
  }
}

/* ------------------------------------------------------------- massa fictícia */

const PESSOA = 'pessoa-ficticia-1'

function resposta(parcial: Partial<DocMobilidade> = {}): DocMobilidade {
  return {
    modulo: 'mobilidade',
    modal: 'terrestre',
    escopo: 3,
    periodicidade: 'mensal',
    ano: ANO_DA_PESQUISA,
    mes: null,
    empresa: null,
    fator: null,
    alertas: [],
    alertasCodigos: [],
    atualizadoEm: `${ANO_DA_PESQUISA}-07-01`,
    funcionarioId: PESSOA,
    anoBase: ANO_DA_PESQUISA,
    transporte: 'carro',
    combustivel: 'gasolina',
    distanciaKm: 10,
    bairro: 'Bairro Fictício A',
    cidade: 'Cidade Fictícia',
    diasUteisMes: 21,
    co2KgMes: 100,
    excecao: false,
    motivoExcecao: null,
    ...parcial,
  }
}

function trecho(parcial: Partial<DocViagemTrecho> = {}): DocViagemTrecho {
  const ano = parcial.ano ?? ANO_BASE_INVENTARIO
  return {
    modulo: 'viagens',
    modal: 'aereo',
    escopo: 3,
    periodicidade: 'evento',
    ano,
    mes: `${ano}-05`,
    empresa: null,
    fator: null,
    alertas: [],
    alertasCodigos: [],
    atualizadoEm: `${ano}-05-01`,
    reservaId: 'reserva-ficticia-1',
    ordem: 1,
    funcionarioId: PESSOA,
    tipo: 'aereo',
    fonte: 'agencia',
    contabilizar: true,
    dataIda: `${ano}-05-10`,
    dataVolta: null,
    origem: 'AAA',
    destino: 'BBB',
    companhia: null,
    voo: null,
    dataVoo: `${ano}-05-10`,
    distanciaKm: 100,
    faixaDistancia: 'curta',
    passageiros: 1,
    co2Kg: 200,
    classeCabine: 'economica',
    multiplicadorClasse: 1,
    propriedadeVeiculo: null,
    combustivel: null,
    ocupantes: null,
    ...parcial,
  }
}

function embarque(parcial: Partial<DocEmbarque> = {}): DocEmbarque {
  const ano = parcial.ano ?? ANO_BASE_INVENTARIO
  return {
    modulo: 'maritimo',
    modal: 'maritimo',
    escopo: 3,
    periodicidade: 'evento',
    ano,
    mes: `${ano}-03`,
    empresa: null,
    fator: null,
    alertas: [],
    alertasCodigos: [],
    atualizadoEm: `${ano}-03-01`,
    agente: 'AGENTE_FICTICIO',
    bloco: 'BLOCO_FICTICIO',
    shipmentId: 'EMB-FICTICIO-1',
    houseRef: null,
    trans: null,
    mode: null,
    portoOrigem: null,
    portoDestino: null,
    portoOrigemNome: null,
    portoDestinoNome: null,
    navioPartida: null,
    navioTransbordo: null,
    etd: `${ano}-03-05`,
    eta: null,
    atd: `${ano}-03-05`,
    ata: null,
    ataFinal: null,
    pesoKg: 1000,
    volumeM3: null,
    containers: 1,
    containersFonte: 'coluna',
    co2Kg: 3000,
    nivelDado: 'medido',
    baseDaEstimativa: null,
    status: null,
    previsao: false,
    ...parcial,
  }
}

function doPrograma(parcial: Partial<DocViagemRegistrada> = {}): DocViagemRegistrada {
  return {
    modal: 'aereo',
    escopo: 3,
    ano: ANO_BASE_INVENTARIO,
    mes: `${ANO_BASE_INVENTARIO}-05`,
    fator: null,
    alertas: [],
    alertasCodigos: [],
    atualizadoEm: `${ANO_BASE_INVENTARIO}-05-01`,
    reservaId: 'registro-ficticio-1',
    ordem: 1,
    criadoPorUid: 'uid-ficticio',
    funcionarioId: null,
    tipo: 'aereo',
    dataIda: `${ANO_BASE_INVENTARIO}-05-11`,
    dataVolta: null,
    origem: 'AAA',
    destino: 'CCC',
    distanciaKm: 50,
    co2Kg: 99_999,
    faixaDistancia: 'curta',
    classeCabine: 'economica',
    multiplicadorClasse: 1,
    propriedadeVeiculo: null,
    combustivel: null,
    ocupantes: null,
    ...parcial,
  }
}

function entrega(parcial: Partial<DocEntregaRodoviaria> = {}): DocEntregaRodoviaria {
  return {
    modulo: 'transportadoras',
    modal: 'rodoviario',
    escopo: 3,
    periodicidade: 'evento',
    ano: ANO_BASE_INVENTARIO,
    mes: `${ANO_BASE_INVENTARIO}-04`,
    empresa: null,
    fator: {
      categoria: 'frete_rodoviario_tkm',
      chave: 'geral',
      versao: 'ficticia-1',
      valor: 0.1,
      unidade: 'kg CO2e por tonelada-quilometro',
      vigenciaInicio: `${ANO_BASE_INVENTARIO}-01-01`,
    },
    alertas: [],
    alertasCodigos: [],
    atualizadoEm: `${ANO_BASE_INVENTARIO}-05-01`,
    filial: '01',
    data: `${ANO_BASE_INVENTARIO}-04-10`,
    ordem: 1,
    clienteCodigo: '11111 01',
    distanciaKm: 100,
    pesoKg: 5000,
    co2Kg: 50,
    regimeFrete: 'indefinido',
    nivelDado: 'calculado_tkm',
    ...parcial,
  }
}

/* --------------------------------------------------------- banco falso */

/**
 * Banco falso que **aplica os `where` de igualdade**.
 *
 * É a diferença que dá mordida às guardas de recorte: com um banco que ignora o
 * filtro, "mobilidade pelo ano-base" e "mobilidade pelo ano civil" devolvem a
 * mesma coisa, e o teste passaria nos dois casos — que é o pior resultado
 * possível para uma guarda.
 */
function bancoCom(dados: Record<string, unknown[]>): Firestore {
  const montar = (nome: string, filtros: [string, unknown][]) => {
    const consulta = {
      where: (campo: string, _operador: string, valor: unknown) =>
        montar(nome, [...filtros, [campo, valor]]),
      // A consulta de transportadoras projeta os campos que usa — a coleção dela
      // é uma ordem de grandeza maior que as outras. O banco falso devolve o
      // documento inteiro, que é um superconjunto: o que se testa aqui é o
      // recorte, não a projeção.
      select: () => consulta,
      get: async () => {
        const linhas = (dados[nome] ?? []).filter((linha) =>
          filtros.every(
            ([campo, valor]) => (linha as Record<string, unknown>)[campo] === valor,
          ),
        )
        return {
          size: linhas.length,
          docs: linhas.map((d, i) => ({ id: `doc-ficticio-${i}`, data: () => d })),
        }
      },
    }
    return consulta
  }
  return { collection: (nome: string) => montar(nome, []) } as unknown as Firestore
}

async function comAmbiente<T>(
  valores: Record<string, string | undefined>,
  tarefa: () => Promise<T>,
): Promise<T> {
  const anterior = { ...process.env }
  for (const [chave, valor] of Object.entries(valores)) {
    if (valor === undefined) delete process.env[chave]
    else process.env[chave] = valor
  }
  try {
    return await tarefa()
  } finally {
    process.env = anterior
  }
}

/** O banco de referência: um módulo com dado, os três anos do marítimo. */
function bancoCompleto() {
  return bancoCom({
    mobilidade: [resposta(), resposta({ funcionarioId: 'pessoa-ficticia-2' })],
    viagemTrecho: [
      trecho(),
      // Ano vizinho: pertence a outro relatório e não entra (§7.0).
      trecho({ ano: ANO_BASE_INVENTARIO + 1, reservaId: 'reserva-ficticia-2' }),
    ],
    embarque: [
      embarque(),
      embarque({ ano: ANO_BASE_INVENTARIO - 1, shipmentId: 'EMB-FICTICIO-2' }),
      embarque({ ano: ANO_BASE_INVENTARIO + 1, shipmentId: 'EMB-FICTICIO-3' }),
    ],
    entregaRodoviaria: [
      entrega(),
      // Ano vizinho: não move o indicador desta tela.
      entrega({
        ano: ANO_BASE_INVENTARIO + 1,
        mes: `${ANO_BASE_INVENTARIO + 1}-04`,
        data: `${ANO_BASE_INVENTARIO + 1}-04-10`,
        co2Kg: 900,
      }),
    ],
    aeroporto: [],
    porto: [],
  })
}

function doModulo(
  dados: { porModulo: ModuloDaVisaoGeral[] },
  qual: string,
): ModuloDaVisaoGeral {
  const achado = dados.porModulo.find((m) => m.modulo === qual)
  assert.notEqual(achado, undefined, `o módulo ${qual} sumiu da resposta`)
  return achado!
}

/* ------------------------------- (a) mobilidade pelo ano-base da pesquisa */

test('a mobilidade entra pelo ano-base da pesquisa, não pelo ano civil', async () => {
  const dados = await comAmbiente(AMBIENTE, () =>
    consultarVisaoGeral(ctx(), bancoCompleto()),
  )

  const mobilidade = doModulo(dados, 'mobilidade')
  // Duas respostas de 100 kg/mês × 12 meses = 2,4 t no ano.
  assert.equal(mobilidade.toneladas, 2.4)
  assert.equal(dados.mobilidade.anoBase, ANO_DA_PESQUISA)
  assert.notEqual(
    ANO_DA_PESQUISA,
    dados.ano,
    'o teste só prova alguma coisa se os dois anos forem diferentes',
  )
  assert.notEqual(
    mobilidade.toneladas,
    0,
    'filtrada por ano civil, a coleção volta vazia e o painel perde um módulo ' +
      'inteiro sem erro nenhum — o total só aparece menor (§10.0)',
  )
})

/* ------------------------------------- zero e ausência não são a mesma coisa */

test('sem ano-base de pesquisa a mobilidade é ausente, e não zero', async () => {
  const dados = await comAmbiente({ ...AMBIENTE, MOBILIDADE_ANO_BASE: undefined }, () =>
    consultarVisaoGeral(ctx(), bancoCompleto()),
  )

  const mobilidade = doModulo(dados, 'mobilidade')
  assert.equal(
    mobilidade.recorte,
    null,
    'sem recorte definido o módulo não relata nada; um zero aqui passaria por ' +
      'medição de emissão que não houve (§9.10)',
  )
  assert.equal(dados.mobilidade.anoBase, null)
  assert.equal(mobilidade.documentos, 0)
})

test('módulo com recorte e sem documento relata zero, e diz que é zero', async () => {
  const banco = bancoCom({
    mobilidade: [resposta()],
    viagemTrecho: [],
    embarque: [embarque()],
    aeroporto: [],
    porto: [],
  })
  const dados = await comAmbiente(AMBIENTE, () => consultarVisaoGeral(ctx(), banco))

  const viagens = doModulo(dados, 'viagens')
  assert.equal(viagens.toneladas, 0)
  assert.equal(viagens.documentos, 0)
  assert.notEqual(viagens.recorte, null, 'coleção vazia é zero medido, não ausência')
})

/* --------------------------- (b) marítimo recortado no ano-base do inventário */

test('embarque fora do ano-base não move o indicador', async () => {
  const dados = await comAmbiente(AMBIENTE, () =>
    consultarVisaoGeral(ctx(), bancoCompleto()),
  )

  const maritimo = doModulo(dados, 'maritimo')
  assert.equal(
    maritimo.toneladas,
    3,
    'a série do módulo é contínua e atravessa três anos civis (§8.4); sem o ' +
      'recorte, o consolidado de um ano passa a somar os outros dois',
  )
  assert.equal(dados.maritimo.embarques, 1)
})

test('trecho de viagem de outro ano não move o indicador', async () => {
  const dados = await comAmbiente(AMBIENTE, () =>
    consultarVisaoGeral(ctx(), bancoCompleto()),
  )
  assert.equal(doModulo(dados, 'viagens').toneladas, 0.2)
  assert.equal(dados.viagens.trechos, 1)
})

/* ----------------------------------------------- (c) previsão fora do total */

test('previsão fica fora do total e continua contada à parte', async () => {
  const banco = bancoCom({
    mobilidade: [],
    viagemTrecho: [],
    embarque: [
      embarque(),
      embarque({ shipmentId: 'EMB-FICTICIO-PREV', previsao: true, co2Kg: 50_000 }),
    ],
    aeroporto: [],
    porto: [],
  })
  const dados = await comAmbiente(AMBIENTE, () => consultarVisaoGeral(ctx(), banco))

  assert.equal(
    doModulo(dados, 'maritimo').toneladas,
    3,
    'o CO₂ da previsão já vem lançado pelo agente, mas a viagem não aconteceu: ' +
      'somá-lo relataria como emitido o que ainda não foi (§8.3)',
  )
  assert.equal(dados.maritimo.previsoes.embarques, 1)
  assert.equal(dados.maritimo.previsoes.co2Kg, 50_000)
  assert.equal(
    dados.porMes.reduce((s, m) => s + m.maritimo, 0),
    3000,
    'previsão fora do total também está fora da série — senão a soma dos doze ' +
      'meses deixa de reproduzir o indicador',
  )
})

/* -------------------------------------------- (d) aéreo dentro do total */

test('o frete aéreo de fornecedor está dentro do total: ele só não tem contêiner', async () => {
  const banco = bancoCom({
    mobilidade: [],
    viagemTrecho: [],
    embarque: [
      embarque(),
      embarque({
        shipmentId: 'EMB-FICTICIO-AEREO',
        modal: 'aereo',
        containers: null,
        co2Kg: 1000,
      }),
    ],
    aeroporto: [],
    porto: [],
  })
  const dados = await comAmbiente(AMBIENTE, () => consultarVisaoGeral(ctx(), banco))

  assert.equal(
    doModulo(dados, 'maritimo').toneladas,
    4,
    'frete aéreo upstream é Escopo 3 categoria 4 e é emissão da empresa: tirá-lo ' +
      'do consolidado esconderia emissão verdadeira (§10.0.1)',
  )
})

/* ------------------------- (e) e (f) a série e a faixa reproduzem o indicador */

test('a série tem doze meses e soma o indicador principal', async () => {
  const dados = await comAmbiente(AMBIENTE, () =>
    consultarVisaoGeral(ctx(), bancoCompleto()),
  )

  assert.equal(dados.porMes.length, 12, 'o ano é a unidade desta tela, e tem doze meses')
  assert.deepEqual(
    dados.porMes.map((m) => m.mes),
    Array.from(
      { length: 12 },
      (_, i) => `${ANO_BASE_INVENTARIO}-${String(i + 1).padStart(2, '0')}`,
    ),
  )

  const somado = dados.porMes.reduce((s, m) => s + m.total, 0) / 1000
  assert.ok(
    Math.abs(somado - dados.totalToneladas) < 1e-9,
    `os doze meses somam ${somado} t e o indicador é ${dados.totalToneladas} t`,
  )
})

test('a mobilidade é banda constante nos doze meses', async () => {
  const dados = await comAmbiente(AMBIENTE, () =>
    consultarVisaoGeral(ctx(), bancoCompleto()),
  )
  const bandas = new Set(dados.porMes.map((m) => m.mobilidade))
  assert.equal(bandas.size, 1, 'a pesquisa é anual: o mesmo valor vale nos doze meses (§9.5)')
  assert.equal([...bandas][0], 200)
})

test('as quatro fatias somam o indicador, e as proporções fecham em cem por cento', async () => {
  const dados = await comAmbiente(AMBIENTE, () =>
    consultarVisaoGeral(ctx(), bancoCompleto()),
  )

  const somado = dados.porModulo.reduce((s, m) => s + m.toneladas, 0)
  assert.ok(Math.abs(somado - dados.totalToneladas) < 1e-9)
  const proporcoes = dados.porModulo.reduce((s, m) => s + m.proporcao, 0)
  assert.ok(Math.abs(proporcoes - 1) < 1e-9)
  assert.equal(dados.porModulo.length, 4)
})

/**
 * **Transportadoras entra recortada no ano civil, como viagens e marítimo.**
 *
 * A entrega é evento datado, e a coleção guarda mais de um ano: sem o recorte,
 * o indicador do consolidado cresceria com dado de outro período — e o número
 * continuaria parecendo plausível, que é a assinatura dos defeitos desta tela.
 */
test('entrega de outro ano não move o indicador', async () => {
  const dados = await comAmbiente(AMBIENTE, () =>
    consultarVisaoGeral(ctx(), bancoCompleto()),
  )

  const modulo = doModulo(dados, 'transportadoras')
  assert.equal(modulo.documentos, 1, 'a entrega do ano vizinho entrou no consolidado')
  assert.equal(modulo.recorte, `ano civil ${ANO_BASE_INVENTARIO}`)
  assert.equal(modulo.toneladas, 0.05)
})

/**
 * A ressalva de escopo provisório sai do **dado**, não de uma constante na tela
 * (§9.1): o dia em que o levantamento de CIF/FOB fechar, ela some sozinha.
 */
test('o regime de frete provisório é declarado a partir do documento', async () => {
  const provisorio = await comAmbiente(AMBIENTE, () =>
    consultarVisaoGeral(ctx(), bancoCompleto()),
  )
  assert.equal(provisorio.transportadoras.regimeProvisorio, true)
  assert.equal(provisorio.transportadoras.entregas, 1)

  const fechado = await comAmbiente(AMBIENTE, () =>
    consultarVisaoGeral(
      ctx(),
      bancoCom({
        mobilidade: [],
        viagemTrecho: [],
        embarque: [],
        entregaRodoviaria: [entrega({ regimeFrete: 'cif' })],
        aeroporto: [],
        porto: [],
      }),
    ),
  )
  assert.equal(fechado.transportadoras.regimeProvisorio, false)
})

/**
 * A invariante da série **estoura**, e não passa em silêncio.
 *
 * É a violação que não tem outro jeito de aparecer: um documento cujo mês caia
 * fora do ano-base sumiria das doze colunas e continuaria no total, e a tela
 * desenharia um gráfico que soma menos que o número grande em cima dele.
 */
test('mês fora do ano-base derruba a consulta em vez de sumir do gráfico', async () => {
  const banco = bancoCom({
    mobilidade: [],
    viagemTrecho: [],
    embarque: [
      embarque(),
      // `ano` do ano-base, `mes` de outro: o que a §9.9 recusa na escrita.
      embarque({
        shipmentId: 'EMB-FICTICIO-MES',
        mes: `${ANO_BASE_INVENTARIO + 1}-01`,
      }),
    ],
    aeroporto: [],
    porto: [],
  })

  await assert.rejects(
    () => comAmbiente(AMBIENTE, () => consultarVisaoGeral(ctx(), banco)),
    /série mensal não reproduz o indicador/,
  )
})

/* ------------------------------------------- (g) nada de viagemRegistrada */

test('nada do programa de viagens entra no consolidado', async () => {
  const banco = bancoCom({
    mobilidade: [resposta()],
    viagemTrecho: [trecho()],
    embarque: [embarque()],
    viagemRegistrada: [doPrograma(), doPrograma({ ordem: 2, co2Kg: 88_888 })],
    aeroporto: [],
    porto: [],
  })
  const dados = await comAmbiente(AMBIENTE, () => consultarVisaoGeral(ctx(), banco))

  assert.equal(dados.viagens.trechos, 1, 'o inventário conta só o que veio de carga')
  assert.equal(doModulo(dados, 'viagens').toneladas, 0.2)
  assert.equal(
    dados.totalToneladas,
    1.2 + 0.2 + 3,
    'autodeclaração voluntária somada a fonte administrativa produz série cuja ' +
      'variação mede quanta gente preencheu (§0.1)',
  )
})

/* --------------------------------------- (h) nenhum identificador de pessoa */

test('nenhum identificador de pessoa sai na resposta do consolidado', async () => {
  const dados = await comAmbiente(AMBIENTE, () =>
    consultarVisaoGeral(ctx(), bancoCompleto()),
  )

  const serializado = JSON.stringify(dados)
  for (const proibido of [PESSOA, 'pessoa-ficticia-2', 'funcionarioId']) {
    assert.equal(
      serializado.includes(proibido),
      false,
      `"${proibido}" saiu da camada: o identificador é lido para contar e morre ` +
        'aqui (§3.1)',
    )
  }
  assert.equal(
    /bairro|cidade|Bairro Fictício|Cidade Fictícia/i.test(serializado),
    false,
    'a mobilidade não é recortada por bairro nem por modal nesta tela: é um ' +
      'número só (§10.0.1)',
  )
})

/* ------------------------------------------------------------- perfis (§5) */

test('importacao e colaborador não abrem o consolidado', async () => {
  for (const papel of ['importacao', 'colaborador'] as Papel[]) {
    await assert.rejects(
      () => comAmbiente(AMBIENTE, () => consultarVisaoGeral(ctx(papel), bancoCompleto())),
      AcessoNegadoError,
      `o perfil ${papel} enxergaria o inventário inteiro de uma vez`,
    )
  }
})

test('quem vê o inventário inteiro abre o consolidado', async () => {
  for (const papel of ['admin', 'sustentabilidade', 'gestor'] as Papel[]) {
    const dados = await comAmbiente(AMBIENTE, () =>
      consultarVisaoGeral(ctx(papel), bancoCompleto()),
    )
    assert.equal(dados.ano, ANO_BASE_INVENTARIO)
  }
})

/* ------------------------------------------ o ano-base é constante (§10.0) */

test('o ano-base do consolidado não vem do ambiente', async () => {
  const dados = await comAmbiente(
    {
      ...AMBIENTE,
      // Plantado: se alguém trocar a constante por uma leitura de ambiente, é
      // este valor que aparece na tela — e o teste reprova nomeando o ano.
      INVENTARIO_ANO_BASE: String(ANO_BASE_INVENTARIO + 7),
      VIAGENS_ANO_BASE: String(ANO_BASE_INVENTARIO + 7),
    },
    () => consultarVisaoGeral(ctx(), bancoCompleto()),
  )

  assert.equal(
    dados.ano,
    ANO_BASE_INVENTARIO,
    'a escolha que mais move o número não pode mudar por variável esquecida ' +
      'numa máquina (§10.0)',
  )
})

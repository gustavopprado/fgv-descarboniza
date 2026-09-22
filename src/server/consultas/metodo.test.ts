/**
 * Testes da tela de método — CLAUDE.md §10.5.
 *
 * Três garantias, e nenhuma delas é sobre layout:
 *
 *  - **decisão pendente é declarada, não deixada em branco.** Campo vazio parece
 *    bug ou dado perdido; "não definida" é informação;
 *  - **o perfil recorta o método.** `importacao` vê só o marítimo (§5), e a
 *    coleção de mobilidade nem chega a ser lida — não é filtro depois da
 *    leitura;
 *  - **descrição de alerta não chega ao cliente.** Ela cita valor da linha, e
 *    sairia por uma porta lateral da anonimização (§3.1).
 *
 * **Toda a massa aqui é fictícia, inventada do zero** (§2.2).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Firestore } from 'firebase-admin/firestore'

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import type {
  DocEmbarque,
  DocMobilidade,
  DocViagemTrecho,
  Papel,
} from '../documentos/tipos'
import type { ContextoDeAcesso } from './acesso'
import {
  consultarMetodo,
  MOTIVO_DO_ALERTA,
  MOTIVO_NAO_DECLARADO,
  NAO_DEFINIDO,
} from './metodo'

const ANO_BASE = 2031
const DESCRICAO_SENSIVEL = 'resposta 7: distancia de 987,6 km ate a fabrica'

function ctx(papel: Papel): ContextoDeAcesso {
  return {
    uid: 'uid-ficticio',
    email: 'pessoa.ficticia@exemplo.invalid',
    papel,
    empresa: null,
    funcionarioId: null,
  }
}

function resposta(parcial: Partial<DocMobilidade>): DocMobilidade {
  return {
    modulo: 'mobilidade',
    modal: 'terrestre',
    escopo: 3,
    periodicidade: 'mensal',
    ano: ANO_BASE,
    mes: null,
    empresa: null,
    fator: null,
    alertas: [],
    alertasCodigos: [],
    atualizadoEm: '2031-03-01',
    funcionarioId: 'funcionario-ficticio',
    anoBase: ANO_BASE,
    transporte: 'a_pe',
    combustivel: null,
    distanciaKm: 3,
    bairro: 'Bairro Fictício',
    cidade: 'Cidade Fictícia',
    diasUteisMes: 21,
    co2KgMes: 0,
    excecao: false,
    motivoExcecao: null,
    ...parcial,
  }
}

function trecho(parcial: Partial<DocViagemTrecho>): DocViagemTrecho {
  return {
    modulo: 'viagens',
    modal: 'aereo',
    escopo: 3,
    periodicidade: 'evento',
    ano: ANO_BASE,
    mes: `${ANO_BASE}-03`,
    empresa: null,
    fator: null,
    alertas: [],
    alertasCodigos: [],
    atualizadoEm: '2031-03-01',
    reservaId: 'reserva-ficticia',
    ordem: 1,
    funcionarioId: 'funcionario-ficticio',
    tipo: 'aereo',
    fonte: 'agencia',
    contabilizar: true,
    dataIda: '2031-03-10',
    dataVolta: null,
    origem: 'AAA',
    destino: 'BBB',
    companhia: null,
    voo: null,
    dataVoo: '2031-03-10',
    distanciaKm: 100,
    faixaDistancia: 'curta',
    passageiros: 1,
    co2Kg: 0,
    classeCabine: 'economica',
    multiplicadorClasse: 1,
    propriedadeVeiculo: null,
    combustivel: null,
    ocupantes: null,
    ...parcial,
  }
}

/** Embarque fictício, inventado do zero (§2.2) — nenhum nome é real. */
function embarque(parcial: Partial<DocEmbarque>): DocEmbarque {
  return {
    modulo: 'maritimo',
    unidade: 'embarque',
    modal: 'maritimo',
    escopo: 3,
    periodicidade: 'evento',
    ano: ANO_BASE,
    mes: `${ANO_BASE}-03`,
    empresa: null,
    fator: null,
    alertas: [],
    alertasCodigos: [],
    atualizadoEm: '2031-03-01',
    agente: 'agente-ficticio',
    bloco: 'agente-ficticio_2031',
    shipmentId: 'EMB-0001',
    houseRef: null,
    trans: 'SEA',
    mode: null,
    portoOrigem: 'AAAAA',
    portoDestino: 'BBBBB',
    portoOrigemNome: 'Porto Fictício',
    portoDestinoNome: 'Porto Inventado',
    navioPartida: null,
    navioTransbordo: null,
    etd: `${ANO_BASE}-03-01`,
    eta: null,
    atd: `${ANO_BASE}-03-02`,
    ata: null,
    ataFinal: null,
    pesoKg: null,
    volumeM3: null,
    containers: 1,
    containersFonte: 'coluna',
    co2Kg: 100,
    nivelDado: 'medido',
    baseDaEstimativa: null,
    status: null,
    previsao: false,
    ...parcial,
  }
}

/** Firestore de mentira que anota quais coleções chegaram a ser lidas. */
function bancoCom(
  dados: Record<string, unknown[]>,
  lidas: string[] = [],
): Firestore {
  const colecao = (nome: string) => {
    const consulta = {
      where: () => consulta,
      get: async () => {
        lidas.push(nome)
        return { docs: (dados[nome] ?? []).map((d) => ({ data: () => d })) }
      },
    }
    return consulta
  }
  return { collection: colecao } as unknown as Firestore
}

/**
 * Roda a tarefa com o ambiente trocado e **espera ela terminar** antes de
 * restaurar. A versão síncrona disto restaurava o ambiente enquanto a consulta
 * ainda estava no meio dos `await` — e o teste passava por acidente, lendo o
 * ambiente de fora.
 */
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

test('decisão pendente é declarada como tal, não deixada em branco', async () => {
  const metodo = await comAmbiente(
    { MOBILIDADE_SUPRESSAO_MINIMA: '', MOBILIDADE_ANO_BASE: String(ANO_BASE) },
    () => consultarMetodo(ctx('admin'), {}, bancoCom({})),
  )

  const supressao = metodo.parametros.find((p) => p.rotulo.startsWith('Supressão'))
  assert.notEqual(supressao, undefined)
  assert.equal(supressao?.definido, false)
  assert.equal(supressao?.valor, NAO_DEFINIDO)
})

test('parâmetro definido aparece como valor', async () => {
  const metodo = await comAmbiente({ MOBILIDADE_SUPRESSAO_MINIMA: '7' }, () =>
    consultarMetodo(ctx('admin'), {}, bancoCom({})),
  )

  const supressao = metodo.parametros.find((p) => p.rotulo.startsWith('Supressão'))
  assert.equal(supressao?.definido, true)
  assert.equal(supressao?.valor, '7 pessoas')
})

/**
 * **A §0.1 na tela.** O formulário do viajante não é fonte deste módulo: as duas
 * origens são administrativas e não há data de corte a declarar como parâmetro
 * do cálculo. Um parâmetro de corte de volta aqui seria a premissa antiga
 * voltando pela porta da documentação.
 *
 * A fonte declarada **pode** dizer que não há corte — e diz, porque a pergunta
 * é natural para quem lembra da versão anterior. O que ela não pode é prometer
 * uma troca de fonte no tempo, que é a afirmação errada.
 */
test('o método não declara data de corte como parâmetro', async () => {
  const metodo = await consultarMetodo(ctx('admin'), {}, bancoCom({}))

  assert.equal(
    metodo.parametros.find((p) => /corte/i.test(p.rotulo)),
    undefined,
  )

  const viagens = metodo.fontes.find((f) => f.modulo === 'viagens')
  assert.notEqual(viagens, undefined)
  const declarado = `${viagens?.descricao} ${viagens?.situacao}`
  assert.doesNotMatch(declarado, /a partir dela|troca de fonte|passa a ser/i)
  // **Prende o fato, não a redação.** A versão anterior exigia a palavra
  // "administrativas"; com o resumo encurtado em 20/09 ela saiu, e o que sustenta
  // a §0.1 continua lá e é mais forte: as duas fontes aparecem pelo nome, e o
  // programa de viagens aparece declarado como fora daqui.
  assert.match(declarado, /agência/i)
  assert.match(declarado, /cartão/i)
  assert.match(declarado, /programa de viagens não entra/i)
})

test('importacao recebe só o marítimo, e a mobilidade nem é lida', async () => {
  const lidas: string[] = []
  const metodo = await consultarMetodo(
    ctx('importacao'),
    {},
    bancoCom({ mobilidade: [resposta({})], viagemTrecho: [trecho({})] }, lidas),
  )

  assert.deepEqual(metodo.modulos, ['maritimo'])
  assert.deepEqual(
    metodo.fontes.map((f) => f.modulo),
    ['maritimo'],
  )
  assert.equal(
    lidas.includes('mobilidade'),
    false,
    'a coleção de mobilidade foi lida para um perfil que não a vê',
  )
  assert.equal(lidas.includes('viagemTrecho'), false)
  // E nenhum parâmetro de módulo que ele não enxerga.
  assert.equal(
    metodo.parametros.some((p) => p.escopo === 'mobilidade' || p.escopo === 'viagens'),
    false,
  )
})

test('exceções saem como motivo e contagem, sem quem', async () => {
  const metodo = await consultarMetodo(
    ctx('admin'),
    { anoBase: ANO_BASE },
    bancoCom({
      mobilidade: [
        resposta({ excecao: true, motivoExcecao: 'motivo fictício A' }),
        resposta({ excecao: true, motivoExcecao: 'motivo fictício A' }),
        resposta({ excecao: true, motivoExcecao: 'motivo fictício B' }),
        resposta({}),
      ],
    }),
  )

  assert.deepEqual(metodo.excecoes, [
    { modulo: 'mobilidade', motivo: 'motivo fictício A', registros: 2 },
    { modulo: 'mobilidade', motivo: 'motivo fictício B', registros: 1 },
  ])

  const serializado = JSON.stringify(metodo)
  assert.equal(
    serializado.includes('funcionario-ficticio'),
    false,
    'identificador de pessoa vazou para a tela de método',
  )
})

test('alerta sai como tipo, severidade e contagem — nunca a descrição', async () => {
  const metodo = await consultarMetodo(
    ctx('admin'),
    { anoBase: ANO_BASE },
    bancoCom({
      mobilidade: [
        resposta({
          alertas: [
            {
              tipo: 'alerta_ficticio',
              descricao: DESCRICAO_SENSIVEL,
              severidade: 'erro',
            },
          ],
          alertasCodigos: ['alerta_ficticio'],
        }),
        resposta({
          alertas: [
            {
              tipo: 'alerta_ficticio',
              descricao: DESCRICAO_SENSIVEL,
              severidade: 'erro',
            },
          ],
          alertasCodigos: ['alerta_ficticio'],
        }),
      ],
    }),
  )

  assert.deepEqual(metodo.alertas, [
    {
      modulo: 'mobilidade',
      tipo: 'alerta_ficticio',
      severidade: 'erro',
      ocorrencias: 2,
      // Tipo inventado neste teste: ele não tem regra escrita, e a tela diz
      // isso em vez de repetir a descrição gravada.
      motivo: MOTIVO_NAO_DECLARADO,
    },
  ])
  assert.equal(
    JSON.stringify(metodo).includes(DESCRICAO_SENSIVEL),
    false,
    'a descrição do alerta, que cita valor da linha, chegou ao cliente',
  )
})

test('colaborador não abre a tela de método', async () => {
  await assert.rejects(
    () => consultarMetodo(ctx('colaborador'), {}, bancoCom({})),
    /não tem acesso/,
  )
})

/* ------------------------------------------------------- marítimo (§8, §10) */

const PARAMETROS_DO_MARITIMO = {
  MARITIMO_LIMIAR_ATIPICO: '7',
  MARITIMO_LIMIAR_IMPOSSIVEL: '250',
  MARITIMO_AMOSTRA_MINIMA_CORREDOR: '5',
}

function parametro(metodo: { parametros: { rotulo: string }[] }, rotulo: string) {
  const achado = metodo.parametros.find((p) => p.rotulo === rotulo)
  assert.ok(achado, `a tela de método não declara o parâmetro "${rotulo}"`)
  return achado as (typeof metodo.parametros)[number] & {
    valor: string
    definido: boolean
    observacao: string | null
  }
}

/**
 * **A base de data tem uma fonte só, e é a constante.**
 *
 * A tela lia uma variável de ambiente que já tinha sido removida, e por isso
 * declararia "não definida" justamente a escolha que mais muda o número do
 * módulo. Este teste morde pelos dois lados: ele **define** a variável com outro
 * valor e exige que a tela continue declarando a constante. Se alguém
 * reintroduzir a leitura do ambiente, o valor plantado aqui aparece na tela e o
 * teste reprova.
 */
test('a base de data do marítimo sai da constante, e o ambiente não a muda', async () => {
  const metodo = await comAmbiente(
    { ...PARAMETROS_DO_MARITIMO, MARITIMO_BASE_DE_DATA: 'registro_aduaneiro_ficticio' },
    () => consultarMetodo(ctx('importacao'), {}, bancoCom({ embarque: [embarque({})] })),
  )

  const base = parametro(metodo, 'Base de data do embarque')
  assert.equal(base.definido, true)
  assert.match(base.valor, /partida prevista/)
  assert.equal(
    JSON.stringify(metodo).includes('registro_aduaneiro_ficticio'),
    false,
    'a tela leu a base de data do ambiente; ela tem uma fonte só, que é a constante',
  )
})

test('os dois limiares saem declarados, com o valor em vigor e a amostra', async () => {
  const metodo = await comAmbiente(PARAMETROS_DO_MARITIMO, () =>
    consultarMetodo(ctx('importacao'), {}, bancoCom({ embarque: [embarque({})] })),
  )

  const atipica = parametro(metodo, 'Linha atípica — entra com alerta')
  assert.equal(atipica.definido, true)
  assert.match(atipica.valor, /7×/)
  assert.match(atipica.valor, /5 linhas/)

  const impossivel = parametro(metodo, 'Linha impossível — não é importada')
  assert.equal(impossivel.definido, true)
  assert.match(impossivel.valor, /250×/)

  // As duas regras são opostas e não podem ser lidas como uma só: uma mede
  // contra o corredor e deixa entrar, a outra mede contra o módulo e recusa.
  assert.match(atipica.valor, /mediana do corredor/)
  assert.match(impossivel.valor, /mediana geral/)
})

test('limiar sem valor no ambiente é declarado como pendente, não some', async () => {
  const metodo = await comAmbiente(
    {
      MARITIMO_LIMIAR_ATIPICO: '',
      MARITIMO_LIMIAR_IMPOSSIVEL: '',
      MARITIMO_AMOSTRA_MINIMA_CORREDOR: '',
    },
    () => consultarMetodo(ctx('importacao'), {}, bancoCom({ embarque: [] })),
  )

  assert.equal(parametro(metodo, 'Linha atípica — entra com alerta').valor, NAO_DEFINIDO)
  assert.equal(
    parametro(metodo, 'Linha impossível — não é importada').valor,
    NAO_DEFINIDO,
  )
})

/**
 * **A cascata sai degrau a degrau, e a previsão fica fora dela.**
 *
 * "Estimativa" sozinho não diz se a média era do corredor ou geral, e a
 * diferença decide se o número é específico daquela rota. E medir a cascata
 * junto com a previsão diria que tal proporção do número vem do agente para um
 * número que não é o do módulo — a previsão está fora do total.
 */
test('a cascata do marítimo sai por degrau, medida sobre o total sem previsão', async () => {
  const metodo = await comAmbiente(PARAMETROS_DO_MARITIMO, () =>
    consultarMetodo(
      ctx('importacao'),
      {},
      bancoCom({
        embarque: [
          embarque({ shipmentId: 'EMB-1', co2Kg: 750, nivelDado: 'medido' }),
          embarque({ shipmentId: 'EMB-2', co2Kg: 250, nivelDado: 'estimado_corredor' }),
          // Previsão: não entra na cascata nem no denominador dela.
          embarque({ shipmentId: 'EMB-3', co2Kg: 9000, previsao: true }),
        ],
      }),
    ),
  )

  const maritimo = metodo.qualidade.find((q) => q.modulo === 'maritimo')
  assert.ok(maritimo)
  const item = (rotulo: RegExp) => {
    const achado = maritimo.itens.find((i) => rotulo.test(i.rotulo))
    assert.ok(achado, `a cascata não declara o degrau ${rotulo}`)
    return achado.valor
  }

  assert.equal(item(/^Embarques no total/), '2')
  assert.equal(item(/^Medido/), '75,0% · 1')
  assert.equal(item(/média do corredor/), '25,0% · 1')
  // O degrau que não aconteceu aparece zerado, não some: degrau ausente se lê
  // como degrau que não existe.
  assert.equal(item(/média geral/), '0,0% · 0')
  assert.equal(item(/por peso/), '0,0% · 0')
  assert.equal(item(/^Previstos/), '1')
})

test('a fonte do marítimo declara quantos agentes têm detalhe por embarque', async () => {
  const metodo = await comAmbiente(PARAMETROS_DO_MARITIMO, () =>
    consultarMetodo(ctx('importacao'), {}, bancoCom({ embarque: [embarque({})] })),
  )

  const fonte = metodo.fontes.find((f) => f.modulo === 'maritimo')
  assert.ok(fonte)
  // Quantos agentes o inventário tem detalhe de é fato do banco, e sai aqui.
  assert.match(fonte.situacao, /agente/i)
})

/**
 * **Esta guarda substitui uma que prendia o arranjo anterior, e a troca é a
 * decisão inteira.**
 *
 * Até aqui ela exigia a frase "agente sem detalhe por embarque não está no
 * inventário" — verdade enquanto o módulo era o inventário de um agente. Deixou
 * de ser: os contêineres que a contagem do período tem e nenhum relatório
 * detalha passaram a entrar pela cascata da §8.2. Ela reprovou quando o texto
 * mudou, e **reprovar foi o comportamento certo**: o conserto é reapontá-la para
 * o fato que passou a valer, nunca afrouxá-la até parar de morder.
 *
 * O que ela prende agora é o **fato**, não a redação: que a parcela sem detalhe
 * de agente existe e é declarada com número. Quem reescrever a frase continua
 * passando; quem apagar a informação, não.
 */
test('a fonte do marítimo declara os contêineres que nenhum agente detalhou', async () => {
  const metodo = await comAmbiente(PARAMETROS_DO_MARITIMO, () =>
    consultarMetodo(
      ctx('importacao'),
      {},
      bancoCom({
        embarque: [
          embarque({ shipmentId: 'A', containers: 2 }),
          embarque({
            shipmentId: 'RESIDUO',
            unidade: 'residuo',
            containers: 7,
            nivelDado: 'estimado_porto',
            etd: null,
            baseDaEstimativa: 5,
          }),
        ],
      }),
    ),
  )

  const fonte = metodo.fontes.find((f) => f.modulo === 'maritimo')
  assert.ok(fonte)
  assert.match(fonte.situacao, /7/, 'a contagem sem detalhe precisa sair com número')
  assert.match(fonte.situacao, /sem detalhe|estimad/i)
})

/**
 * **Alerta novo nasce explicado, ou reprova.**
 *
 * A tela mostrava o identificador do alerta e uma contagem, o que responde
 * "quantos" e não "o quê" — e alerta que não se entende é alerta que se aprende
 * a ignorar. Esta guarda varre os arquivos que emitem alerta e exige linha para
 * cada código. Conferida ligando a violação: tirar uma entrada do mapa reprova,
 * **nomeando o código e o arquivo**.
 */
test('todo código de alerta das cargas tem motivo declarado na tela de método', () => {
  const raiz = join(import.meta.dirname, '..', '..', '..')
  const arquivos: string[] = []
  const varrer = (dir: string): void => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      if (entrada.name === 'node_modules' || entrada.name.startsWith('.')) continue
      const caminho = join(dir, entrada.name)
      if (entrada.isDirectory()) varrer(caminho)
      else if (entrada.name.endsWith('.ts') && !entrada.name.endsWith('.test.ts')) {
        arquivos.push(caminho)
      }
    }
  }
  varrer(join(raiz, 'src'))
  varrer(join(raiz, 'scripts'))

  const semMotivo: string[] = []
  let encontrados = 0
  for (const arquivo of arquivos) {
    const fonte = readFileSync(arquivo, 'utf8')
    // **Duas redes, e a segunda existe porque a primeira deixou passar.**
    // Varrendo só a constante exportada, quatro códigos que moravam como chave
    // de um `Record` de severidade chegaram à tela sem motivo — a guarda passou
    // e o defeito só apareceu ao rodar a tela contra o banco carregado. A
    // segunda rede pega o código escrito direto na emissão do alerta, e exige o
    // `descricao` ao lado para não confundir com os outros campos chamados
    // `tipo` que o sistema tem — tipo de viagem, por exemplo.
    for (const achado of fonte.matchAll(
      /export const ALERTA_[A-Z_]+ = '([a-z_0-9]+)'|tipo: '([a-z_0-9]+)',\s*descricao/g,
    )) {
      encontrados += 1
      const codigo = achado[1] ?? achado[2]
      if (!(codigo in MOTIVO_DO_ALERTA)) {
        semMotivo.push(`${codigo} (${arquivo.slice(raiz.length + 1)})`)
      }
    }
  }

  assert.ok(encontrados > 20, 'a varredura não encontrou os códigos de alerta')
  assert.deepEqual(
    semMotivo,
    [],
    `código de alerta sem motivo em MOTIVO_DO_ALERTA: ${semMotivo.join(', ')}`,
  )
})

/**
 * **O motivo é a regra, não a linha** (§3.1).
 *
 * A descrição gravada na carga cita valor do registro — a razão contra a
 * mediana, o código do porto, a distância. O que a tela escreve é a condição que
 * dispara o alerta, igual para todas as ocorrências dele.
 */
test('o motivo do alerta descreve a regra, e não repete a descrição gravada', async () => {
  const razaoDaLinha = 'CO₂ por contêiner 8,4× a mediana do corredor'
  const metodo = await comAmbiente(PARAMETROS_DO_MARITIMO, () =>
    consultarMetodo(
      ctx('importacao'),
      {},
      bancoCom({
        embarque: [
          embarque({
            alertas: [
              {
                tipo: 'co2_por_container_atipico',
                descricao: razaoDaLinha,
                severidade: 'atencao',
              },
            ],
            alertasCodigos: ['co2_por_container_atipico'],
          }),
        ],
      }),
    ),
  )

  const alerta = metodo.alertas.find((a) => a.tipo === 'co2_por_container_atipico')
  assert.ok(alerta)
  assert.match(alerta.motivo, /entra no total/)
  assert.notEqual(alerta.motivo, MOTIVO_NAO_DECLARADO)
  assert.equal(
    JSON.stringify(metodo).includes(razaoDaLinha),
    false,
    'a descrição gravada, que cita valor da linha, chegou ao cliente',
  )
})

/* ------------------------------------------- transportadoras (§9.1, §11.5) */

/**
 * **A declaração do regime de frete saiu da tela e continua aqui.**
 *
 * A etiqueta dizia que o regime era indefinido — verdade enquanto o
 * levantamento corria, e falsa depois dele: o frete destas entregas é CIF em
 * parte e FOB em parte. O que a etiqueta cobria **não desapareceu com ela**: a
 * parcela CIF é cat. 4 e a FOB é cat. 9, a origem não separa as duas, e é disso
 * que o relatório final precisa. Declaração se move de lugar, não se apaga
 * (§11.5, §14).
 *
 * A guarda prende o **fato, não a redação**: as duas modalidades e as duas
 * categorias precisam estar ditas em algum lugar do parâmetro. Quem reescrever
 * a frase continua passando; quem apagar a informação, não.
 */
test('o resumo de Transportadoras declara as duas modalidades de frete', async () => {
  const metodo = await consultarMetodo(
    ctx('admin'),
    { modulo: 'transportadoras' },
    bancoCom({}),
  )

  const regime = parametro(metodo, 'Regime de frete')
  const dito = `${regime.valor} ${regime.observacao ?? ''}`

  assert.equal(regime.definido, true)
  assert.match(dito, /CIF/)
  assert.match(dito, /FOB/)
  assert.match(dito, /cat\. 4/)
  assert.match(dito, /cat\. 9/)
})

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

import type { DocMobilidade, DocViagemTrecho, Papel } from '../documentos/tipos'
import type { ContextoDeAcesso } from './acesso'
import { consultarMetodo, NAO_DEFINIDO } from './metodo'

const ANO_BASE = 2031
const DESCRICAO_SENSIVEL = 'resposta 7: distancia de 987,6 km ate a fabrica'

function ctx(papel: Papel): ContextoDeAcesso {
  return {
    uid: 'uid-ficticio',
    email: 'pessoa.ficticia@exemplo.invalid',
    papel,
    empresa: null,
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
    criadoPorUid: null,
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

test('data de corte não definida é declarada, não deixada em branco', async () => {
  const metodo = await comAmbiente(
    { VIAGENS_CORTE_FONTE: '', MOBILIDADE_ANO_BASE: String(ANO_BASE) },
    () => consultarMetodo(ctx('admin'), {}, bancoCom({})),
  )

  const corte = metodo.parametros.find((p) => p.rotulo.startsWith('Data de corte'))
  assert.notEqual(corte, undefined)
  assert.equal(corte?.definido, false)
  assert.equal(corte?.valor, NAO_DEFINIDO)
  assert.match(corte?.observacao ?? '', /ainda não foi tomada/)
})

test('data de corte definida aparece como valor', async () => {
  const metodo = await comAmbiente({ VIAGENS_CORTE_FONTE: '2031-10-01' }, () =>
    consultarMetodo(ctx('admin'), {}, bancoCom({})),
  )

  const corte = metodo.parametros.find((p) => p.rotulo.startsWith('Data de corte'))
  assert.equal(corte?.definido, true)
  assert.equal(corte?.valor, '2031-10-01')
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

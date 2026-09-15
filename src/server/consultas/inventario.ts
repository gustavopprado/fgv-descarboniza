/**
 * Camada única de consulta do inventário — CLAUDE.md §9.10.
 *
 * **Nenhuma tela lê coleção por fora daqui.** É este módulo que garante, para
 * tudo que chega ao cliente:
 *
 *  - nenhum identificador de pessoa no que sai (§3.1) — o `funcionarioId` é
 *    lido, serve para contar pessoas distintas na supressão, e morre aqui;
 *  - supressão de recorte pequeno, agrupado em "outros" (§3.1);
 *  - nulo como categoria visível, com o total sempre batendo com a contagem de
 *    documentos (§9.10);
 *  - autorização conferida antes da leitura, junto do dado (§11.3).
 *
 * A agregação é feita lendo a coleção e reduzindo em JavaScript (§9.1). No
 * volume deste inventário — centenas a poucos milhares de documentos por ano —
 * isso é mais barato e muito mais simples de auditar que contador
 * pré-calculado, que desincroniza em silêncio.
 */
import type { Firestore, Query } from 'firebase-admin/firestore'

import { corteFonteViagensOuNulo, supressaoMinima } from '@/lib/env'
import { coordenadaValida } from '@/lib/mapa'
import type {
  DocAeroporto,
  FonteDaViagem,
  DocEmbarque,
  DocMobilidade,
  DocViagemTrecho,
} from '../documentos/tipos'
import { COLECAO, firestore } from '../firestore'
import {
  agrupar,
  emToneladas,
  media,
  MESES_NO_ANO,
  serieMensal,
  somar,
  type Grupo,
} from './agregacao'
import {
  exigirModulo,
  exigirVisaoGeral,
  limiteDeEmpresa,
  type ContextoDeAcesso,
} from './acesso'

const ROTULO_SEM_EMPRESA = 'Sem empresa'
const ROTULO_SEM_BAIRRO = 'Sem bairro'
const ROTULO_SEM_CIDADE = 'Sem cidade'

type Filtros = { ano?: number }

function aplicarEmpresa(consulta: Query, empresa: string | null): Query {
  return empresa === null ? consulta : consulta.where('empresa', '==', empresa)
}

/* ------------------------------------------------------------- mobilidade */

export type ResumoDeMobilidade = {
  anoBase: number
  respondentes: number
  co2KgMesPorFuncionario: number
  co2KgMes: number
  co2ToneladasAno: number
  distanciaKmMedia: number
  diasUteisMes: number
  porModal: Grupo[]
  porBairro: Grupo[]
  porCidade: Grupo[]
  /** Um ponto por funcionário, só com a distância. Sem nada associado (§3.1). */
  radarDistanciasKm: number[]
  excecoes: { motivo: string; respostas: number }[]
  alertas: { tipo: string; ocorrencias: number }[]
}

export async function consultarMobilidade(
  ctx: ContextoDeAcesso,
  filtros: { anoBase: number },
  db: Firestore = firestore(),
): Promise<ResumoDeMobilidade> {
  exigirModulo(ctx, 'mobilidade')

  const instantaneo = await db
    .collection(COLECAO.mobilidade)
    .where('anoBase', '==', filtros.anoBase)
    .get()
  const todos = instantaneo.docs.map((d) => d.data() as DocMobilidade)

  // Exceção fica fora de média e de total por desenho (§6.2); aparece só na
  // lista de exceções, que a tela de método mostra.
  const registros = todos.filter((r) => !r.excecao)
  const limite = supressaoMinima()
  const pessoa = (r: DocMobilidade) => r.funcionarioId
  const valor = (r: DocMobilidade) => r.co2KgMes

  const co2KgMes = somar(registros, valor)

  const excecoes = new Map<string, number>()
  for (const r of todos) {
    if (!r.excecao) continue
    const motivo = r.motivoExcecao ?? 'não informado'
    excecoes.set(motivo, (excecoes.get(motivo) ?? 0) + 1)
  }

  const alertas = new Map<string, number>()
  for (const r of todos) {
    for (const codigo of r.alertasCodigos) {
      alertas.set(codigo, (alertas.get(codigo) ?? 0) + 1)
    }
  }

  return {
    anoBase: filtros.anoBase,
    respondentes: registros.length,
    co2KgMesPorFuncionario: media(registros, valor),
    co2KgMes,
    // Taxa mensal vira total anual aqui, de forma explícita (§9.3).
    co2ToneladasAno: emToneladas(co2KgMes * MESES_NO_ANO),
    distanciaKmMedia: media(registros, (r) => r.distanciaKm),
    diasUteisMes: registros[0]?.diasUteisMes ?? 0,
    porModal: agrupar(registros, {
      chave: (r) => r.transporte,
      valor,
      pessoa,
      rotuloNulo: 'Sem modal',
      limite,
      rotuloOutros: 'outros modais',
    }),
    porBairro: agrupar(registros, {
      chave: (r) => r.bairro,
      valor,
      pessoa,
      rotuloNulo: ROTULO_SEM_BAIRRO,
      limite,
    }),
    porCidade: agrupar(registros, {
      chave: (r) => r.cidade,
      valor,
      pessoa,
      rotuloNulo: ROTULO_SEM_CIDADE,
      limite,
      rotuloOutros: 'outras cidades',
    }),
    radarDistanciasKm: registros.map((r) => r.distanciaKm).sort((a, b) => a - b),
    excecoes: [...excecoes.entries()]
      .map(([motivo, respostas]) => ({ motivo, respostas }))
      .sort((a, b) => b.respostas - a.respostas),
    alertas: [...alertas.entries()]
      .map(([tipo, ocorrencias]) => ({ tipo, ocorrencias }))
      .sort((a, b) => b.ocorrencias - a.ocorrencias),
  }
}

/* ---------------------------------------------------------------- viagens */

/**
 * Uma rota desenhável no mapa (§10.3).
 *
 * Só chega aqui a rota que **sobreviveu à supressão** (§3.1): um par
 * origem-destino voado por pouca gente identifica essa gente, e desenhá-lo no
 * mapa seria apontar para ela no mapa. O balde de recortes suprimidos não tem
 * lugar no mundo e por isso não tem linha — some do desenho, e a tela diz
 * quantas rotas ficaram de fora.
 */
export type RotaNoMapa = {
  origem: string
  destino: string
  origemLatitude: number
  origemLongitude: number
  destinoLatitude: number
  destinoLongitude: number
  co2Kg: number
  trechos: number
  pessoas: number
}

export type MapaDeRotas = {
  rotas: RotaNoMapa[]
  /** Rotas que existem, mas foram suprimidas por identificarem quem voou. */
  suprimidas: number
  /** Rotas suprimidas não, mas sem coordenada de aeroporto no cadastro. */
  semCoordenada: number
}

export type ResumoDeViagens = {
  ano: number | null
  viagens: number
  trechos: number
  co2Kg: number
  co2ToneladasAno: number
  co2KgPorViagem: number
  porMes: { mes: string; co2Kg: number; documentos: number }[]
  destinos: Grupo[]
  rotas: Grupo[]
  porEmpresa: Grupo[]
  porModal: Grupo[]
  alertas: { tipo: string; ocorrencias: number }[]
  /** Onde a série troca de fonte, para a tela marcar a virada (§7). */
  mesesPorFonte: { mes: string; agencia: number; formulario: number; cartao: number }[]
  /** Rotas aéreas desenháveis, já suprimidas e com coordenada (§10.3). */
  mapa: MapaDeRotas
  /**
   * A data de corte entre agência e formulário, ou `null` enquanto ela não
   * estiver definida (§7).
   *
   * Vem daqui, e não da própria série, porque nos primeiros meses do programa
   * ainda não há submissão nenhuma: sem a data, a tela não teria onde marcar a
   * virada justamente no período em que a marca mais importa.
   */
  corteFonte: string | null
}

export async function consultarViagens(
  ctx: ContextoDeAcesso,
  filtros: Filtros = {},
  db: Firestore = firestore(),
): Promise<ResumoDeViagens> {
  exigirModulo(ctx, 'viagens')

  let consulta: Query = db.collection(COLECAO.viagemTrecho)
  if (filtros.ano !== undefined) consulta = consulta.where('ano', '==', filtros.ano)
  consulta = aplicarEmpresa(consulta, limiteDeEmpresa(ctx))

  const instantaneo = await consulta.get()
  const todos = instantaneo.docs.map((d) => d.data() as DocViagemTrecho)
  // Reserva duplicada no relatório da agência fica gravada, fora do total (§7.2).
  const trechos = todos.filter((t) => t.contabilizar)

  const limite = supressaoMinima()
  const pessoa = (t: DocViagemTrecho) => t.funcionarioId
  const valor = (t: DocViagemTrecho) => t.co2Kg

  const co2Kg = somar(trechos, valor)
  const viagens = new Set(trechos.map((t) => t.reservaId)).size

  const alertas = new Map<string, number>()
  for (const t of todos) {
    for (const codigo of t.alertasCodigos) {
      alertas.set(codigo, (alertas.get(codigo) ?? 0) + 1)
    }
  }

  const mapa = await montarMapaDeRotas(db, trechos, limite, valor, pessoa)

  const porFonte = new Map<string, Record<FonteDaViagem, number>>()
  for (const t of trechos) {
    if (!t.mes) continue
    const atual = porFonte.get(t.mes) ?? { agencia: 0, formulario: 0, cartao: 0 }
    atual[t.fonte] += t.co2Kg
    porFonte.set(t.mes, atual)
  }

  return {
    ano: filtros.ano ?? null,
    viagens,
    trechos: trechos.length,
    co2Kg,
    co2ToneladasAno: emToneladas(co2Kg),
    co2KgPorViagem: viagens === 0 ? 0 : co2Kg / viagens,
    porMes: serieMensal(trechos, (t) => t.mes, valor),
    destinos: agrupar(trechos, {
      chave: (t) => t.destino,
      valor,
      pessoa,
      rotuloNulo: 'Sem destino',
      limite,
      rotuloOutros: 'outros destinos',
    }),
    rotas: agrupar(trechos, {
      chave: (t) => `${t.origem} → ${t.destino}`,
      valor,
      pessoa,
      rotuloNulo: 'Sem rota',
      limite,
      rotuloOutros: 'outras rotas',
    }),
    porEmpresa: agrupar(trechos, {
      chave: (t) => t.empresa,
      valor,
      pessoa,
      rotuloNulo: ROTULO_SEM_EMPRESA,
    }),
    porModal: agrupar(trechos, {
      chave: (t) => t.modal,
      valor,
      pessoa,
      rotuloNulo: 'Sem modal',
    }),
    alertas: [...alertas.entries()]
      .map(([tipo, ocorrencias]) => ({ tipo, ocorrencias }))
      .sort((a, b) => b.ocorrencias - a.ocorrencias),
    mesesPorFonte: [...porFonte.entries()]
      .map(([mes, v]) => ({ mes, ...v }))
      .sort((a, b) => a.mes.localeCompare(b.mes)),
    mapa,
    corteFonte: corteFonteViagensOuNulo(),
  }
}

/**
 * Junta rota agregada com coordenada de aeroporto.
 *
 * Só o trecho aéreo entra: o de carro guarda município em `origem` e `destino`,
 * e a coleção de municípios ainda não existe. Desenhar o aéreo e calar sobre o
 * rodoviário seria mentir por omissão, então a tela declara o recorte.
 *
 * A agregação é a mesma do resto da camada, com o mesmo limite de supressão —
 * o mapa não é uma porta lateral para ver o que a tabela esconde.
 */
async function montarMapaDeRotas(
  db: Firestore,
  trechos: DocViagemTrecho[],
  limite: number,
  valor: (t: DocViagemTrecho) => number,
  pessoa: (t: DocViagemTrecho) => string,
): Promise<MapaDeRotas> {
  const SEPARADOR = ' '
  const aereos = trechos.filter((t) => t.tipo === 'aereo')
  if (aereos.length === 0) {
    return { rotas: [], suprimidas: 0, semCoordenada: 0 }
  }

  const grupos = agrupar(aereos, {
    chave: (t) => `${t.origem}${SEPARADOR}${t.destino}`,
    valor,
    pessoa,
    rotuloNulo: 'Sem rota',
    limite,
  })

  const distintas = new Set(aereos.map((t) => `${t.origem}${SEPARADOR}${t.destino}`)).size
  const sobreviventes = grupos.filter((g) => !g.agrupadoPorSupressao)

  const aeroportos = new Map<string, DocAeroporto>()
  for (const doc of (await db.collection(COLECAO.aeroporto).get()).docs) {
    const aeroporto = doc.data() as DocAeroporto
    aeroportos.set(aeroporto.iata, aeroporto)
  }

  const rotas: RotaNoMapa[] = []
  let semCoordenada = 0

  for (const grupo of sobreviventes) {
    const [origem, destino] = grupo.chave.split(SEPARADOR)
    const a = aeroportos.get(origem)
    const b = aeroportos.get(destino)

    if (
      a === undefined ||
      b === undefined ||
      !coordenadaValida(a.latitude, a.longitude) ||
      !coordenadaValida(b.latitude, b.longitude)
    ) {
      semCoordenada += 1
      continue
    }

    rotas.push({
      origem,
      destino,
      origemLatitude: a.latitude as number,
      origemLongitude: a.longitude as number,
      destinoLatitude: b.latitude as number,
      destinoLongitude: b.longitude as number,
      co2Kg: grupo.co2Kg,
      trechos: grupo.documentos,
      pessoas: grupo.pessoas,
    })
  }

  return {
    rotas: rotas.sort((x, y) => y.co2Kg - x.co2Kg),
    suprimidas: distintas - sobreviventes.length,
    semCoordenada,
  }
}

/* --------------------------------------------------------------- marítimo */

export type ResumoDeMaritimo = {
  ano: number | null
  embarques: number
  containers: number
  co2Kg: number
  co2ToneladasAno: number
  co2KgPorContainer: number
  porMes: { mes: string; co2Kg: number; documentos: number }[]
  corredores: Grupo[]
  porEmpresa: Grupo[]
  porModal: Grupo[]
  /** Quanto do número vem de dado do agente e quanto é estimativa (§8.2). */
  qualidade: { nivel: string; embarques: number; co2Kg: number; proporcao: number }[]
  previsoes: { embarques: number; co2Kg: number }
}

export async function consultarMaritimo(
  ctx: ContextoDeAcesso,
  filtros: Filtros = {},
  db: Firestore = firestore(),
): Promise<ResumoDeMaritimo> {
  exigirModulo(ctx, 'maritimo')

  let consulta: Query = db.collection(COLECAO.embarque)
  if (filtros.ano !== undefined) consulta = consulta.where('ano', '==', filtros.ano)
  consulta = aplicarEmpresa(consulta, limiteDeEmpresa(ctx))

  const instantaneo = await consulta.get()
  const embarques = instantaneo.docs.map((d) => d.data() as DocEmbarque)
  const valor = (e: DocEmbarque) => e.co2Kg

  const co2Kg = somar(embarques, valor)
  const containers = somar(embarques, (e) => e.containers ?? 0)

  const porNivel = new Map<string, { embarques: number; co2Kg: number }>()
  for (const e of embarques) {
    const atual = porNivel.get(e.nivelDado) ?? { embarques: 0, co2Kg: 0 }
    atual.embarques += 1
    atual.co2Kg += e.co2Kg
    porNivel.set(e.nivelDado, atual)
  }

  const previstos = embarques.filter((e) => e.previsao)

  return {
    ano: filtros.ano ?? null,
    embarques: embarques.length,
    containers,
    co2Kg,
    co2ToneladasAno: emToneladas(co2Kg),
    co2KgPorContainer: containers === 0 ? 0 : co2Kg / containers,
    porMes: serieMensal(embarques, (e) => e.mes, valor),
    corredores: agrupar(embarques, {
      chave: (e) =>
        e.portoOrigem && e.portoDestino ? `${e.portoOrigem} → ${e.portoDestino}` : null,
      valor,
      rotuloNulo: 'Sem corredor',
    }),
    porEmpresa: agrupar(embarques, {
      chave: (e) => e.empresa,
      valor,
      rotuloNulo: ROTULO_SEM_EMPRESA,
    }),
    porModal: agrupar(embarques, {
      chave: (e) => e.modal,
      valor,
      rotuloNulo: 'Sem modal',
    }),
    qualidade: [...porNivel.entries()]
      .map(([nivel, v]) => ({
        nivel,
        ...v,
        proporcao: co2Kg === 0 ? 0 : v.co2Kg / co2Kg,
      }))
      .sort((a, b) => b.co2Kg - a.co2Kg),
    previsoes: { embarques: previstos.length, co2Kg: somar(previstos, valor) },
  }
}

/* ------------------------------------------------------------ visão geral */

export type VisaoGeral = {
  ano: number
  totalToneladas: number
  porModulo: { modulo: string; toneladas: number; proporcao: number }[]
  porMes: { mes: string; co2Kg: number }[]
  /** Mobilidade não entra na série mensal: é taxa, não evento. Ver §9.3. */
  observacaoDaSerie: string
}

export async function consultarVisaoGeral(
  ctx: ContextoDeAcesso,
  filtros: { ano: number },
  db: Firestore = firestore(),
): Promise<VisaoGeral> {
  // A visão geral é mais estreita que o inventário: quem vê um módulo só não
  // vê o consolidado, porque o consolidado dele não seria o consolidado (§5).
  exigirVisaoGeral(ctx)

  const [mobilidade, viagens, maritimo] = await Promise.all([
    consultarMobilidade(ctx, { anoBase: filtros.ano }, db),
    consultarViagens(ctx, { ano: filtros.ano }, db),
    consultarMaritimo(ctx, { ano: filtros.ano }, db),
  ])

  const porModulo = [
    { modulo: 'mobilidade', toneladas: mobilidade.co2ToneladasAno },
    { modulo: 'viagens', toneladas: viagens.co2ToneladasAno },
    { modulo: 'maritimo', toneladas: maritimo.co2ToneladasAno },
  ]
  const totalToneladas = porModulo.reduce((s, m) => s + m.toneladas, 0)

  // A série mensal soma só o que é evento. A mobilidade é taxa mensal constante
  // no ano-base e, se entrasse aqui, apareceria como se tivesse acontecido doze
  // vezes num mês qualquer.
  const porMes = new Map<string, number>()
  for (const { mes, co2Kg } of [...viagens.porMes, ...maritimo.porMes]) {
    porMes.set(mes, (porMes.get(mes) ?? 0) + co2Kg)
  }

  return {
    ano: filtros.ano,
    totalToneladas,
    porModulo: porModulo.map((m) => ({
      ...m,
      proporcao: totalToneladas === 0 ? 0 : m.toneladas / totalToneladas,
    })),
    porMes: [...porMes.entries()]
      .map(([mes, co2Kg]) => ({ mes, co2Kg }))
      .sort((a, b) => a.mes.localeCompare(b.mes)),
    observacaoDaSerie:
      'A série mensal cobre viagens e marítimo. Mobilidade é taxa mensal do ' +
      'ano-base e entra no total anual, não na série.',
  }
}

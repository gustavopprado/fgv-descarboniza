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

import { supressaoMinima } from '@/lib/env'
import { coordenadaValida } from '@/lib/mapa'
import { corredor } from '@/lib/regiao'
import type {
  DocAeroporto,
  DocEmbarque,
  DocMobilidade,
  DocViagemTrecho,
} from '../documentos/tipos'
import { COLECAO, firestore } from '../firestore'
import {
  agrupar,
  emToneladas,
  maioresRecortes,
  media,
  MESES_NO_ANO,
  serieMensal,
  somar,
  type Grupo,
  type RecorteDeViagem,
} from './agregacao'
import {
  exigirModulo,
  exigirVisaoGeral,
  limiteDeEmpresa,
  type ContextoDeAcesso,
} from './acesso'

/**
 * Quantas linhas próprias as tabelas de destino e de rota mostram antes do
 * resto (§3.1.2).
 *
 * **É corte de leitura, não de privacidade.** Sem supressão, o recorte fino
 * passou de poucas linhas para dezenas, e uma tabela de dezenas de linhas ao
 * lado de um gráfico não se lê. O que ficar fora soma numa linha visível, e a
 * tela diz que ela não é supressão.
 */
const MAIORES_NA_TABELA = 10

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
 * Um corredor desenhável no mapa (§10.3).
 *
 * **A unidade do mapa é o corredor entre regiões, não a rota par-a-par.** É
 * escolha de leitura: uma linha por par de aeroportos vira um emaranhado sobre
 * o Sudeste, e o corredor diz o que a tela responde — para onde a empresa voa.
 *
 * **Nenhum corredor é suprimido por contagem de pessoas** (§3.1.2). Rota é fato
 * da operação da empresa, não dado pessoal de quem embarcou; suprimi-la
 * escondia de onde vinha um terço da emissão aérea sem proteger ninguém, já que
 * a emissão continuava no total. O que continua valendo é a primeira regra da
 * §3.1: nada aqui identifica quem voou, e nenhum identificador sai desta camada.
 */
export type CorredorNoMapa = {
  corredor: string
  origemRegiao: string
  destinoRegiao: string
  origemLatitude: number
  origemLongitude: number
  destinoLatitude: number
  destinoLongitude: number
  co2Kg: number
  trechos: number
  pessoas: number
  /** Datas extremas do corredor, em `AAAA-MM-DD`. */
  primeira: string | null
  ultima: string | null
}

/**
 * O que aconteceu numa região — o agregado que a tela abre ao clicar no ponto.
 *
 * **A contagem de pessoas é da região, não a soma dos corredores dela.** Quem
 * voou por dois corredores é uma pessoa, e somar as linhas contaria duas — o
 * mesmo erro que a §9.10 impede na agregação. Por isso este número sai daqui, e
 * não de uma conta feita na tela.
 *
 * Nada aqui diz quem: é quanto, quantos e quando (§3.1.2).
 */
export type RegiaoNoMapa = {
  regiao: string
  trechos: number
  pessoas: number
  co2Kg: number
  primeira: string | null
  ultima: string | null
}

export type MapaDeCorredores = {
  corredores: CorredorNoMapa[]
  /**
   * Trechos descartados por aeroporto sem região ou sem coordenada.
   *
   * É o único motivo que restou para algo não ser desenhado, e por isso continua
   * declarado na tela: aqui **é** dado faltando, ao contrário da supressão que
   * saiu daqui — aquela escondia dado que existia.
   */
  semGeografia: number
  /** Agregado por região, para o ponto do mapa poder ser aberto. */
  regioes: RegiaoNoMapa[]
  /** Emissão aérea que os corredores desenhados somam, para a tela conferir. */
  co2KgDesenhado: number
  /** Emissão aérea total do recorte. Igual à desenhada quando nada ficou fora. */
  co2KgAereo: number
}

export type ResumoDeViagens = {
  ano: number | null
  viagens: number
  trechos: number
  /**
   * Trechos gravados e **fora do total**: itinerário duplicado no relatório da
   * agência (§7.2).
   *
   * Existe para a tela poder dizer isso. `trechos` conta o que entra na conta, e
   * a conferência de cobertura conta os documentos da origem, duplicata
   * inclusive — se ela filtrasse, uma reserva perdida na leitura se esconderia
   * atrás de uma duplicata. As duas contagens estão certas e respondem a
   * perguntas diferentes; sem este campo, a diferença entre elas fica sem
   * explicação na tela.
   */
  trechosForaDoTotal: number
  co2Kg: number
  co2ToneladasAno: number
  co2KgPorViagem: number
  porMes: { mes: string; co2Kg: number; documentos: number }[]
  /** Maiores destinos e rotas, com o resto numa linha. Sem supressão (§3.1.2). */
  destinos: RecorteDeViagem[]
  rotas: RecorteDeViagem[]
  porEmpresa: Grupo[]
  porModal: Grupo[]
  alertas: { tipo: string; ocorrencias: number }[]
  /** Corredores aéreos desenháveis, já suprimidos e com geografia (§10.3). */
  mapa: MapaDeCorredores
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

  // **Sem `supressaoMinima()` aqui, e é de propósito** (§3.1.2). Ela continua
  // valendo na mobilidade, onde o recorte é onde a pessoa mora; rota é fato
  // operacional da empresa. O `funcionarioId` continua sendo lido e continua
  // morrendo nesta camada: ele conta pessoas e nunca sai.
  const pessoa = (t: DocViagemTrecho) => t.funcionarioId
  const valor = (t: DocViagemTrecho) => t.co2Kg
  // O trecho aéreo tem data de voo; o de carro, só a de ida.
  const data = (t: DocViagemTrecho) => t.dataVoo ?? t.dataIda

  const co2Kg = somar(trechos, valor)
  const viagens = new Set(trechos.map((t) => t.reservaId)).size

  const alertas = new Map<string, number>()
  for (const t of todos) {
    for (const codigo of t.alertasCodigos) {
      alertas.set(codigo, (alertas.get(codigo) ?? 0) + 1)
    }
  }

  const mapa = await montarMapaDeCorredores(db, trechos, valor, pessoa, data)

  // **A série não se divide por fonte, e isso é a §0.1.** As duas fontes deste
  // módulo são administrativas, cobrem o mesmo tipo de registro e convivem sem
  // ressalva; o formulário do viajante não é fonte daqui. A contagem de trecho
  // por fonte que existia neste ponto, e a marca de virada que ela alimentava,
  // existiam só para sustentar uma junção que não deve acontecer.
  return {
    ano: filtros.ano ?? null,
    viagens,
    trechos: trechos.length,
    trechosForaDoTotal: todos.length - trechos.length,
    co2Kg,
    co2ToneladasAno: emToneladas(co2Kg),
    co2KgPorViagem: viagens === 0 ? 0 : co2Kg / viagens,
    porMes: serieMensal(trechos, (t) => t.mes, valor),
    destinos: maioresRecortes(trechos, {
      chave: (t) => t.destino,
      valor,
      pessoa,
      data,
      rotuloNulo: 'Sem destino',
      quantos: MAIORES_NA_TABELA,
      rotuloResto: (n) => `demais ${n} destinos`,
    }),
    rotas: maioresRecortes(trechos, {
      chave: (t) => `${t.origem} → ${t.destino}`,
      valor,
      pessoa,
      data,
      rotuloNulo: 'Sem rota',
      quantos: MAIORES_NA_TABELA,
      rotuloResto: (n) => `demais ${n} rotas`,
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
    mapa,
  }
}

/**
 * Agrega os trechos aéreos em corredores entre regiões e os posiciona no mapa.
 *
 * Só o trecho aéreo entra: o de carro guarda município em `origem` e `destino`,
 * e a coleção de municípios ainda não existe. Desenhar o aéreo e calar sobre o
 * rodoviário seria mentir por omissão, então a tela declara o recorte.
 *
 * O ponto de cada região é o **centroide dos aeroportos daquela região que
 * aparecem nos trechos** — não um ponto inventado para a região inteira. Assim a
 * linha sai de onde a empresa de fato voa, e o desenho continua derivado do
 * dado.
 *
 * **Nenhum corredor é suprimido** (§3.1.2). O que sobrou de motivo para algo não
 * ser desenhado é aeroporto sem região ou sem coordenada — dado faltando de
 * verdade —, e isso continua contado para a tela poder dizer em vez de calar.
 */
async function montarMapaDeCorredores(
  db: Firestore,
  trechos: DocViagemTrecho[],
  valor: (t: DocViagemTrecho) => number,
  pessoa: (t: DocViagemTrecho) => string,
  data: (t: DocViagemTrecho) => string | null,
): Promise<MapaDeCorredores> {
  const aereos = trechos.filter((t) => t.tipo === 'aereo')
  const co2KgAereo = somar(aereos, valor)
  if (aereos.length === 0) {
    return {
      corredores: [],
      regioes: [],
      semGeografia: 0,
      co2KgDesenhado: 0,
      co2KgAereo: 0,
    }
  }

  const aeroportos = new Map<string, DocAeroporto>()
  for (const doc of (await db.collection(COLECAO.aeroporto).get()).docs) {
    const aeroporto = doc.data() as DocAeroporto
    aeroportos.set(aeroporto.iata, aeroporto)
  }

  const regiaoDe = (iata: string): string | null => {
    const a = aeroportos.get(iata)
    if (a === undefined || a.regiao === null) return null
    if (!coordenadaValida(a.latitude, a.longitude)) return null
    return a.regiao
  }

  // Centroide por região, sobre os aeroportos que os trechos realmente usam.
  const pontos = new Map<string, { lat: number; lon: number; n: number }>()
  const registrar = (iata: string): void => {
    const regiao = regiaoDe(iata)
    const a = aeroportos.get(iata)
    if (regiao === null || a === undefined) return
    const atual = pontos.get(regiao) ?? { lat: 0, lon: 0, n: 0 }
    atual.lat += a.latitude as number
    atual.lon += a.longitude as number
    atual.n += 1
    pontos.set(regiao, atual)
  }

  const comGeografia: DocViagemTrecho[] = []
  let semGeografia = 0
  for (const t of aereos) {
    if (regiaoDe(t.origem) === null || regiaoDe(t.destino) === null) {
      semGeografia += 1
      continue
    }
    registrar(t.origem)
    registrar(t.destino)
    comGeografia.push(t)
  }

  const SEPARADOR = ' ↔ '
  const grupos = agrupar(comGeografia, {
    chave: (t) => corredor(regiaoDe(t.origem)!, regiaoDe(t.destino)!),
    valor,
    pessoa,
    rotuloNulo: 'Sem corredor',
    // Sem `limite`: rota não é suprimida por contagem de pessoas (§3.1.2).
  })

  // Período por corredor e agregado por região, na mesma passada. A região não
  // reaproveita a soma dos corredores porque pessoa não soma: quem voou por dois
  // corredores é uma pessoa só.
  const periodoDoCorredor = new Map<string, { primeira: string; ultima: string }>()
  const porRegiao = new Map<
    string,
    { trechos: number; pessoas: Set<string>; co2Kg: number; primeira: string | null; ultima: string | null }
  >()

  for (const t of comGeografia) {
    const regioes = [regiaoDe(t.origem)!, regiaoDe(t.destino)!]
    const chave = corredor(regioes[0], regioes[1])
    const d = data(t)

    if (d !== null) {
      const atual = periodoDoCorredor.get(chave)
      if (atual === undefined) {
        periodoDoCorredor.set(chave, { primeira: d, ultima: d })
      } else {
        if (d < atual.primeira) atual.primeira = d
        if (d > atual.ultima) atual.ultima = d
      }
    }

    // Um trecho toca duas regiões e conta uma vez em cada; dentro da mesma
    // região ele conta uma só, senão a região doméstica contaria em dobro.
    for (const regiao of new Set(regioes)) {
      const atual = porRegiao.get(regiao) ?? {
        trechos: 0,
        pessoas: new Set<string>(),
        co2Kg: 0,
        primeira: null,
        ultima: null,
      }
      atual.trechos += 1
      atual.pessoas.add(pessoa(t))
      atual.co2Kg += valor(t)
      if (d !== null) {
        if (atual.primeira === null || d < atual.primeira) atual.primeira = d
        if (atual.ultima === null || d > atual.ultima) atual.ultima = d
      }
      porRegiao.set(regiao, atual)
    }
  }

  const corredores: CorredorNoMapa[] = []
  for (const grupo of grupos) {
    const [origemRegiao, destinoRegiao] = grupo.chave.split(SEPARADOR)
    const a = pontos.get(origemRegiao)
    const b = pontos.get(destinoRegiao)
    if (a === undefined || b === undefined) continue

    corredores.push({
      corredor: grupo.rotulo,
      origemRegiao,
      destinoRegiao,
      origemLatitude: a.lat / a.n,
      origemLongitude: a.lon / a.n,
      destinoLatitude: b.lat / b.n,
      destinoLongitude: b.lon / b.n,
      co2Kg: grupo.co2Kg,
      trechos: grupo.documentos,
      pessoas: grupo.pessoas,
      primeira: periodoDoCorredor.get(grupo.chave)?.primeira ?? null,
      ultima: periodoDoCorredor.get(grupo.chave)?.ultima ?? null,
    })
  }

  return {
    corredores: corredores.sort((x, y) => y.co2Kg - x.co2Kg),
    regioes: [...porRegiao.entries()]
      .map(([regiao, v]) => ({
        regiao,
        trechos: v.trechos,
        pessoas: v.pessoas.size,
        co2Kg: v.co2Kg,
        primeira: v.primeira,
        ultima: v.ultima,
      }))
      .sort((x, y) => y.co2Kg - x.co2Kg),
    semGeografia,
    co2KgDesenhado: somar(corredores, (c) => c.co2Kg),
    co2KgAereo,
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

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
  DocPorto,
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
   * É um dos dois motivos que restaram para algo não ser desenhado — o outro é
   * `co2KgNaoAereo` —, e por isso continua declarado na tela: aqui **é** dado
   * faltando, ao contrário da supressão que saiu daqui, que escondia dado que
   * existia.
   */
  semGeografia: number
  /** Agregado por região, para o ponto do mapa poder ser aberto. */
  regioes: RegiaoNoMapa[]
  /** Emissão aérea que os corredores desenhados somam, para a tela conferir. */
  co2KgDesenhado: number
  /** Emissão aérea total do recorte. Igual à desenhada quando nada ficou fora. */
  co2KgAereo: number
  /**
   * Emissão do recorte que **não é aérea** e por isso não tem lugar neste mapa.
   *
   * O trecho de carro guarda município em `origem` e `destino`, e a lista do
   * IBGE não está no inventário: não há coordenada de onde tirar uma linha.
   * Existe como número porque a tela precisa **declarar** o recorte — hoje ele
   * é zero, já que nenhuma das duas fontes administrativas traz carro, e o
   * primeiro trecho rodoviário que entrar faria o mapa somar menos que o total
   * sem uma palavra. Mapa menor que o número é lido como falha de carga.
   */
  co2KgNaoAereo: number
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
  co2Toneladas: number
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
    co2Toneladas: emToneladas(co2Kg),
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
 * e a lista do IBGE não está no inventário. Desenhar o aéreo e calar sobre o
 * rodoviário seria mentir por omissão, então o que ficou de fora sai daqui em
 * `co2KgNaoAereo` e a tela o declara.
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
  const co2KgNaoAereo = somar(trechos, valor) - co2KgAereo
  if (aereos.length === 0) {
    return {
      corredores: [],
      regioes: [],
      semGeografia: 0,
      co2KgDesenhado: 0,
      co2KgAereo: 0,
      co2KgNaoAereo,
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
    co2KgNaoAereo,
  }
}

/* --------------------------------------------------------------- marítimo */

/**
 * Um porto no mapa do módulo — CLAUDE.md §10.4.
 *
 * O rótulo é o nome da lista oficial, resolvido na consulta a partir do código
 * gravado no embarque. `domestico` vem do **país do código**, que é dado do
 * cadastro, e não de leitura do nome (§10.3): reconhecer país pelo texto seria
 * uma lista de nomes escrita dentro do desenho.
 */
export type CorredorMaritimo = {
  corredor: string
  origemRotulo: string
  destinoRotulo: string
  embarques: number
  containers: number
  co2Kg: number
  primeira: string | null
  ultima: string | null
}

/**
 * O corredor que pode virar linha no mapa: o mesmo, com coordenada nas duas
 * pontas. **A tabela lista todos; o mapa desenha estes** — e a diferença entre
 * as duas contagens é declarada na tela, senão um mapa que soma menos que a
 * tabela é lido como falha de carga.
 */
export type CorredorDesenhavel = CorredorMaritimo & {
  origem: string
  destino: string
  origemLatitude: number
  origemLongitude: number
  origemDomestico: boolean
  destinoLatitude: number
  destinoLongitude: number
  destinoDomestico: boolean
}

export type MapaMaritimo = {
  corredores: CorredorDesenhavel[]
  /** Embarques marítimos sem código de porto ou sem coordenada no cadastro. */
  semGeografia: number
  co2KgSemGeografia: number
  co2KgDesenhado: number
}

export type ResumoDeMaritimo = {
  ano: number | null
  /** Embarques que entram no total: realizados, de qualquer modal. */
  embarques: number
  /** Contêineres do marítimo. O frete aéreo não tem contêiner, e fica fora. */
  containers: number
  co2Kg: number
  co2Toneladas: number
  /**
   * O indicador da §1, **só do marítimo nas duas pontas da conta**.
   *
   * Frete aéreo entra no total do módulo e sai daqui: ele não tem contêiner, e
   * onde a coluna numérica traz um número para carga aérea ela está contando
   * volumes. Deixá-lo dentro somaria emissão sem contêiner sobre um denominador
   * com um contêiner que não existe — os dois erros no mesmo indicador.
   */
  co2KgPorContainer: number
  /** A emissão marítima, que é o numerador do indicador acima. */
  co2KgMaritimo: number
  /** Frete aéreo de fornecedor: Escopo 3 cat. 4, no total e fora do indicador. */
  co2KgAereo: number
  embarquesAereos: number
  porMes: { mes: string; co2Kg: number; documentos: number }[]
  /**
   * Todos os corredores marítimos do recorte, inclusive os que não viram linha.
   *
   * **A soma desta lista é a emissão marítima do recorte**, e é isso que a
   * separa do mapa: embarque sem código de porto ou com código sem coordenada
   * continua sendo um corredor, só não é desenhável.
   */
  corredores: CorredorMaritimo[]
  porEmpresa: Grupo[]
  porModal: Grupo[]
  porPorto: { porto: string; rotulo: string; containers: number; co2Kg: number }[]
  mapa: MapaMaritimo
  /** Quanto do número vem de dado do agente e quanto é estimativa (§8.2). */
  qualidade: { nivel: string; embarques: number; co2Kg: number; proporcao: number }[]
  /**
   * Embarque previsto, **fora de todos os números acima** (§8.3).
   *
   * O CO₂ já vem lançado pelo agente, mas a viagem não aconteceu: somá-lo ao
   * total do período seria relatar como emitido o que ainda não foi. A flag
   * existe para ele não se perder — continua contado e declarado aqui.
   */
  previsoes: { embarques: number; co2Kg: number }
  /**
   * Quantos agentes de carga o recorte tem detalhe de.
   *
   * **É fato do banco, e a tela declara a partir dele.** Quantos agentes ficam
   * de fora é fato do arquivo, e quem responde isso é a conferência de cobertura
   * (§8.4) — dizer aqui quantos faltam seria inventar o embarque que a §8.2 não
   * inventa. O número existe porque o consolidado precisa declarar que o
   * marítimo não cobre toda a importação do período (§10.0).
   */
  agentes: number
  /** Anos com dado no módulo, para o seletor de período. */
  anos: number[]
}

/** O embarque entra nos totais do período? Previsão não entra (§8.3). */
function realizado(e: DocEmbarque): boolean {
  return !e.previsao
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
  const todos = instantaneo.docs.map((d) => d.data() as DocEmbarque)
  const valor = (e: DocEmbarque) => e.co2Kg

  // **Previsão sai antes de qualquer conta.** Ela não é um filtro de tela: o
  // total do módulo é o que aconteceu no período, e o previsto é declarado à
  // parte, com contagem.
  const embarques = todos.filter(realizado)
  const previstos = todos.filter((e) => e.previsao)

  /**
   * **O frete aéreo fica no total e sai do que é por contêiner** — o indicador,
   * a tabela de portos, os corredores e o mapa.
   *
   * Ele é Escopo 3 cat. 4, frete upstream, e é emissão da empresa: tirá-lo do
   * total seria esconder emissão verdadeira. Mas o destino dele é um aeroporto
   * ou um ponto interior, e desenhá-lo num mapa marítimo faria duas afirmações
   * falsas — que existe porto ali, e que aquela linha é rota de navio.
   */
  const maritimos = embarques.filter((e) => e.modal !== 'aereo')
  const aereos = embarques.filter((e) => e.modal === 'aereo')

  const co2Kg = somar(embarques, valor)
  const co2KgMaritimo = somar(maritimos, valor)
  const containers = somar(maritimos, (e) => e.containers ?? 0)

  const porNivel = new Map<string, { embarques: number; co2Kg: number }>()
  for (const e of embarques) {
    const atual = porNivel.get(e.nivelDado) ?? { embarques: 0, co2Kg: 0 }
    atual.embarques += 1
    atual.co2Kg += e.co2Kg
    porNivel.set(e.nivelDado, atual)
  }

  const portos = new Map<string, DocPorto>()
  for (const doc of (await db.collection(COLECAO.porto).get()).docs) {
    const porto = doc.data() as DocPorto
    portos.set(porto.locode, porto)
  }
  const rotuloDoPorto = (locode: string | null): string =>
    locode === null ? 'Sem porto' : (portos.get(locode)?.nome ?? locode)

  const corredores = montarCorredores(maritimos, portos)

  /** Contêineres por porto de desembarque, só marítimo (§10.4). */
  const acumuladoPorPorto = new Map<string, { containers: number; co2Kg: number }>()
  for (const e of maritimos) {
    const chave = e.portoDestino ?? ''
    const atual = acumuladoPorPorto.get(chave) ?? { containers: 0, co2Kg: 0 }
    atual.containers += e.containers ?? 0
    atual.co2Kg += e.co2Kg
    acumuladoPorPorto.set(chave, atual)
  }

  return {
    ano: filtros.ano ?? null,
    embarques: embarques.length,
    containers,
    co2Kg,
    co2Toneladas: emToneladas(co2Kg),
    co2KgMaritimo,
    co2KgPorContainer: containers === 0 ? 0 : co2KgMaritimo / containers,
    co2KgAereo: somar(aereos, valor),
    embarquesAereos: aereos.length,
    porMes: serieMensal(embarques, (e) => e.mes, valor),
    corredores,
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
    porPorto: [...acumuladoPorPorto.entries()]
      .map(([porto, v]) => ({
        porto,
        rotulo: porto === '' ? 'Sem porto' : rotuloDoPorto(porto),
        ...v,
      }))
      .sort((a, b) => b.containers - a.containers || b.co2Kg - a.co2Kg),
    mapa: montarMapaMaritimo(corredores, maritimos, portos),
    qualidade: [...porNivel.entries()]
      .map(([nivel, v]) => ({
        nivel,
        ...v,
        proporcao: co2Kg === 0 ? 0 : v.co2Kg / co2Kg,
      }))
      .sort((a, b) => b.co2Kg - a.co2Kg),
    previsoes: { embarques: previstos.length, co2Kg: somar(previstos, valor) },
    agentes: new Set(embarques.map((e) => e.agente)).size,
    anos: [...new Set(todos.map((e) => e.ano))].sort(),
  }
}

/** Uma chave de corredor que também existe quando falta porto numa ponta. */
function chaveDoCorredor(e: DocEmbarque): string {
  return `${e.portoOrigem ?? ''}-${e.portoDestino ?? ''}`
}

/**
 * Os corredores do recorte, um por par de portos, na ordem do transporte.
 *
 * **Entra todo embarque marítimo, inclusive o que não pode ser desenhado.** A
 * soma da lista é a emissão marítima do recorte: um corredor que some da tabela
 * por falta de coordenada faria a tabela somar menos que o total sem nenhuma
 * palavra, que é o defeito que a legenda do mapa de viagens passou a declarar.
 */
function montarCorredores(
  maritimos: DocEmbarque[],
  portos: Map<string, DocPorto>,
): CorredorMaritimo[] {
  const rotulo = (locode: string | null): string =>
    locode === null ? 'Sem porto' : (portos.get(locode)?.nome ?? locode)

  type Acumulado = CorredorMaritimo
  const bruto = new Map<string, Acumulado>()

  for (const e of maritimos) {
    const chave = chaveDoCorredor(e)
    const atual = bruto.get(chave) ?? {
      corredor: chave,
      origemRotulo: rotulo(e.portoOrigem),
      destinoRotulo: rotulo(e.portoDestino),
      embarques: 0,
      containers: 0,
      co2Kg: 0,
      primeira: e.etd,
      ultima: e.etd,
    }
    atual.embarques += 1
    atual.containers += e.containers ?? 0
    atual.co2Kg += e.co2Kg
    if (e.etd !== null && (atual.primeira === null || e.etd < atual.primeira)) {
      atual.primeira = e.etd
    }
    if (e.etd !== null && (atual.ultima === null || e.etd > atual.ultima)) {
      atual.ultima = e.etd
    }
    bruto.set(chave, atual)
  }

  return [...bruto.values()].sort((a, b) => b.co2Kg - a.co2Kg)
}

/**
 * O mapa do módulo: uma ligação por corredor, ponto a ponto.
 *
 * **Aqui o ponto é um lugar de verdade**, como no programa de viagens e ao
 * contrário do mapa de Viagens, que agrega por região. Lá a agregação existe por
 * legibilidade, com centenas de trechos que cruzam região; aqui o embarque já
 * nasce com o par de portos, são poucas dezenas de corredores, e agregar
 * esconderia de onde a carga veio sem ganhar nada.
 *
 * **Só marítimo.** Ver `consultarMaritimo`: o frete aéreo continua no total e
 * fora do desenho.
 */
function montarMapaMaritimo(
  corredores: CorredorMaritimo[],
  maritimos: DocEmbarque[],
  portos: Map<string, DocPorto>,
): MapaMaritimo {
  /** Os códigos de cada corredor, para resolver a coordenada das duas pontas. */
  const pontas = new Map<string, { origem: string | null; destino: string | null }>()
  for (const e of maritimos) {
    pontas.set(chaveDoCorredor(e), { origem: e.portoOrigem, destino: e.portoDestino })
  }

  const desenhaveis: CorredorDesenhavel[] = []
  let semGeografia = 0
  let co2KgSemGeografia = 0

  for (const c of corredores) {
    const ponta = pontas.get(c.corredor)
    const origem = ponta?.origem == null ? undefined : portos.get(ponta.origem)
    const destino = ponta?.destino == null ? undefined : portos.get(ponta.destino)

    if (
      origem === undefined ||
      destino === undefined ||
      !coordenadaValida(origem.latitude, origem.longitude) ||
      !coordenadaValida(destino.latitude, destino.longitude)
    ) {
      semGeografia += c.embarques
      co2KgSemGeografia += c.co2Kg
      continue
    }

    desenhaveis.push({
      ...c,
      origem: origem.locode,
      destino: destino.locode,
      origemLatitude: origem.latitude as number,
      origemLongitude: origem.longitude as number,
      // **O país do código, não o texto do nome.** É dado do cadastro.
      origemDomestico: origem.pais === PAIS_DA_EMPRESA,
      destinoLatitude: destino.latitude as number,
      destinoLongitude: destino.longitude as number,
      destinoDomestico: destino.pais === PAIS_DA_EMPRESA,
    })
  }

  return {
    corredores: desenhaveis,
    semGeografia,
    co2KgSemGeografia,
    co2KgDesenhado: somar(desenhaveis, (c) => c.co2Kg),
  }
}

/**
 * O país cujos portos são "domésticos" no desenho.
 *
 * É o prefixo do código oficial, que já vem gravado no cadastro — não uma lista
 * de nomes de porto, que a §2.2 mantém fora deste repositório.
 */
const PAIS_DA_EMPRESA = 'BR'

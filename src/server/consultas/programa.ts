/**
 * Consultas do programa de viagens — CLAUDE.md §0.1, §3.2, §5.1 e §10.
 *
 * **Este módulo lê `viagemRegistrada` e nenhuma coleção do inventário.** A
 * recíproca também vale: as cinco telas de inventário não tocam nesta coleção.
 * Não é preferência de organização — somar uma fonte administrativa completa a
 * uma autodeclaração voluntária produz série cuja variação mede quanta gente
 * preencheu, não quanta emissão houve, e uma queda de adesão seria lida como
 * redução de emissão num relatório que alguém assina.
 *
 * Até agora a separação era um `where('fonte', '==', 'formulario')` sobre a
 * coleção do inventário. Bastava uma consulta esquecer o filtro. Com duas
 * coleções não há filtro para esquecer.
 *
 * É a única parte do sistema em que a pessoa aparece pelo nome, e mesmo assim
 * com limite:
 *
 *  - o viajante vê **apenas as próprias submissões**, filtradas pelo uid dele na
 *    consulta — não na interface (§5.1);
 *  - `admin` e `sustentabilidade` veem quem registrou cada viagem, porque
 *    precisam acompanhar adesão e corrigir lançamento errado;
 *  - `gestor` **não vê nome nem aqui**: para ele o programa também é agregado.
 *
 * Nada disto vale para as telas de inventário, onde ninguém vê nome (§3.1).
 */
import { createHash } from 'node:crypto'
import type { Firestore, Query } from 'firebase-admin/firestore'

import {
  aplicarUplift,
  emissaoTrechoAereo,
  faixaPorDistancia,
  type FaixaDistancia,
} from '@/lib/calculo/aereo'
import {
  CATEGORIA_AEREO_CLASSE,
  CATEGORIA_AEREO_FAIXA,
  CATEGORIA_AEREO_UPLIFT,
} from '@/lib/calculo/categorias'
import {
  categoriaDoFator,
  chaveDoFator,
  type Combustivel,
} from '@/lib/calculo/mobilidade'
import { programaFechadoAte, programaQuadro } from '@/lib/env'
import { distanciaOrtodromicaKm } from '@/lib/geo/distancia'
import {
  coordenadaValida,
  type LigacaoDoMapa,
  type PontoDoMapa,
} from '@/lib/mapa'
import { municipioPorCodigo } from '@/lib/municipios'
import { corredor, ehDoBrasil } from '@/lib/regiao'
import { chaveNormalizada } from '@/lib/texto'
import { idViagemRegistrada } from '../documentos/ids'
import {
  anoDe,
  hojeIso,
  mesDe,
  montarAlertas,
  type DataIso,
  type DocAeroporto,
  type DocFuncionario,
  type DocViagemRegistrada,
  type Escopo,
  type FatorAplicado,
  type PropriedadeVeiculo,
  type TipoDeViagem,
} from '../documentos/tipos'
import { ehDataIso, validarViagemRegistrada } from '../documentos/validacao'
import { recarregarEscopo } from '../escrita'
import { carregarFatores, limitesDeFaixa, type ResolvedorDeFatores } from '../fatores'
import { COLECAO, firestore } from '../firestore'
import { trajetoRodoviario } from '../rotas'
import { emToneladas, serieMensal, somar } from './agregacao'
import {
  exigirProgramaDeViagens,
  podeVerQuemRegistrou,
  type ContextoDeAcesso,
} from './acesso'

export type ViagemRegistrada = {
  reservaId: string
  tipo: 'aereo' | 'carro'
  dataIda: string
  dataVolta: string | null
  rota: string
  /** O que se atribui a quem registrou — já dividido pelos ocupantes (§7.5). */
  co2Kg: number
  /** O que o veículo emitiu, antes da divisão. Igual ao de cima no aéreo. */
  co2KgVeiculo: number
  ocupantes: number | null
  trechos: number
  distanciaKm: number
  /** Nulo quando quem consulta não pode ver quem registrou (§3.2). */
  registradoPor: string | null
  /** O período desta viagem ainda está aberto para edição? (§7.5) */
  editavel: boolean
  /**
   * Os pontos do trajeto, na ordem e **como identificador**: código IATA no
   * aéreo, código IBGE no carro.
   *
   * É o que permite reabrir a viagem no formulário sem pedir para digitar tudo
   * de novo. `rota` é a mesma coisa em texto, já resolvida para leitura.
   */
  pontos: string[]
  classeCabine: string | null
  propriedadeVeiculo: PropriedadeVeiculo | null
  combustivel: Combustivel | null
}

/** O ponto como se lê: o município pelo nome, o aeroporto pelo próprio código. */
function rotuloDoPonto(tipo: TipoDeViagem, ponto: string): string {
  if (tipo === 'aereo') return ponto
  const municipio = municipioPorCodigo(ponto)
  return municipio === null ? ponto : `${municipio.nome}/${municipio.uf}`
}

/**
 * A emissão **da pessoa** num trecho.
 *
 * O documento guarda a emissão do veículo, que é o que distância e fator
 * reproduzem (§9.1). A divisão pelos ocupantes acontece aqui, ao atribuir — e
 * precisa acontecer em **toda** atribuição a pessoa, senão dois caronas que
 * registrem a mesma viagem contam o mesmo carro duas vezes no total do programa.
 * No aéreo não há divisão: cada trecho é um passageiro.
 */
function atribuido(trecho: DocViagemRegistrada): number {
  const ocupantes = trecho.ocupantes ?? 1
  return ocupantes < 1 ? trecho.co2Kg : trecho.co2Kg / ocupantes
}

/** Agrupa trechos em viagens, que é como a tela lista. */
function montarViagens(
  trechos: DocViagemRegistrada[],
  nomePorFuncionario: Map<string, string> | null,
): ViagemRegistrada[] {
  const porReserva = new Map<string, DocViagemRegistrada[]>()
  for (const t of trechos) {
    const lista = porReserva.get(t.reservaId)
    if (lista) lista.push(t)
    else porReserva.set(t.reservaId, [t])
  }

  return [...porReserva.entries()]
    .map(([reservaId, lista]) => {
      const ordenados = [...lista].sort((a, b) => a.ordem - b.ordem)
      const primeiro = ordenados[0]
      const pontos = [primeiro.origem, ...ordenados.map((t) => t.destino)]
      const rota = pontos.map((p) => rotuloDoPonto(primeiro.tipo, p)).join(' → ')

      return {
        reservaId,
        tipo: primeiro.tipo,
        dataIda: primeiro.dataIda,
        dataVolta: primeiro.dataVolta,
        rota,
        co2Kg: somar(ordenados, atribuido),
        co2KgVeiculo: somar(ordenados, (t) => t.co2Kg),
        ocupantes: primeiro.ocupantes,
        trechos: ordenados.length,
        distanciaKm: somar(ordenados, (t) => t.distanciaKm),
        registradoPor:
          primeiro.funcionarioId === null
            ? null
            : (nomePorFuncionario?.get(primeiro.funcionarioId) ?? null),
        editavel: periodoFechadoPara(primeiro.dataIda).editavel,
        pontos,
        classeCabine: primeiro.classeCabine,
        propriedadeVeiculo: primeiro.propriedadeVeiculo,
        combustivel: primeiro.combustivel,
      }
    })
    .sort((a, b) => b.dataIda.localeCompare(a.dataIda))
}

/**
 * As submissões de quem está consultando. O filtro pelo uid entra na consulta,
 * junto do dado — é o controle de acesso do perfil `colaborador` (§5.1).
 */
export async function consultarMinhasViagens(
  ctx: ContextoDeAcesso,
  db: Firestore = firestore(),
): Promise<{
  viagens: ViagemRegistrada[]
  co2Kg: number
  /** Até quando o período está fechado, para a tela declarar (§7.5). */
  fechadoAte: DataIso | null
}> {
  exigirProgramaDeViagens(ctx)

  const instantaneo = await db
    .collection(COLECAO.viagemRegistrada)
    .where('criadoPorUid', '==', ctx.uid)
    .get()
  const trechos = instantaneo.docs.map((d) => d.data() as DocViagemRegistrada)

  return {
    viagens: montarViagens(trechos, null),
    co2Kg: somar(trechos, atribuido),
    fechadoAte: programaFechadoAte(),
  }
}

export type ResumoDoPrograma = {
  ano: number | null
  viagens: number
  trechos: number
  co2Kg: number
  co2Toneladas: number
  /**
   * **Adesão ao programa:** quantas pessoas já registraram alguma viagem, e
   * quantas o programa poderia alcançar.
   *
   * O rótulo na tela precisa dizer isso — "já registrou" —, e não um "cobertura"
   * solto. O protótipo usava a mesma palavra para outra conta (o quanto do que a
   * agência registrou no período já teria sido coberto pelo formulário), e
   * indicador com rótulo ambíguo é o começo de discussão longa em reunião.
   *
   * **O denominador não sai de coleção nenhuma, e a ausência dele é declarada em
   * vez de contornada** (§13). O candidato óbvio era o tamanho da coleção de
   * funcionários, e ele está errado: ela é alimentada por mais de uma base e
   * inclui gente que só aparece como aprovador de passagem, nunca como viajante.
   * Com ele, a adesão nasceria menor do que é e o indicador **pareceria
   * funcionar** — que é a forma mais cara de estar errado. Sem o parâmetro, a
   * tela mostra a contagem e diz que o denominador não está definido.
   */
  cobertura: {
    registraram: number
    /** Nulo enquanto `PROGRAMA_QUADRO` não estiver definido. */
    quadro: number | null
    proporcao: number | null
  }
  porMes: { mes: string; co2Kg: number; documentos: number }[]
  porTipo: { tipo: string; viagens: number; co2Kg: number; proporcao: number }[]
  ultimas: ViagemRegistrada[]
  /** Até quando o período está fechado, para a tela declarar (§7.5). */
  fechadoAte: DataIso | null
  /** Lugares e ligações do que foi registrado, prontos para desenhar. */
  mapa: MapaDoPrograma
}

/**
 * Visão de adesão do programa. `gestor` recebe tudo agregado e sem nome; `admin`
 * e `sustentabilidade` veem quem registrou nas últimas viagens.
 */
export async function consultarPrograma(
  ctx: ContextoDeAcesso,
  filtros: { ano?: number } = {},
  db: Firestore = firestore(),
): Promise<ResumoDoPrograma> {
  exigirProgramaDeViagens(ctx)
  if (ctx.papel === 'colaborador') {
    // O viajante não vê agregado do programa; a porta dele é `consultarMinhasViagens`.
    throw new Error(
      'O perfil "colaborador" não vê o agregado do programa, apenas as próprias submissões.',
    )
  }

  let consulta: Query = db.collection(COLECAO.viagemRegistrada)
  if (filtros.ano !== undefined) consulta = consulta.where('ano', '==', filtros.ano)

  const instantaneo = await consulta.get()
  const trechos = instantaneo.docs.map((d) => d.data() as DocViagemRegistrada)

  // O nome só é lido quando o perfil pode vê-lo. Para o gestor, ele nem sai da
  // coleção de funcionários.
  let nomePorFuncionario: Map<string, string> | null = null
  if (podeVerQuemRegistrou(ctx)) {
    const cadastro = await db.collection(COLECAO.funcionario).get()
    nomePorFuncionario = new Map(
      cadastro.docs.map((d) => [d.id, (d.data() as DocFuncionario).nome]),
    )
  }

  const viagens = montarViagens(trechos, nomePorFuncionario)
  // Atribuída às pessoas, e não a soma dos veículos: ver `atribuido`.
  const co2Kg = somar(trechos, atribuido)

  // Conta pessoas distintas pelo uid, não pelo vínculo com o cadastro: quem
  // registrou e ainda não tem documento de funcionário mesmo assim aderiu.
  const registraram = new Set(trechos.map((t) => t.criadoPorUid)).size
  const quadro = programaQuadro()

  const porTipo = new Map<string, { viagens: number; co2Kg: number }>()
  for (const v of viagens) {
    const atual = porTipo.get(v.tipo) ?? { viagens: 0, co2Kg: 0 }
    atual.viagens += 1
    atual.co2Kg += v.co2Kg
    porTipo.set(v.tipo, atual)
  }

  return {
    ano: filtros.ano ?? null,
    viagens: viagens.length,
    trechos: trechos.length,
    co2Kg,
    co2Toneladas: emToneladas(co2Kg),
    cobertura: {
      registraram,
      quadro,
      proporcao: quadro === null ? null : registraram / quadro,
    },
    porMes: serieMensal(trechos, (t) => t.mes, atribuido),
    porTipo: [...porTipo.entries()]
      .map(([tipo, v]) => ({
        tipo,
        ...v,
        proporcao: co2Kg === 0 ? 0 : v.co2Kg / co2Kg,
      }))
      .sort((a, b) => b.co2Kg - a.co2Kg),
    ultimas: viagens.slice(0, 10),
    fechadoAte: programaFechadoAte(),
    mapa: await montarMapaDoPrograma(db, trechos),
  }
}


/* ---------------------------------------------------- mapa do programa */

/**
 * O mapa da tela de Emissões registradas — §10, item 7.
 *
 * **Todo ponto é um lugar de verdade**, e a unidade é a mesma nos dois modais:
 * a cidade do aeroporto no voo, o município no carro. É a diferença que separa
 * este mapa do de Viagens, e ela não é estética.
 *
 * Lá o corredor agrega regiões porque são centenas de trechos, e uma linha por
 * par de aeroportos vira emaranhado. Aqui não há volume que peça agregação nem
 * supressão a satisfazer — o programa é identificado por desenho (§3.2) —,
 * então agregar esconderia de onde se foi sem ganhar nada em legibilidade. E
 * misturar as duas unidades num desenho só poria o ponto de uma região inteira
 * ao lado do ponto de um município, que são coisas de escalas diferentes com a
 * mesma aparência.
 *
 * **Nada aqui diz quem.** O mapa mostra menos que a tabela de últimas viagens
 * da mesma tela, que para `admin` e `sustentabilidade` carrega o nome de quem
 * registrou (§3.2).
 */
export type MapaDoPrograma = {
  ligacoes: LigacaoDoMapa[]
  /**
   * Trechos sem lugar desenhável, e o que eles pesam.
   *
   * Dois motivos, e os dois são dado faltando de verdade: aeroporto fora do
   * cadastro ou sem coordenada, e município sem centroide na malha — o IBGE
   * cria o município no cadastro de localidades antes de refazer a malha, então
   * um município recém-criado entra no formulário e ainda não tem ponto.
   *
   * Existe como número porque a tela precisa **declarar**: mapa que soma menos
   * que o total, sem uma palavra, é lido como falha de carga.
   */
  semGeografia: number
  co2KgSemGeografia: number
  /** Emissão que as ligações desenhadas somam, para a tela conferir. */
  co2KgDesenhado: number
}

/**
 * A identidade de um lugar no mapa — **cidade e UF, não o código**.
 *
 * **O aeroporto de Curitiba e o município de Curitiba são o mesmo lugar.** Com o
 * código como chave eles viravam dois pontos a poucos pixels um do outro, com
 * dois rótulos sobrepostos — e o mapa passava a dizer que a empresa foi a dois
 * lugares quando foi a um. Medido no desenho, os rótulos ficavam a menos de
 * vinte pixels.
 *
 * Onde a UF não existe — aeroporto estrangeiro —, a chave cai no próprio código:
 * o pior caso vira o comportamento anterior, dois pontos separados, que é
 * feio e não é errado. Juntar lugares distintos seria o contrário disso, e é por
 * isso que a junção exige as duas partes.
 */
function chaveDeLugar(nome: string | null, uf: string | null, codigo: string): string {
  return nome && uf ? chaveNormalizada(`${nome}/${uf}`) : codigo
}

/** Um lugar do mapa, ou nulo quando não há coordenada de onde tirar o ponto. */
function lugarDoTrecho(
  trecho: DocViagemRegistrada,
  ponta: 'origem' | 'destino',
  aeroportos: Map<string, DocAeroporto>,
): PontoDoMapa | null {
  const codigo = trecho[ponta]

  if (trecho.tipo === 'aereo') {
    const a = aeroportos.get(codigo)
    if (a === undefined || !coordenadaValida(a.latitude, a.longitude)) return null
    return {
      chave: chaveDeLugar(a.cidade, a.uf, a.iata),
      // A cidade, e não o nome do aeroporto: o rótulo vive num mapa pequeno, e
      // "Aeroporto Internacional de …" não caberia nem diria mais. Com a UF
      // junto, para casar com o rótulo do município da mesma cidade.
      rotulo: a.cidade === null ? a.iata : a.uf === null ? a.cidade : `${a.cidade}/${a.uf}`,
      latitude: a.latitude as number,
      longitude: a.longitude as number,
      // A classificação gravada no cadastro é a mesma que o mapa do inventário
      // usa, e a tela de Método declara (§10.3).
      domestico: a.regiao !== null && ehDoBrasil(a.regiao),
    }
  }

  const municipio = municipioPorCodigo(codigo)
  if (
    municipio === null ||
    municipio.latitude === null ||
    municipio.longitude === null
  ) {
    return null
  }
  return {
    chave: chaveDeLugar(municipio.nome, municipio.uf, municipio.codigoIbge),
    rotulo: `${municipio.nome}/${municipio.uf}`,
    latitude: municipio.latitude,
    longitude: municipio.longitude,
    // Município do IBGE é do Brasil por definição: não há o que inferir.
    domestico: true,
  }
}

/**
 * Agrega os trechos registrados em ligações desenháveis.
 *
 * **Ida e volta são a mesma ligação**, como no mapa do inventário: a chave é o
 * par de lugares em ordem alfabética, então o sentido não desenha duas linhas
 * sobrepostas. Trecho que sai e volta ao mesmo lugar vira anel, e o desenho
 * cuida disso sozinho.
 *
 * O peso de cada ligação é a emissão **atribuída**, já dividida pelos ocupantes
 * (§7.5) — a mesma conta dos cartões da tela, para a espessura da linha não
 * contar o carro compartilhado duas vezes.
 */
async function montarMapaDoPrograma(
  db: Firestore,
  trechos: DocViagemRegistrada[],
): Promise<MapaDoPrograma> {
  if (trechos.length === 0) {
    return { ligacoes: [], semGeografia: 0, co2KgSemGeografia: 0, co2KgDesenhado: 0 }
  }

  // O cadastro de aeroportos só é lido quando há trecho aéreo: uma leitura de
  // coleção inteira para desenhar zero linhas é leitura à toa.
  const aeroportos = new Map<string, DocAeroporto>()
  if (trechos.some((t) => t.tipo === 'aereo')) {
    for (const doc of (await db.collection(COLECAO.aeroporto).get()).docs) {
      const a = doc.data() as DocAeroporto
      aeroportos.set(a.iata, a)
    }
  }

  const porLigacao = new Map<string, LigacaoDoMapa>()
  let semGeografia = 0
  let co2KgSemGeografia = 0

  for (const t of trechos) {
    const origem = lugarDoTrecho(t, 'origem', aeroportos)
    const destino = lugarDoTrecho(t, 'destino', aeroportos)
    const co2Kg = atribuido(t)

    if (origem === null || destino === null) {
      semGeografia += 1
      co2KgSemGeografia += co2Kg
      continue
    }

    const chave = corredor(origem.chave, destino.chave)
    const atual = porLigacao.get(chave)
    if (atual === undefined) {
      porLigacao.set(chave, { chave, origem, destino, co2Kg })
    } else {
      atual.co2Kg += co2Kg
    }
  }

  const ligacoes = [...porLigacao.values()].sort((a, b) => b.co2Kg - a.co2Kg)
  return {
    ligacoes,
    semGeografia,
    co2KgSemGeografia,
    co2KgDesenhado: somar(ligacoes, (l) => l.co2Kg),
  }
}

/* ------------------------------------------------- registrar uma viagem */

/**
 * O que o formulário manda — CLAUDE.md §7.5.
 *
 * **É o mínimo que calcula emissão, e nada além.** Não há valor, não há
 * justificativa, não há aprovação: nenhum deles entra na conta, e cada campo a
 * mais é uma chance a mais de o formulário não ser preenchido. Os três campos
 * do carro são a exceção declarada, porque os três mudam o número.
 *
 * A classe da cabine é a outra exceção, pelo mesmo critério. No inventário ela
 * é **assumida** como econômica, porque o relatório da agência não informa a
 * cabine (§7.2); aqui quem preenche é quem voou e sabe — e a diferença entre
 * econômica e executiva é quase três vezes a emissão do trecho. Assumir o que
 * se pode perguntar seria descartar informação de graça.
 */
export type ClasseCabine = 'economica' | 'executiva' | 'primeira'

export type EntradaDeViagem =
  | {
      tipo: 'aereo'
      dataIda: DataIso
      dataVolta: DataIso | null
      classeCabine: ClasseCabine
      /** Pares de código IATA, na ordem em que se voou. */
      trechos: { origem: string; destino: string }[]
      /** Presente só quando se está editando uma submissão já gravada. */
      reservaId?: string
    }
  | {
      tipo: 'carro'
      dataIda: DataIso
      dataVolta: DataIso | null
      /** Códigos IBGE: origem, paradas intermediárias e destino, na ordem. */
      paradas: string[]
      propriedadeVeiculo: PropriedadeVeiculo
      combustivel: Combustivel
      ocupantes: number
      reservaId?: string
    }

/**
 * Recusa que é **do preenchimento**, não do sistema.
 *
 * Existe separada para a tela poder mostrar a frase a quem preencheu, em vez de
 * um erro de servidor: quem errou tem como corrigir, e precisa saber o quê.
 */
export class RegistroRecusadoError extends Error {
  constructor(motivo: string) {
    super(motivo)
    this.name = 'RegistroRecusadoError'
  }
}

export type TrechoCalculado = {
  ordem: number
  origem: string
  destino: string
  distanciaKm: number
  /** Emissão do trecho: por passageiro no aéreo, do veículo no carro. */
  co2Kg: number
}

/**
 * O retorno imediato da §7.5 — **o principal incentivo de adesão, e por isso
 * não se omite.** Quem preenche vê na hora quanto a própria viagem emitiu.
 */
export type ResultadoDoRegistro = {
  reservaId: string
  tipo: TipoDeViagem
  trechos: TrechoCalculado[]
  distanciaKm: number
  /**
   * Emissão do veículo, inteira. No aéreo é a da pessoa: cada trecho é um
   * passageiro. No carro é o que o carro emitiu, independentemente de quantos
   * estavam dentro.
   */
  co2KgVeiculo: number
  /**
   * O que se atribui a quem registrou: no carro, o veículo dividido pelos
   * ocupantes (§7.5).
   *
   * **A divisão acontece ao atribuir, não ao gravar.** O documento guarda a
   * emissão do veículo, que é o que distância e fator reproduzem; dividir antes
   * esconderia a conta dentro do número. E a divisão precisa acontecer em toda
   * atribuição a pessoa, senão dois caronas registrando a mesma viagem
   * contariam o mesmo carro duas vezes no total do programa.
   */
  co2Kg: number
  ocupantes: number | null
}

/** Situação do período para uma viagem — §7.5. */
export type SituacaoDoPeriodo = {
  fechadoAte: DataIso | null
  editavel: boolean
}

/**
 * Se a viagem ainda pode ser mexida.
 *
 * **Fechar um período é operação, não tela** (§7.5): a data vem do ambiente e
 * quem a muda é quem opera, como quem concede perfil e quem roda carga. Não há
 * botão que feche, porque um botão precisaria de quem pode apertá-lo, de
 * registro de quem apertou e de como desfazer — e nada disso se paga num
 * programa que não é fonte de relatório.
 */
export function periodoFechadoPara(dataIda: DataIso): SituacaoDoPeriodo {
  const fechadoAte = programaFechadoAte()
  return {
    fechadoAte,
    editavel: fechadoAte === null || dataIda > fechadoAte,
  }
}

/**
 * O identificador da viagem, derivado do que ela é.
 *
 * O inventário deriva o ID do arquivo de origem, porque é recarregar o arquivo
 * que precisa sobrescrever (§9.1). Aqui não há arquivo: a origem é quem
 * registrou e o que registrou. Derivar do conteúdo dá de graça a proteção que
 * mais falta num formulário — **enviar duas vezes a mesma viagem grava uma**,
 * em vez de dobrar a emissão de alguém por causa de um clique repetido. Duas
 * viagens com o mesmo trajeto e as mesmas datas não são duas viagens.
 */
function reservaIdDerivado(uid: string, entrada: EntradaDeViagem): string {
  const lugares =
    entrada.tipo === 'aereo'
      ? entrada.trechos.map((t) => t.origem + '>' + t.destino).join(',')
      : entrada.paradas.join(',')
  const bruto = [
    uid,
    entrada.tipo,
    entrada.dataIda,
    entrada.dataVolta ?? '',
    lugares,
  ].join('|')
  const resumo = createHash('sha1').update(bruto).digest('hex').slice(0, 10)
  return entrada.dataIda + '-' + resumo
}

function exigirDatas(entrada: EntradaDeViagem): void {
  if (!ehDataIso(entrada.dataIda)) {
    throw new RegistroRecusadoError('A data de ida não é uma data válida.')
  }
  if (entrada.dataVolta !== null && !ehDataIso(entrada.dataVolta)) {
    throw new RegistroRecusadoError('A data de volta não é uma data válida.')
  }
  if (entrada.dataVolta !== null && entrada.dataVolta < entrada.dataIda) {
    throw new RegistroRecusadoError('A data de volta antecede a data de ida.')
  }
}

/** O que cada caminho de cálculo devolve, já pronto para virar documento. */
type ViagemCalculada = {
  escopo: Escopo
  propriedadeVeiculo: PropriedadeVeiculo | null
  combustivel: Combustivel | null
  ocupantes: number | null
  trechos: {
    ordem: number
    origem: string
    destino: string
    distanciaKm: number
    co2Kg: number
    fator: FatorAplicado
    faixaDistancia: FaixaDistancia | null
    classeCabine: string | null
    multiplicadorClasse: number | null
  }[]
}

/**
 * Aéreo — a mesma conta do inventário (§7.2), com uma diferença que vale
 * registrar: **aqui o acréscimo sobre a ortodrômica é aplicado.**
 *
 * Na base da agência a distância já vem pronta e com ele embutido, e reaplicá-lo
 * inflaria o número; aqui a distância é calculada do zero a partir das
 * coordenadas dos aeroportos, então aplicá-lo é obrigatório. A mesma regra nos
 * dois sentidos.
 */
async function calcularAereo(
  db: Firestore,
  entrada: Extract<EntradaDeViagem, { tipo: 'aereo' }>,
  fatores: ResolvedorDeFatores,
): Promise<ViagemCalculada> {
  if (entrada.trechos.length === 0) {
    throw new RegistroRecusadoError('Informe pelo menos um trecho.')
  }

  const aeroportos = new Map<string, DocAeroporto>()
  for (const doc of (await db.collection(COLECAO.aeroporto).get()).docs) {
    const a = doc.data() as DocAeroporto
    aeroportos.set(a.iata, a)
  }

  const coordenadaDe = (iata: string): { latitude: number; longitude: number } => {
    const a = aeroportos.get(iata)
    if (a === undefined) {
      throw new RegistroRecusadoError(
        `O aeroporto "${iata}" não está no cadastro. Escolha um da lista.`,
      )
    }
    // `coordenadaValida` recusa (0, 0): é coordenada legítima no Golfo da Guiné
    // e é o que cadastro incompleto costuma trazer. Sem distância não há conta,
    // e uma conta com o ponto errado sai sem nenhum erro aparecer.
    if (!coordenadaValida(a.latitude, a.longitude)) {
      throw new RegistroRecusadoError(
        `O aeroporto "${iata}" está no cadastro sem coordenada utilizável, ` +
          'então a distância não pode ser calculada.',
      )
    }
    return { latitude: a.latitude as number, longitude: a.longitude as number }
  }

  const uplift = fatores.vigente(CATEGORIA_AEREO_UPLIFT, 'gcd', entrada.dataIda)
  const classe = fatores.vigente(
    CATEGORIA_AEREO_CLASSE,
    entrada.classeCabine,
    entrada.dataIda,
  )
  const limites = limitesDeFaixa(fatores, entrada.dataIda)

  const trechos = entrada.trechos.map((t, i) => {
    const origem = t.origem.trim().toUpperCase()
    const destino = t.destino.trim().toUpperCase()
    if (origem === destino) {
      throw new RegistroRecusadoError(
        `O trecho ${i + 1} tem origem e destino iguais (${origem}).`,
      )
    }

    const distanciaKm = aplicarUplift(
      distanciaOrtodromicaKm(coordenadaDe(origem), coordenadaDe(destino)),
      uplift.valor,
    )
    const faixa = faixaPorDistancia(distanciaKm, limites)
    const fator = fatores.vigente(CATEGORIA_AEREO_FAIXA, faixa, entrada.dataIda)

    return {
      ordem: i + 1,
      origem,
      destino,
      distanciaKm,
      co2Kg: emissaoTrechoAereo({
        distanciaKm,
        fatorKgPorPassageiroKm: fator.valor,
        multiplicadorClasse: classe.valor,
        // Quem preenche é quem viajou: um passageiro por trecho. Por isso esta
        // coleção não tem `passageiros` (§9.6.1).
        passageiros: 1,
      }),
      fator,
      faixaDistancia: faixa,
      classeCabine: entrada.classeCabine,
      multiplicadorClasse: classe.valor,
    }
  })

  // Viagem a serviço é Escopo 3, categoria 6.
  return {
    escopo: 3,
    propriedadeVeiculo: null,
    combustivel: null,
    ocupantes: null,
    trechos,
  }
}

/**
 * Carro — distância **rodoviária**, nunca ortodrômica (§7.4), e fator por
 * veículo-km.
 *
 * **O fator é o mesmo da mobilidade, e isso é reaproveitamento, não atalho**
 * (§7.5): um carro a gasolina emite por quilômetro o que emite, indo trabalhar
 * ou indo a cliente. O que não se compartilha é o dado.
 *
 * O escopo sai da propriedade do veículo: frota é Escopo 1, próprio e locado são
 * Escopo 3 — a validação de escrita confere os dois lados (§9.9).
 */
async function calcularCarro(
  db: Firestore,
  entrada: Extract<EntradaDeViagem, { tipo: 'carro' }>,
  fatores: ResolvedorDeFatores,
): Promise<ViagemCalculada> {
  if (entrada.paradas.length < 2) {
    throw new RegistroRecusadoError('Informe pelo menos a origem e o destino.')
  }
  if (!Number.isInteger(entrada.ocupantes) || entrada.ocupantes < 1) {
    throw new RegistroRecusadoError('O número de ocupantes precisa ser um inteiro ≥ 1.')
  }

  const paradas = entrada.paradas.map((codigo) => {
    const municipio = municipioPorCodigo(codigo)
    if (municipio === null) {
      throw new RegistroRecusadoError(
        `O município de código ${codigo} não está na lista. Escolha um da lista.`,
      )
    }
    return municipio
  })
  for (let i = 0; i + 1 < paradas.length; i++) {
    if (paradas[i].codigoIbge === paradas[i + 1].codigoIbge) {
      throw new RegistroRecusadoError(
        `${paradas[i].nome} aparece duas vezes seguidas no trajeto.`,
      )
    }
  }

  const fator = fatores.vigente(
    categoriaDoFator('carro'),
    chaveDoFator('carro', entrada.combustivel),
    entrada.dataIda,
  )

  const rodoviarios = await trajetoRodoviario(db, paradas)
  const trechos = rodoviarios.map((trecho, i) => ({
    ordem: i + 1,
    // **Guarda o código, não o nome.** É o que o inventário já faz com o código
    // IATA, e é o que permite reabrir a viagem no formulário para editar: nome
    // gravado não volta a ser escolha de lista. O nome é resolvido na exibição,
    // contra a lista embarcada, que não custa nada consultar.
    origem: trecho.origem.codigoIbge,
    destino: trecho.destino.codigoIbge,
    distanciaKm: trecho.distanciaKm,
    // A emissão gravada é a do veículo. A divisão pelos ocupantes acontece ao
    // atribuir a uma pessoa, e não aqui.
    co2Kg: trecho.distanciaKm * fator.valor,
    fator,
    faixaDistancia: null,
    classeCabine: null,
    multiplicadorClasse: null,
  }))

  return {
    escopo: entrada.propriedadeVeiculo === 'frota' ? 1 : 3,
    propriedadeVeiculo: entrada.propriedadeVeiculo,
    combustivel: entrada.combustivel,
    ocupantes: entrada.ocupantes,
    trechos,
  }
}

/**
 * Registra — ou regrava — uma viagem do programa.
 *
 * **Escreve em `viagemRegistrada` e em nenhuma coleção do inventário** (§0.1).
 * O cálculo reaproveita os fatores e as funções do inventário; o dado não se
 * mistura.
 *
 * A regravação usa o mesmo mecanismo da carga (§9.9): grava tudo e só então
 * apaga, do escopo desta viagem, o que não está na submissão nova. É o que faz
 * uma viagem editada de três trechos para dois não deixar o terceiro para trás.
 */
export async function registrarViagem(
  ctx: ContextoDeAcesso,
  entrada: EntradaDeViagem,
  db: Firestore = firestore(),
): Promise<ResultadoDoRegistro> {
  exigirProgramaDeViagens(ctx)
  exigirDatas(entrada)

  const reservaId = entrada.reservaId ?? reservaIdDerivado(ctx.uid, entrada)

  // **O período fechado é conferido na escrita, não na interface** (§11.3). A
  // tela deixa de oferecer o botão; o que impede de fato é esta linha.
  const periodo = periodoFechadoPara(entrada.dataIda)
  if (!periodo.editavel) {
    throw new RegistroRecusadoError(
      `O período até ${periodo.fechadoAte} está fechado: viagens com ida até ` +
        'essa data não podem mais ser registradas nem editadas.',
    )
  }

  const fatores = await carregarFatores(db)
  if (fatores.total === 0) {
    throw new RegistroRecusadoError(
      'A tabela de fatores de emissão está vazia, e sem fator não há cálculo (§9.8).',
    )
  }

  const calculada =
    entrada.tipo === 'aereo'
      ? await calcularAereo(db, entrada, fatores)
      : await calcularCarro(db, entrada, fatores)

  const atualizadoEm = hojeIso()
  const documentos = calculada.trechos.map((trecho) => {
    const dados: DocViagemRegistrada = {
      modal: entrada.tipo === 'aereo' ? 'aereo' : 'terrestre',
      escopo: calculada.escopo,
      // **O período sai da data de ida, e vale para a viagem inteira.** É o que
      // a validação confere contra `dataIda` (§9.9), e é o que mantém os
      // trechos de uma mesma viagem no mesmo mês: a volta de uma viagem que
      // atravessa a virada do mês conta no mês em que a viagem começou.
      ano: anoDe(entrada.dataIda),
      mes: mesDe(entrada.dataIda),
      fator: trecho.fator,
      ...montarAlertas([]),
      atualizadoEm,
      reservaId,
      ordem: trecho.ordem,
      criadoPorUid: ctx.uid,
      funcionarioId: ctx.funcionarioId,
      tipo: entrada.tipo,
      dataIda: entrada.dataIda,
      dataVolta: entrada.dataVolta,
      origem: trecho.origem,
      destino: trecho.destino,
      distanciaKm: trecho.distanciaKm,
      co2Kg: trecho.co2Kg,
      faixaDistancia: trecho.faixaDistancia,
      classeCabine: trecho.classeCabine,
      multiplicadorClasse: trecho.multiplicadorClasse,
      propriedadeVeiculo: calculada.propriedadeVeiculo,
      combustivel: calculada.combustivel,
      ocupantes: calculada.ocupantes,
    }

    const id = idViagemRegistrada(ctx.uid, reservaId, trecho.ordem)
    validarViagemRegistrada(id, dados)
    return { id, dados }
  })

  await recarregarEscopo({
    colecao: COLECAO.viagemRegistrada,
    // O escopo é **esta viagem desta pessoa**: regravar não enxerga nem apaga
    // viagem de mais ninguém, nem outra viagem de quem registrou. É também o que
    // impede editar submissão alheia, porque o uid entra no filtro e no ID.
    escopo: [
      { campo: 'criadoPorUid', valor: ctx.uid },
      { campo: 'reservaId', valor: reservaId },
    ],
    documentos,
    db,
  })

  const co2KgVeiculo = somar(calculada.trechos, (t) => t.co2Kg)
  const ocupantes = calculada.ocupantes
  return {
    reservaId,
    tipo: entrada.tipo,
    trechos: calculada.trechos.map((t) => ({
      ordem: t.ordem,
      origem: t.origem,
      destino: t.destino,
      distanciaKm: t.distanciaKm,
      co2Kg: t.co2Kg,
    })),
    distanciaKm: somar(calculada.trechos, (t) => t.distanciaKm),
    co2KgVeiculo,
    co2Kg: ocupantes === null ? co2KgVeiculo : co2KgVeiculo / ocupantes,
    ocupantes,
  }
}

/**
 * Os aeroportos do cadastro, para o autocomplete do formulário.
 *
 * Sai da camada de consulta como tudo o mais: a tela não alcança coleção
 * nenhuma por fora daqui (§9.10). São poucas dezenas de linhas, então vão
 * inteiras para a tela e a busca acontece no navegador, sem uma ida ao servidor
 * por tecla digitada.
 */
export type AeroportoParaEscolher = {
  iata: string
  nome: string
  cidade: string | null
  uf: string | null
}

export async function consultarAeroportos(
  ctx: ContextoDeAcesso,
  db: Firestore = firestore(),
): Promise<AeroportoParaEscolher[]> {
  exigirProgramaDeViagens(ctx)

  return (await db.collection(COLECAO.aeroporto).get()).docs
    .map((d) => d.data() as DocAeroporto)
    .filter((a) => coordenadaValida(a.latitude, a.longitude))
    .map((a) => ({ iata: a.iata, nome: a.nome, cidade: a.cidade, uf: a.uf }))
    .sort((a, b) => a.iata.localeCompare(b.iata))
}

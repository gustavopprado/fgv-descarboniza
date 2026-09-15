/**
 * Consultas do programa de viagens — CLAUDE.md §3.2, §5.1 e §10.
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
import type { Firestore } from 'firebase-admin/firestore'

import type { DocFuncionario, DocViagemTrecho } from '../documentos/tipos'
import { COLECAO, firestore } from '../firestore'
import { emToneladas, serieMensal, somar } from './agregacao'
import {
  exigirProgramaDeViagens,
  podeVerQuemRegistrou,
  type ContextoDeAcesso,
} from './acesso'

const FONTE_DO_PROGRAMA = 'formulario' as const

export type ViagemRegistrada = {
  reservaId: string
  tipo: 'aereo' | 'carro'
  dataIda: string
  dataVolta: string | null
  rota: string
  co2Kg: number
  trechos: number
  /** Nulo quando quem consulta não pode ver quem registrou (§3.2). */
  registradoPor: string | null
}

/** Agrupa trechos em viagens, que é como a tela lista. */
function montarViagens(
  trechos: DocViagemTrecho[],
  nomePorFuncionario: Map<string, string> | null,
): ViagemRegistrada[] {
  const porReserva = new Map<string, DocViagemTrecho[]>()
  for (const t of trechos) {
    const lista = porReserva.get(t.reservaId)
    if (lista) lista.push(t)
    else porReserva.set(t.reservaId, [t])
  }

  return [...porReserva.entries()]
    .map(([reservaId, lista]) => {
      const ordenados = [...lista].sort((a, b) => a.ordem - b.ordem)
      const primeiro = ordenados[0]
      const rota = [
        ordenados[0].origem,
        ...ordenados.map((t) => t.destino),
      ].join(' → ')

      return {
        reservaId,
        tipo: primeiro.tipo,
        dataIda: primeiro.dataIda,
        dataVolta: primeiro.dataVolta,
        rota,
        co2Kg: somar(ordenados, (t) => t.co2Kg),
        trechos: ordenados.length,
        registradoPor: nomePorFuncionario?.get(primeiro.funcionarioId) ?? null,
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
): Promise<{ viagens: ViagemRegistrada[]; co2Kg: number }> {
  exigirProgramaDeViagens(ctx)

  const instantaneo = await db
    .collection(COLECAO.viagemTrecho)
    .where('criadoPorUid', '==', ctx.uid)
    .get()
  const trechos = instantaneo.docs.map((d) => d.data() as DocViagemTrecho)

  return {
    viagens: montarViagens(trechos, null),
    co2Kg: somar(trechos, (t) => t.co2Kg),
  }
}

export type ResumoDoPrograma = {
  ano: number | null
  viagens: number
  trechos: number
  co2Kg: number
  co2Toneladas: number
  /**
   * **Adesão ao programa:** quantos do quadro já registraram alguma viagem.
   *
   * O rótulo na tela precisa dizer isso — "do quadro já registrou" —, e não um
   * "cobertura" solto. O protótipo usava a mesma palavra para outra conta (o
   * quanto do que a agência registrou no período já foi coberto pelo
   * formulário), e indicador com rótulo ambíguo é o começo de discussão longa
   * em reunião. A conta daqui é a de adesão.
   */
  cobertura: { registraram: number; funcionarios: number; proporcao: number }
  porMes: { mes: string; co2Kg: number; documentos: number }[]
  porTipo: { tipo: string; viagens: number; co2Kg: number; proporcao: number }[]
  ultimas: ViagemRegistrada[]
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

  let consulta = db
    .collection(COLECAO.viagemTrecho)
    .where('fonte', '==', FONTE_DO_PROGRAMA)
  if (filtros.ano !== undefined) consulta = consulta.where('ano', '==', filtros.ano)

  const instantaneo = await consulta.get()
  const trechos = instantaneo.docs.map((d) => d.data() as DocViagemTrecho)

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
  const co2Kg = somar(trechos, (t) => t.co2Kg)

  const funcionarios = (await db.collection(COLECAO.funcionario).select().get()).size
  const registraram = new Set(trechos.map((t) => t.funcionarioId)).size

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
      funcionarios,
      proporcao: funcionarios === 0 ? 0 : registraram / funcionarios,
    },
    porMes: serieMensal(trechos, (t) => t.mes, (t) => t.co2Kg),
    porTipo: [...porTipo.entries()]
      .map(([tipo, v]) => ({
        tipo,
        ...v,
        proporcao: co2Kg === 0 ? 0 : v.co2Kg / co2Kg,
      }))
      .sort((a, b) => b.co2Kg - a.co2Kg),
    ultimas: viagens.slice(0, 10),
  }
}

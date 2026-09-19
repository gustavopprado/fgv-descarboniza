/**
 * A Visão geral — CLAUDE.md §10.0 e §10.0.1.
 *
 * **É a primeira consulta que atravessa os três módulos**, e a §9.3 existe
 * justamente porque somar taxa com evento produz número errado sem nenhum sinal
 * de erro. Por isso a consolidação é explícita e mora aqui, fora das consultas
 * de módulo: cada decisão do consolidado é uma linha que alguém pode ler.
 *
 * Três recortes, um total:
 *
 *  - **mobilidade pelo ano-base da pesquisa**, que é 2026 e não o ano relatado;
 *  - **viagens e marítimo pelo ano civil** de `ANO_BASE_INVENTARIO`.
 *
 * > **Filtro único para os três é o defeito, não a simplificação.** A resposta
 * > da mobilidade é uma taxa mensal com `mes` nulo e `anoBase` próprio (§9.5):
 * > aplicar a ela o filtro do ano civil devolve coleção vazia, e o painel perde
 * > um módulo inteiro **sem erro nenhum** — o total simplesmente aparece menor.
 * > É a família dos defeitos que a §14 vem registrando: consulta que afirma um
 * > arranjo que o dado não tem.
 *
 * **Os números vêm das consultas de módulo, e isso é decisão.** Recalcular aqui
 * seria uma segunda implementação de "previsão fora do total", de "aéreo dentro
 * do total" e de `contabilizar` — duas cópias da mesma regra, e uma que envelhece
 * sem a outra. Reusando, a coerência entre esta tela e a do módulo é estrutural:
 * não há filtro para esquecer, que é o mesmo argumento pelo qual a §0.1 pede duas
 * coleções em vez de um campo discriminador. O preço é ler os cadastros de apoio
 * que os mapas usam e descartar; no volume deles, é barato.
 *
 * **Nada de `viagemRegistrada`** (§0.1). Esta tela lê `mobilidade`,
 * `viagemTrecho` e `embarque`, e nenhuma outra coleção de emissão.
 */
import type { Firestore } from 'firebase-admin/firestore'

import { ANO_BASE_INVENTARIO, anoBaseMobilidade } from '@/lib/env'
import { firestore } from '../firestore'
import { exigirVisaoGeral, type ContextoDeAcesso, type Modulo } from './acesso'
import { emToneladas, MESES_NO_ANO } from './agregacao'
import { consultarMaritimo, consultarMobilidade, consultarViagens } from './inventario'

/**
 * Uma fatia do consolidado: um módulo, o total dele no ano e a proporção.
 *
 * **`recorte` nulo é ausência, e `toneladas` zero é zero** (§9.10). As duas
 * coisas se parecem na tela e são opostas: um módulo sem recorte definido não
 * tem número, e um módulo com recorte e sem documento tem o número zero. Quem
 * desenha as duas do mesmo jeito transforma configuração faltando em medição.
 */
export type ModuloDaVisaoGeral = {
  modulo: Modulo
  rotulo: string
  toneladas: number
  proporcao: number
  /** Documentos que entraram no número — zero é zero medido, não ausência. */
  documentos: number
  /** O recorte que produziu o número; `null` quando não há recorte. */
  recorte: string | null
}

/** Um mês da série empilhada, em kg, com as três bandas e o total. */
export type MesDaVisaoGeral = {
  mes: string
  mobilidade: number
  viagens: number
  maritimo: number
  total: number
}

export type VisaoGeral = {
  ano: number
  totalToneladas: number
  porModulo: ModuloDaVisaoGeral[]
  /** Os doze meses do ano-base, sempre. A soma bate com o indicador (§10.0). */
  porMes: MesDaVisaoGeral[]
  /** O que o cartão da mobilidade declara: ano-base da pesquisa e respondentes. */
  mobilidade: { anoBase: number | null; respondentes: number }
  viagens: { trechos: number }
  maritimo: {
    embarques: number
    /** Agentes com detalhe por embarque; é daqui que sai a segunda declaração. */
    agentes: number
    /** Previsão, que fica fora do total aqui como fica no módulo (§8.3). */
    previsoes: { embarques: number; co2Kg: number }
  }
}

const ROTULO: Record<Modulo, string> = {
  mobilidade: 'Mobilidade casa-trabalho',
  viagens: 'Viagens corporativas',
  maritimo: 'Transporte marítimo',
}

/**
 * Folga de comparação das invariantes, em toneladas.
 *
 * Um grama. É folgado o bastante para a soma de centenas de parcelas em ponto
 * flutuante e apertado o bastante para que um mês perdido ou uma fatia fora da
 * conta reprovem: nenhuma das duas coisas erra por um grama.
 */
const FOLGA_T = 1e-6

export async function consultarVisaoGeral(
  ctx: ContextoDeAcesso,
  db: Firestore = firestore(),
): Promise<VisaoGeral> {
  // A visão geral é mais estreita que o inventário: quem vê um módulo só não vê
  // o consolidado, porque o consolidado dele não seria o consolidado (§5).
  exigirVisaoGeral(ctx)

  const ano = ANO_BASE_INVENTARIO
  const anoBaseDaPesquisa = anoBaseMobilidade()

  const [mobilidade, viagens, maritimo] = await Promise.all([
    // **Pelo ano-base da pesquisa, nunca pelo ano civil.** Sem ano-base não há
    // recorte, e o módulo entra como ausente em vez de entrar como zero.
    anoBaseDaPesquisa === null
      ? null
      : consultarMobilidade(ctx, { anoBase: anoBaseDaPesquisa }, db),
    consultarViagens(ctx, { ano }, db),
    // O marítimo entra recortado no ano: a série do módulo é contínua e começa
    // antes (§8.4). Documento fora do ano não move o indicador desta tela.
    consultarMaritimo(ctx, { ano }, db),
  ])

  const porModulo: ModuloDaVisaoGeral[] = [
    {
      modulo: 'mobilidade',
      rotulo: ROTULO.mobilidade,
      // Taxa mensal vira total anual aqui, de forma explícita (§9.3).
      toneladas: mobilidade?.co2ToneladasAno ?? 0,
      proporcao: 0,
      documentos: mobilidade?.respondentes ?? 0,
      recorte: anoBaseDaPesquisa === null ? null : `ano-base ${anoBaseDaPesquisa}`,
    },
    {
      modulo: 'viagens',
      rotulo: ROTULO.viagens,
      toneladas: viagens.co2Toneladas,
      proporcao: 0,
      documentos: viagens.trechos,
      recorte: `ano civil ${ano}`,
    },
    {
      modulo: 'maritimo',
      rotulo: ROTULO.maritimo,
      toneladas: maritimo.co2Toneladas,
      proporcao: 0,
      documentos: maritimo.embarques,
      recorte: `ano civil ${ano}`,
    },
  ]

  const totalToneladas = porModulo.reduce((s, m) => s + m.toneladas, 0)
  for (const m of porModulo) {
    m.proporcao = totalToneladas === 0 ? 0 : m.toneladas / totalToneladas
  }

  const porMes = montarSerie(ano, mobilidade?.co2KgMes ?? 0, viagens.porMes, maritimo.porMes)

  conferirSerie(porMes, totalToneladas)
  conferirFatias(porModulo, totalToneladas)

  return {
    ano,
    totalToneladas,
    porModulo,
    porMes,
    mobilidade: {
      anoBase: anoBaseDaPesquisa,
      respondentes: mobilidade?.respondentes ?? 0,
    },
    viagens: { trechos: viagens.trechos },
    maritimo: {
      embarques: maritimo.embarques,
      agentes: maritimo.agentes,
      previsoes: maritimo.previsoes,
    },
  }
}

/**
 * Os doze meses do ano-base, com as três bandas.
 *
 * **São sempre doze, e não o intervalo em que há dado.** A série dos módulos
 * começa no primeiro mês com emissão e termina no último (`serieMensal`), o que
 * é o certo lá dentro; aqui o ano é a unidade, e um ano desenhado com onze
 * colunas faria a soma da tela não bater com o indicador.
 *
 * **A mobilidade é a mesma taxa nos doze meses** (§9.5), e é por isso que ela se
 * declara sozinha quando a série é empilhada: banda plana não se confunde com
 * medição mensal.
 */
function montarSerie(
  ano: number,
  co2KgMobilidadeMes: number,
  viagens: { mes: string; co2Kg: number }[],
  maritimo: { mes: string; co2Kg: number }[],
): MesDaVisaoGeral[] {
  const deViagens = new Map(viagens.map((p) => [p.mes, p.co2Kg]))
  const deMaritimo = new Map(maritimo.map((p) => [p.mes, p.co2Kg]))

  return Array.from({ length: MESES_NO_ANO }, (_, i) => {
    const mes = `${ano}-${String(i + 1).padStart(2, '0')}`
    const daViagem = deViagens.get(mes) ?? 0
    const doMar = deMaritimo.get(mes) ?? 0
    return {
      mes,
      mobilidade: co2KgMobilidadeMes,
      viagens: daViagem,
      maritimo: doMar,
      total: co2KgMobilidadeMes + daViagem + doMar,
    }
  })
}

/**
 * **A soma dos doze meses é igual ao indicador principal** (§10.0).
 *
 * É invariante executável, no molde do `conferirTotal` da §9.10, e não um teste
 * apenas: um documento cujo mês caia fora do ano-base sumiria da série e
 * continuaria no total, e a tela desenharia doze colunas que somam menos do que
 * o número grande em cima delas. Nada estouraria — é exatamente a classe de erro
 * que só aparece em auditoria.
 */
function conferirSerie(porMes: MesDaVisaoGeral[], totalToneladas: number): void {
  const somado = emToneladas(porMes.reduce((s, m) => s + m.total, 0))
  if (Math.abs(somado - totalToneladas) > FOLGA_T) {
    throw new Error(
      `A série mensal não reproduz o indicador: os doze meses somam ${somado} t e o ` +
        `indicador é ${totalToneladas} t. Documento com mês fora do ano-base sumiria ` +
        'do gráfico e continuaria no total (§10.0).',
    )
  }
}

/**
 * **As três fatias somam o indicador** (§10.0).
 *
 * A faixa proporcional é a tradução visual do total, e fatia que não soma é
 * defeito, não arredondamento: um módulo que entrasse na faixa e não no total —
 * ou o contrário — daria uma barra que mede uma coisa sob um número que mede
 * outra.
 */
function conferirFatias(
  porModulo: ModuloDaVisaoGeral[],
  totalToneladas: number,
): void {
  const somado = porModulo.reduce((s, m) => s + m.toneladas, 0)
  if (Math.abs(somado - totalToneladas) > FOLGA_T) {
    throw new Error(
      `As fatias não somam o indicador: ${somado} t contra ${totalToneladas} t (§10.0).`,
    )
  }
  const proporcoes = porModulo.reduce((s, m) => s + m.proporcao, 0)
  if (totalToneladas > 0 && Math.abs(proporcoes - 1) > 1e-9) {
    throw new Error(
      `As proporções da faixa não fecham em 100%: ${proporcoes} (§10.0).`,
    )
  }
}

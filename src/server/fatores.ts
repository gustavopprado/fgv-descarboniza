/**
 * Resolução de fator de emissão por vigência — CLAUDE.md §9.8.
 *
 * Regra que não muda com o banco: **se o fator não estiver na coleção, o
 * cálculo falha explicitamente.** Nunca existe padrão implícito, nem número de
 * memória.
 *
 * A coleção é pequena, então ela é lida inteira uma vez e a vigência é filtrada
 * em JavaScript. No modelo relacional cada trecho fazia sua consulta; aqui isso
 * seriam centenas de leituras para responder sempre a mesma meia dúzia de
 * perguntas.
 */
import type { Firestore } from 'firebase-admin/firestore'

import type { FaixaDistancia, LimiteDeFaixa } from '@/lib/calculo/aereo'
import { CATEGORIA_AEREO_FAIXA_LIMITE } from '@/lib/calculo/categorias'
import { COLECAO } from './firestore'
import type { DocFatorEmissao, FatorAplicado } from './documentos/tipos'

export class FatorAusenteError extends Error {
  constructor(categoria: string, chave: string, data: string) {
    super(
      `Fator de emissão ausente: categoria="${categoria}" chave="${chave}" ` +
        `vigente em ${data}. Carregue a coleção fatorEmissao antes de calcular ` +
        `(scripts/seed-fatores.ts e scripts/seed-fatores-mobilidade.ts).`,
    )
    this.name = 'FatorAusenteError'
  }
}

export type ResolvedorDeFatores = {
  /** Fator vigente na data, pronto para ser carimbado no documento. */
  vigente: (categoria: string, chave: string, data: string) => FatorAplicado
  /** Quantos fatores foram carregados; serve ao relatório da carga. */
  readonly total: number
}

function chaveDoIndice(categoria: string, chave: string): string {
  return `${categoria}|${chave}`
}

/**
 * Lê a coleção inteira e devolve o resolvedor. Havendo mais de uma versão
 * vigente na mesma data, vence a de início mais recente.
 */
export async function carregarFatores(db: Firestore): Promise<ResolvedorDeFatores> {
  const instantaneo = await db.collection(COLECAO.fatorEmissao).get()

  const porChave = new Map<string, DocFatorEmissao[]>()
  for (const doc of instantaneo.docs) {
    const fator = doc.data() as DocFatorEmissao
    const id = chaveDoIndice(fator.categoria, fator.chave)
    const lista = porChave.get(id)
    if (lista) lista.push(fator)
    else porChave.set(id, [fator])
  }
  for (const lista of porChave.values()) {
    lista.sort((a, b) => b.vigenciaInicio.localeCompare(a.vigenciaInicio))
  }

  return {
    total: instantaneo.size,
    vigente(categoria, chave, data) {
      const candidatos = porChave.get(chaveDoIndice(categoria, chave)) ?? []
      const fator = candidatos.find(
        (f) =>
          f.vigenciaInicio <= data && (f.vigenciaFim === null || f.vigenciaFim >= data),
      )
      if (!fator) throw new FatorAusenteError(categoria, chave, data)

      return {
        categoria: fator.categoria,
        chave: fator.chave,
        versao: fator.versao,
        valor: fator.valor,
        unidade: fator.unidade,
        vigenciaInicio: fator.vigenciaInicio,
      }
    },
  }
}

/**
 * Os limites das faixas de distância, lidos da própria tabela de fatores.
 *
 * Os quilômetros que separam curta, média e longa **fazem parte da definição do
 * fator** e por isso moram na coleção, não no código: trocar a tabela sem trocar
 * os limites daria um número calculado com metade de cada versão.
 *
 * Vive aqui, e não dentro de um script, porque os dois caminhos que calculam
 * distância do zero precisam dele: a carga da planilha do cartão, no inventário,
 * e o formulário do programa de viagens. **É a matemática compartilhada de que
 * fala a §7.5** — o que não se compartilha é o dado.
 *
 * A faixa mais longa não tem teto, e a ausência do limite superior é o normal:
 * é por isso que ele é procurado e não exigido.
 */
export function limitesDeFaixa(
  fatores: ResolvedorDeFatores,
  data: string,
): LimiteDeFaixa[] {
  const ids: readonly FaixaDistancia[] = ['curta', 'media', 'longa']
  return ids.map((id) => {
    const minimo = fatores.vigente(CATEGORIA_AEREO_FAIXA_LIMITE, `${id}.min_km`, data)
    let maxKm: number | null = null
    try {
      maxKm = fatores.vigente(CATEGORIA_AEREO_FAIXA_LIMITE, `${id}.max_km`, data).valor
    } catch {
      maxKm = null
    }
    return { id, minKm: minimo.valor, maxKm }
  })
}

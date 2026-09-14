/**
 * Escrita em lote e recarga de período — CLAUDE.md §9.9.
 *
 * O modelo relacional apagava e reinseria dentro de uma transação. O Firestore
 * não tem `DELETE WHERE` nem transação do tamanho de uma carga, então a recarga
 * é feita em outra ordem, de propósito:
 *
 *   1. grava todos os documentos novos, sobrescrevendo pelo ID determinístico;
 *   2. só então apaga, do mesmo escopo, o que não está na carga nova.
 *
 * Apagar primeiro abriria uma janela com o inventário vazio — e se a escrita
 * falhasse no meio, o período ficaria sem dado nenhum. Nesta ordem o pior caso
 * é sobra de documento antigo, que a próxima execução limpa, e nunca falta.
 */
import type { Firestore, Query } from 'firebase-admin/firestore'

import { firestore, type NomeDeColecao } from './firestore'

/** O Firestore aceita 500 operações por lote; a folga evita surpresa. */
const LIMITE_DO_LOTE = 450

export type DocumentoParaGravar<T> = { id: string; dados: T }

/** Filtro de igualdade que delimita o escopo de uma recarga. */
export type FiltroDeEscopo = { campo: string; valor: unknown }

export type ResultadoDaRecarga = {
  gravados: number
  removidos: number
}

function emLotes<T>(itens: T[], tamanho = LIMITE_DO_LOTE): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < itens.length; i += tamanho) {
    lotes.push(itens.slice(i, i + tamanho))
  }
  return lotes
}

function aplicarEscopo(consulta: Query, escopo: FiltroDeEscopo[]): Query {
  return escopo.reduce((q, f) => q.where(f.campo, '==', f.valor), consulta)
}

/** Grava sobrescrevendo o documento inteiro. Sem merge: a carga é a verdade. */
export async function gravarEmLotes<T extends object>(
  colecao: NomeDeColecao,
  documentos: DocumentoParaGravar<T>[],
  db: Firestore = firestore(),
): Promise<number> {
  const ref = db.collection(colecao)
  for (const lote of emLotes(documentos)) {
    const escrita = db.batch()
    for (const { id, dados } of lote) {
      escrita.set(ref.doc(id), dados)
    }
    await escrita.commit()
  }
  return documentos.length
}

/** Apaga todos os documentos que casam com o escopo, em lotes. */
export async function apagarPorEscopo(
  colecao: NomeDeColecao,
  escopo: FiltroDeEscopo[],
  db: Firestore = firestore(),
): Promise<number> {
  const ids = await idsNoEscopo(colecao, escopo, db)
  await apagarIds(colecao, ids, db)
  return ids.length
}

async function idsNoEscopo(
  colecao: NomeDeColecao,
  escopo: FiltroDeEscopo[],
  db: Firestore,
): Promise<string[]> {
  // `select()` sem campo devolve só a referência: não traz o documento inteiro
  // para a memória só para saber que ele existe.
  const consulta = aplicarEscopo(db.collection(colecao), escopo).select()
  const instantaneo = await consulta.get()
  return instantaneo.docs.map((d) => d.id)
}

async function apagarIds(
  colecao: NomeDeColecao,
  ids: string[],
  db: Firestore,
): Promise<void> {
  const ref = db.collection(colecao)
  for (const lote of emLotes(ids)) {
    const escrita = db.batch()
    for (const id of lote) escrita.delete(ref.doc(id))
    await escrita.commit()
  }
}

/**
 * Substitui um período inteiro de uma coleção.
 *
 * `escopo` delimita o que a carga é dona — o ano-base da mobilidade, a fonte
 * `agencia` das viagens. Documento fora do escopo não é tocado: é assim que
 * recarregar o histórico da agência não encosta no que veio do formulário.
 *
 * Recusa carga vazia por padrão. Uma carga que não produziu documento nenhum é,
 * quase sempre, erro de leitura do arquivo — e apagaria o período inteiro sem
 * nada no lugar. Para esvaziar de propósito, passe `permitirVazio`.
 */
export async function recarregarEscopo<T extends object>(opcoes: {
  colecao: NomeDeColecao
  escopo: FiltroDeEscopo[]
  documentos: DocumentoParaGravar<T>[]
  permitirVazio?: boolean
  db?: Firestore
}): Promise<ResultadoDaRecarga> {
  const { colecao, escopo, documentos, permitirVazio = false } = opcoes

  // As duas guardas vêm antes de qualquer conexão: uma carga malformada tem que
  // falhar dizendo o que está errado, não por falta de credencial.
  if (documentos.length === 0 && !permitirVazio) {
    throw new Error(
      `Recarga de "${colecao}" não produziu nenhum documento. Isso apagaria o ` +
        'escopo inteiro sem nada no lugar — quase sempre é erro de leitura do ' +
        'arquivo. Se a intenção é mesmo esvaziar, use permitirVazio.',
    )
  }

  const repetidos = documentos.length - new Set(documentos.map((d) => d.id)).size
  if (repetidos > 0) {
    throw new Error(
      `Recarga de "${colecao}" tem ${repetidos} ID repetido(s): um documento ` +
        'sobrescreveria o outro em silêncio. Confira a regra de identificação.',
    )
  }

  const db = opcoes.db ?? firestore()
  const existentes = await idsNoEscopo(colecao, escopo, db)

  await gravarEmLotes(colecao, documentos, db)

  const novos = new Set(documentos.map((d) => d.id))
  const obsoletos = existentes.filter((id) => !novos.has(id))
  await apagarIds(colecao, obsoletos, db)

  return { gravados: documentos.length, removidos: obsoletos.length }
}

/**
 * Grava documentos de apoio sem apagar nada — aeroportos, municípios,
 * funcionários. São cadastros cumulativos, não um período que se substitui.
 */
export async function gravarCadastro<T extends object>(
  colecao: NomeDeColecao,
  documentos: DocumentoParaGravar<T>[],
  db: Firestore = firestore(),
): Promise<number> {
  return gravarEmLotes(colecao, documentos, db)
}

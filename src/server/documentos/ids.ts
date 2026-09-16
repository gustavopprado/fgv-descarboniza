/**
 * IDs de documento determinísticos — CLAUDE.md §9.1.
 *
 * O ID é derivado da origem, então recarregar sobrescreve em vez de duplicar.
 * É isto que substitui o índice único do modelo relacional: sem ele, rodar a
 * carga duas vezes dobraria o inventário em silêncio.
 */

/**
 * O Firestore recusa `/` no ID, recusa `.` e `..` sozinhos, reserva o prefixo
 * `__` e limita o ID a 1500 bytes.
 *
 * A substituição precisa ser injetiva o bastante para não colar duas origens
 * diferentes no mesmo documento — por isso o caractere trocado vira `-` e o
 * separador dos campos é `_`, que não é produzido pela limpeza.
 */
export function sanitizarSegmento(valor: string): string {
  const limpo = valor
    .normalize('NFC')
    .trim()
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[/\\*[\]#?\s]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')

  if (limpo === '' || limpo === '.' || limpo === '..') {
    throw new Error(`Segmento de ID inválido: "${valor}"`)
  }
  if (limpo.startsWith('__')) {
    throw new Error(`Segmento de ID não pode começar com "__": "${valor}"`)
  }
  return limpo
}

function montar(...partes: (string | number)[]): string {
  const id = partes.map((p) => sanitizarSegmento(String(p))).join('_')
  if (Buffer.byteLength(id, 'utf8') > 1500) {
    throw new Error(`ID de documento excede o limite do Firestore: ${id.slice(0, 80)}…`)
  }
  return id
}

/**
 * Funcionário: matrícula quando existe; senão, a chave da base de origem. A
 * base de viagens não traz matrícula, e a de mobilidade traz.
 */
export function idFuncionario(chave: {
  matricula?: string | null
  chaveOrigem?: string | null
}): string {
  if (chave.matricula) return montar('mat', chave.matricula)
  if (chave.chaveOrigem) return montar('org', chave.chaveOrigem)
  throw new Error('Funcionário precisa de matrícula ou de chave de origem para ter ID.')
}

/** Uma resposta por pessoa por ano-base. */
export function idMobilidade(anoBase: number, matricula: string): string {
  return montar(anoBase, matricula)
}

/** Um documento por trecho; a reserva de origem mais a ordem identificam. */
export function idViagemTrecho(
  fonte: string,
  refOrigem: string,
  ordem: number,
): string {
  return montar(fonte, refOrigem, ordem)
}

/**
 * Viagem registrada pelo colaborador — programa, não inventário (§0.1).
 *
 * O ID do inventário é derivado do arquivo de origem, porque é recarregar o
 * arquivo que precisa sobrescrever. Aqui não existe arquivo: a origem é quem
 * registrou, e é por isso que o uid entra na chave. Assim uma submissão editada
 * substitui a anterior, e duas pessoas nunca colidem num mesmo identificador de
 * viagem.
 */
export function idViagemRegistrada(
  criadoPorUid: string,
  reservaId: string,
  ordem: number,
): string {
  return montar(criadoPorUid, reservaId, ordem)
}

export function idEmbarque(agente: string, shipmentId: string): string {
  return montar(agente, shipmentId)
}

/**
 * O fator é identificado por categoria, chave, versão e início de vigência —
 * os mesmos quatro campos do índice único anterior. Recarregar a mesma versão
 * atualiza a linha, em vez de criar uma segunda vigência idêntica.
 */
export function idFatorEmissao(
  categoria: string,
  chave: string,
  versao: string,
  vigenciaInicio: string,
): string {
  return [categoria, chave, versao, vigenciaInicio]
    .map((p) => sanitizarSegmento(p))
    .join('__')
}

export function idContainerPortoMes(mes: string, porto: string): string {
  return montar(mes, porto)
}

/** Aeroporto e município já têm identificador natural e estável. */
export function idAeroporto(iata: string): string {
  return sanitizarSegmento(iata.toUpperCase())
}

export function idMunicipio(codigoIbge: string): string {
  return sanitizarSegmento(codigoIbge)
}

/** Rota: a sequência ordenada de códigos IBGE é a própria chave (§7.4). */
export function idRotaCache(sequenciaIbge: string[]): string {
  if (sequenciaIbge.length < 2) {
    throw new Error('Uma rota precisa de pelo menos dois municípios.')
  }
  return sequenciaIbge.map((c) => sanitizarSegmento(c)).join('-')
}

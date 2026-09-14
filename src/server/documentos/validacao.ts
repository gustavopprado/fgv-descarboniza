/**
 * Validação de escrita — CLAUDE.md §9.9.
 *
 * O modelo relacional recusava dado inválido sozinho. O Firestore aceita
 * qualquer coisa, então **estas regras só existem porque estão aqui**. Toda
 * escrita nas coleções de emissão passa por este módulo; nada grava direto.
 *
 * A validação falha alto e para a carga. Não corrige, não arredonda e não
 * assume padrão: dado que não se entende não entra no inventário.
 */
import type {
  DocEmbarque,
  DocFatorEmissao,
  DocMobilidade,
  DocViagemTrecho,
  EnvelopeEmissao,
} from './tipos'

export class DocumentoInvalidoError extends Error {
  constructor(
    readonly colecao: string,
    readonly id: string,
    readonly campo: string,
    motivo: string,
  ) {
    super(`${colecao}/${id}: campo "${campo}" ${motivo}`)
    this.name = 'DocumentoInvalidoError'
  }
}

type Contexto = { colecao: string; id: string }

function falhar(ctx: Contexto, campo: string, motivo: string): never {
  throw new DocumentoInvalidoError(ctx.colecao, ctx.id, campo, motivo)
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/
const MES_ISO = /^\d{4}-\d{2}$/

export function ehDataIso(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !DATA_ISO.test(valor)) return false
  const [ano, mes, dia] = valor.split('-').map(Number)
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false
  // Pega 31/02 e afins: o Date normalizaria em silêncio.
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia
}

function exigirData(ctx: Contexto, campo: string, valor: unknown): void {
  if (!ehDataIso(valor)) {
    falhar(ctx, campo, `não é uma data AAAA-MM-DD válida: ${JSON.stringify(valor)}`)
  }
}

function exigirDataOuNulo(ctx: Contexto, campo: string, valor: unknown): void {
  if (valor === null) return
  exigirData(ctx, campo, valor)
}

function exigirInteiroPositivo(ctx: Contexto, campo: string, valor: unknown): void {
  if (!Number.isInteger(valor) || (valor as number) < 1) {
    falhar(ctx, campo, `precisa ser inteiro ≥ 1: ${JSON.stringify(valor)}`)
  }
}

function exigirNumeroNaoNegativo(ctx: Contexto, campo: string, valor: unknown): void {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0) {
    falhar(ctx, campo, `precisa ser número finito ≥ 0: ${JSON.stringify(valor)}`)
  }
}

/**
 * `undefined` em qualquer profundidade é erro.
 *
 * O Admin SDK recusaria o documento, mas a mensagem dele não diz qual campo é.
 * Além disso, campo ausente precisa ser `null` explícito para continuar visível
 * na agregação (§9.10) — é a diferença entre "sem empresa" e "registro que
 * sumiu do total".
 */
export function exigirSemUndefined(
  ctx: Contexto,
  valor: unknown,
  caminho = '',
): void {
  if (valor === undefined) {
    falhar(ctx, caminho || '(raiz)', 'está undefined; use null explícito')
  }
  if (valor === null || typeof valor !== 'object') return
  if (Array.isArray(valor)) {
    valor.forEach((item, i) => exigirSemUndefined(ctx, item, `${caminho}[${i}]`))
    return
  }
  for (const [chave, item] of Object.entries(valor)) {
    exigirSemUndefined(ctx, item, caminho ? `${caminho}.${chave}` : chave)
  }
}

/* ------------------------------------------------------ envelope de emissão */

function validarEnvelope(
  ctx: Contexto,
  doc: EnvelopeEmissao,
  emissao: number,
  dataDeReferencia: string | null,
): void {
  exigirSemUndefined(ctx, doc)

  if (doc.escopo !== 1 && doc.escopo !== 3) {
    falhar(ctx, 'escopo', `só pode ser 1 ou 3: ${JSON.stringify(doc.escopo)}`)
  }
  if (!Number.isInteger(doc.ano) || doc.ano < 2000 || doc.ano > 2100) {
    falhar(ctx, 'ano', `fora da faixa aceitável: ${JSON.stringify(doc.ano)}`)
  }
  if (doc.mes !== null && !MES_ISO.test(doc.mes)) {
    falhar(ctx, 'mes', `não é AAAA-MM nem nulo: ${JSON.stringify(doc.mes)}`)
  }
  if (doc.mes !== null && Number(doc.mes.slice(0, 4)) !== doc.ano) {
    falhar(ctx, 'mes', `não pertence ao ano ${doc.ano}: ${doc.mes}`)
  }

  // Ano e mês precisam bater com a data de referência do próprio documento,
  // senão o corte por período mente sem nenhum sinal.
  if (dataDeReferencia !== null) {
    exigirData(ctx, 'dataDeReferencia', dataDeReferencia)
    if (Number(dataDeReferencia.slice(0, 4)) !== doc.ano) {
      falhar(ctx, 'ano', `não bate com a data de referência ${dataDeReferencia}`)
    }
    if (doc.mes !== null && dataDeReferencia.slice(0, 7) !== doc.mes) {
      falhar(ctx, 'mes', `não bate com a data de referência ${dataDeReferencia}`)
    }
  }

  exigirNumeroNaoNegativo(ctx, 'emissao', emissao)

  // Fator nulo só se sustenta onde a emissão é zero por definição (§6.2).
  if (doc.fator === null && emissao !== 0) {
    falhar(ctx, 'fator', 'está nulo, mas a emissão não é zero')
  }
  if (doc.fator !== null) {
    exigirNumeroNaoNegativo(ctx, 'fator.valor', doc.fator.valor)
    exigirData(ctx, 'fator.vigenciaInicio', doc.fator.vigenciaInicio)
    if (!doc.fator.versao) {
      falhar(ctx, 'fator.versao', 'está vazia; o inventário precisa ser auditável')
    }
  }

  if (!Array.isArray(doc.alertas) || !Array.isArray(doc.alertasCodigos)) {
    falhar(ctx, 'alertas', 'precisa ser array em ambos os campos')
  }
  const esperados = [...new Set(doc.alertas.map((a) => a.tipo))].sort()
  const recebidos = [...doc.alertasCodigos].sort()
  if (esperados.join('|') !== recebidos.join('|')) {
    falhar(
      ctx,
      'alertasCodigos',
      'não reflete os tipos de `alertas`; a consulta por código ficaria incompleta',
    )
  }

  exigirData(ctx, 'atualizadoEm', doc.atualizadoEm)
}

/* --------------------------------------------------------------- coleções */

export function validarMobilidade(id: string, doc: DocMobilidade): void {
  const ctx = { colecao: 'mobilidade', id }

  if (doc.periodicidade !== 'mensal') {
    falhar(ctx, 'periodicidade', 'mobilidade é taxa mensal, não evento')
  }
  if (doc.mes !== null) {
    falhar(ctx, 'mes', 'a pesquisa é anual; o valor vale para todo mês do ano-base')
  }
  validarEnvelope(ctx, doc, doc.co2KgMes, null)

  if (doc.anoBase !== doc.ano) {
    falhar(ctx, 'anoBase', `difere de ano: ${doc.anoBase} ≠ ${doc.ano}`)
  }
  exigirNumeroNaoNegativo(ctx, 'distanciaKm', doc.distanciaKm)
  exigirInteiroPositivo(ctx, 'diasUteisMes', doc.diasUteisMes)
  if (!doc.funcionarioId) falhar(ctx, 'funcionarioId', 'está vazio')

  // Exceção fica fora da média, então precisa dizer por quê — é o que a tela de
  // método lista (§6.2).
  if (doc.excecao && !doc.motivoExcecao) {
    falhar(ctx, 'motivoExcecao', 'é obrigatório quando a resposta é exceção')
  }
  if (!doc.excecao && doc.motivoExcecao) {
    falhar(ctx, 'motivoExcecao', 'só faz sentido em resposta marcada como exceção')
  }
}

export function validarViagemTrecho(id: string, doc: DocViagemTrecho): void {
  const ctx = { colecao: 'viagemTrecho', id }

  if (doc.periodicidade !== 'evento') {
    falhar(ctx, 'periodicidade', 'viagem é evento, não taxa mensal')
  }
  const referencia = doc.dataVoo ?? doc.dataIda
  validarEnvelope(ctx, doc, doc.co2Kg, referencia)

  if (!doc.reservaId) falhar(ctx, 'reservaId', 'está vazio; é o que liga os trechos')
  if (!doc.funcionarioId) falhar(ctx, 'funcionarioId', 'está vazio')
  exigirInteiroPositivo(ctx, 'ordem', doc.ordem)
  exigirInteiroPositivo(ctx, 'passageiros', doc.passageiros)
  exigirNumeroNaoNegativo(ctx, 'distanciaKm', doc.distanciaKm)
  exigirData(ctx, 'dataIda', doc.dataIda)
  exigirDataOuNulo(ctx, 'dataVolta', doc.dataVolta)
  exigirDataOuNulo(ctx, 'dataVoo', doc.dataVoo)

  if (doc.modal !== (doc.tipo === 'aereo' ? 'aereo' : 'terrestre')) {
    falhar(ctx, 'modal', `não corresponde ao tipo "${doc.tipo}"`)
  }

  // Frota é Escopo 1; próprio e locado são Escopo 3 (§7.3).
  if (doc.propriedadeVeiculo !== null) {
    const esperado = doc.propriedadeVeiculo === 'frota' ? 1 : 3
    if (doc.escopo !== esperado) {
      falhar(
        ctx,
        'escopo',
        `veículo "${doc.propriedadeVeiculo}" exige escopo ${esperado}, veio ${doc.escopo}`,
      )
    }
  }
  if (doc.ocupantes !== null) exigirInteiroPositivo(ctx, 'ocupantes', doc.ocupantes)

  // Os dois termos da conta andam juntos: fator por faixa e multiplicador de
  // classe. Um sem o outro deixa o trecho impossível de reproduzir.
  if (doc.multiplicadorClasse !== null) {
    if (typeof doc.multiplicadorClasse !== 'number' || doc.multiplicadorClasse <= 0) {
      falhar(ctx, 'multiplicadorClasse', 'precisa ser número > 0')
    }
    if (!doc.classeCabine) {
      falhar(ctx, 'classeCabine', 'é obrigatória quando há multiplicador de classe')
    }
  }
  if (doc.tipo === 'aereo' && doc.multiplicadorClasse === null && doc.co2Kg !== 0) {
    falhar(ctx, 'multiplicadorClasse', 'é obrigatório no aéreo com emissão')
  }

  if (doc.tipo === 'aereo' && doc.dataVoo === null) {
    falhar(ctx, 'dataVoo', 'é obrigatória no aéreo: é ela que define o mês (§7.2)')
  }
}

export function validarEmbarque(id: string, doc: DocEmbarque): void {
  const ctx = { colecao: 'embarque', id }

  if (doc.periodicidade !== 'evento') {
    falhar(ctx, 'periodicidade', 'embarque é evento, não taxa mensal')
  }
  validarEnvelope(ctx, doc, doc.co2Kg, null)

  if (!doc.agente) falhar(ctx, 'agente', 'está vazio')
  if (!doc.shipmentId) falhar(ctx, 'shipmentId', 'está vazio')
  for (const campo of ['etd', 'eta', 'atd', 'ata'] as const) {
    exigirDataOuNulo(ctx, campo, doc[campo])
  }
  for (const campo of ['pesoKg', 'volumeM3', 'containers'] as const) {
    if (doc[campo] !== null) exigirNumeroNaoNegativo(ctx, campo, doc[campo])
  }
  if (doc.modal !== 'maritimo' && doc.modal !== 'aereo') {
    falhar(ctx, 'modal', 'no módulo marítimo só existe modal marítimo ou aéreo')
  }
}

export function validarFatorEmissao(id: string, doc: DocFatorEmissao): void {
  const ctx = { colecao: 'fatorEmissao', id }
  exigirSemUndefined(ctx, doc)

  for (const campo of ['categoria', 'chave', 'unidade', 'fonte', 'versao'] as const) {
    if (!doc[campo]) falhar(ctx, campo, 'está vazio')
  }
  exigirNumeroNaoNegativo(ctx, 'valor', doc.valor)
  exigirData(ctx, 'vigenciaInicio', doc.vigenciaInicio)
  exigirDataOuNulo(ctx, 'vigenciaFim', doc.vigenciaFim)
  if (doc.vigenciaFim !== null && doc.vigenciaFim < doc.vigenciaInicio) {
    falhar(ctx, 'vigenciaFim', `é anterior ao início: ${doc.vigenciaFim} < ${doc.vigenciaInicio}`)
  }
}

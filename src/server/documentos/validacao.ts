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
import { ehFilial, FILIAIS } from '@/lib/transportadoras'
import type {
  DocEmbarque,
  DocEntregaRodoviaria,
  DocFatorEmissao,
  DocMobilidade,
  DocPorto,
  DocViagemRegistrada,
  DocViagemTrecho,
  NucleoDeEmissao,
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

/**
 * Confere o que inventário e programa têm em comum: escopo, período, fator
 * carimbado e alertas. Recebe o núcleo, e não o envelope do inventário, porque
 * nenhuma destas regras depende de `modulo`, `periodicidade` ou `empresa` — e é
 * o que permite ao programa de viagens ser validado com o mesmo rigor sem
 * ganhar campo de inventário (§0.1).
 */
function validarEnvelope(
  ctx: Contexto,
  doc: NucleoDeEmissao,
  emissao: number,
  dataDeReferencia: string | null,
  /**
   * Dispensa o fator, sem dispensar a auditabilidade.
   *
   * Existe para um caso só, e ele é do marítimo: ali a emissão **medida** não
   * vem de fator × atividade — ela vem informada pelo agente, e é o dado
   * primário (§8.1). Exigir fator nesse documento obrigaria a inventar um, e
   * fator inventado é pior que fator ausente.
   *
   * Quem passa isto assume a outra metade: a coleção que dispensa o fator
   * precisa carimbar de onde o número veio por outro caminho, e é a validação
   * daquela coleção que confere. Ver `validarEmbarque`.
   */
  opcoes: { fatorDispensado?: boolean } = {},
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

  // Fator nulo só se sustenta onde a emissão é zero por definição (§6.2) — ou
  // onde a emissão não vem de fator nenhum, que é o caso do embarque medido.
  if (doc.fator === null && emissao !== 0 && opcoes.fatorDispensado !== true) {
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

  // **A §0.1 vira invariante executável aqui.** O inventário tem duas fontes,
  // ambas administrativas; o formulário do viajante alimenta `viagemRegistrada`
  // e nada mais. Somar autodeclaração voluntária a fonte administrativa
  // completa produz série que mede adesão e parece medir emissão — e um erro
  // desses não estoura em lugar nenhum, então precisa estourar aqui.
  if (doc.fonte !== 'agencia' && doc.fonte !== 'cartao') {
    falhar(
      ctx,
      'fonte',
      `"${String(doc.fonte)}" não é fonte do inventário; o programa de viagens ` +
        'grava em viagemRegistrada (§0.1)',
    )
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

/**
 * Viagem registrada pelo colaborador — programa, não inventário (§0.1, §7.5).
 *
 * As regras da §9.9 valem inteiras aqui: o dado do programa não entra no
 * inventário, mas é dado de emissão calculado com os mesmos fatores, e nada
 * justifica validá-lo mais frouxo.
 *
 * Duas diferenças, e as duas vêm da natureza da coleção:
 *
 *  - **`criadoPorUid` é obrigatório.** No inventário ele nem existe; aqui ele é
 *    o controle de acesso do `colaborador` (§5.1). Documento sem dono ficaria
 *    invisível para quem o escreveu;
 *  - **a data de volta não pode anteceder a de ida.** Esta é a única coleção
 *    preenchida à mão por gente usando a aplicação, e é onde erro de digitação
 *    chega. As outras vêm de carga conferida.
 */
export function validarViagemRegistrada(id: string, doc: DocViagemRegistrada): void {
  const ctx = { colecao: 'viagemRegistrada', id }

  validarEnvelope(ctx, doc, doc.co2Kg, doc.dataIda)

  if (!doc.criadoPorUid) {
    falhar(ctx, 'criadoPorUid', 'está vazio; é ele que dá dono à submissão (§5.1)')
  }
  if (!doc.reservaId) falhar(ctx, 'reservaId', 'está vazio; é o que liga os trechos')
  exigirInteiroPositivo(ctx, 'ordem', doc.ordem)
  exigirNumeroNaoNegativo(ctx, 'distanciaKm', doc.distanciaKm)
  exigirData(ctx, 'dataIda', doc.dataIda)
  exigirDataOuNulo(ctx, 'dataVolta', doc.dataVolta)
  if (doc.dataVolta !== null && doc.dataVolta < doc.dataIda) {
    falhar(ctx, 'dataVolta', `antecede a ida: ${doc.dataVolta} < ${doc.dataIda}`)
  }

  if (doc.modal !== (doc.tipo === 'aereo' ? 'aereo' : 'terrestre')) {
    falhar(ctx, 'modal', `não corresponde ao tipo "${doc.tipo}"`)
  }

  // Frota é Escopo 1; próprio e locado são Escopo 3 (§7.5).
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

  // Os dois termos da conta aérea andam juntos, como no inventário: sem eles a
  // emissão do trecho não é reproduzível a partir do documento.
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
}

export function validarEmbarque(id: string, doc: DocEmbarque): void {
  const ctx = { colecao: 'embarque', id }

  if (doc.periodicidade !== 'evento') {
    falhar(ctx, 'periodicidade', 'embarque é evento, não taxa mensal')
  }

  const medido = doc.nivelDado === 'medido'
  validarEnvelope(ctx, doc, doc.co2Kg, doc.etd, { fatorDispensado: medido })

  if (!doc.agente) falhar(ctx, 'agente', 'está vazio')
  if (!doc.bloco) falhar(ctx, 'bloco', 'está vazio; é o escopo de recarga (§8.4)')
  if (!doc.shipmentId) falhar(ctx, 'shipmentId', 'está vazio')
  for (const campo of ['etd', 'eta', 'atd', 'ata', 'ataFinal'] as const) {
    exigirDataOuNulo(ctx, campo, doc[campo])
  }
  for (const campo of ['pesoKg', 'volumeM3', 'containers'] as const) {
    if (doc[campo] !== null) exigirNumeroNaoNegativo(ctx, campo, doc[campo])
  }
  if (doc.modal !== 'maritimo' && doc.modal !== 'aereo') {
    falhar(ctx, 'modal', 'no módulo marítimo só existe modal marítimo ou aéreo')
  }

  /**
   * **A cascata da §8.2, em código.** As duas metades são simétricas de
   * propósito, e cada uma fecha um buraco diferente:
   *
   *  - **medido** é o número do agente, e não tem fator. O que o torna auditável
   *    são o agente, o bloco de origem e o identificador do embarque, que já são
   *    campos deste documento. Fator preenchido aqui seria afirmar uma conta que
   *    não aconteceu.
   *  - **estimado** é média × atividade, e **precisa** carregar a média usada,
   *    com a versão e o tamanho da amostra. Sem isso, a estimativa não é
   *    reproduzível a partir do documento — e recalculá-la depois, sobre uma
   *    base maior, daria outro número sem ninguém notar (§9.1).
   */
  if (medido) {
    if (doc.fator !== null) {
      falhar(ctx, 'fator', 'em nivelDado "medido" o número é do agente, não de fator')
    }
    if (doc.baseDaEstimativa !== null) {
      falhar(ctx, 'baseDaEstimativa', 'em nivelDado "medido" não há média a declarar')
    }
  } else {
    if (doc.fator === null) {
      falhar(ctx, 'fator', `nivelDado "${doc.nivelDado}" precisa carimbar a média usada`)
    }
    exigirInteiroPositivo(ctx, 'baseDaEstimativa', doc.baseDaEstimativa)
  }

  if (doc.containers !== null && doc.containersFonte === null) {
    falhar(ctx, 'containersFonte', 'há contagem de contêineres sem dizer de onde veio')
  }
}

/**
 * Uma entrega da distribuição rodoviária — CLAUDE.md §9 e §10.11.
 *
 * Três regras são próprias deste módulo, e cada uma fecha uma porta que o
 * Firestore deixaria aberta:
 *
 *  - **a filial precisa ser uma das três** (§9.4). Código novo não é linha a
 *    aceitar: é a lista de filiais desatualizada, e um quarto código gravado
 *    apareceria no agregado como uma filial que a tela não sabe desenhar;
 *  - **o regime de frete só admite os três valores**, e hoje ele é `indefinido`
 *    em todo documento, porque a origem mistura CIF e FOB sem separá-los
 *    (§9.1). Texto livre aqui deixaria a modalidade impossível de agrupar no
 *    dia em que ela vier por linha;
 *  - **o fator é obrigatório, mesmo com emissão zero.** No envelope, fator nulo
 *    se sustenta onde a emissão é zero por definição — bicicleta, a pé. Aqui não
 *    existe entrega que não emita por definição: o zero vem de peso zero, e a
 *    conta continua sendo fator × atividade. Sem o fator carimbado, a linha
 *    deixaria de ser reproduzível a partir do documento (§10.1).
 */
export function validarEntregaRodoviaria(id: string, doc: DocEntregaRodoviaria): void {
  const ctx = { colecao: 'entregaRodoviaria', id }

  if (doc.periodicidade !== 'evento') {
    falhar(ctx, 'periodicidade', 'entrega é evento, não taxa mensal')
  }
  if (doc.modal !== 'rodoviario') {
    falhar(ctx, 'modal', `neste módulo só existe modal rodoviário: ${String(doc.modal)}`)
  }

  validarEnvelope(ctx, doc, doc.co2Kg, doc.data)

  // Frete que a empresa paga e não opera é Escopo 3 — a categoria é que está em
  // aberto entre a 4 e a 9 (§9.1), e categoria não é escopo.
  if (doc.escopo !== 3) {
    falhar(ctx, 'escopo', 'frete de terceiro é Escopo 3, seja cat. 4 ou cat. 9')
  }
  if (!ehFilial(doc.filial)) {
    falhar(
      ctx,
      'filial',
      `"${String(doc.filial)}" não está entre as conhecidas (${FILIAIS.join(', ')})`,
    )
  }
  if (doc.regimeFrete !== 'cif' && doc.regimeFrete !== 'fob' && doc.regimeFrete !== 'indefinido') {
    falhar(ctx, 'regimeFrete', `só pode ser cif, fob ou indefinido: ${String(doc.regimeFrete)}`)
  }
  if (doc.nivelDado !== 'calculado_tkm') {
    falhar(ctx, 'nivelDado', `neste módulo o número é calculado por tonelada-quilômetro: ${String(doc.nivelDado)}`)
  }

  exigirData(ctx, 'data', doc.data)
  exigirInteiroPositivo(ctx, 'ordem', doc.ordem)
  exigirNumeroNaoNegativo(ctx, 'distanciaKm', doc.distanciaKm)
  exigirNumeroNaoNegativo(ctx, 'pesoKg', doc.pesoKg)

  if (doc.fator === null) {
    falhar(
      ctx,
      'fator',
      'é obrigatório aqui: a emissão da entrega é sempre fator médio × ' +
        'tonelada-quilômetro, e sem o carimbo a linha não se reproduz (§9.2)',
    )
  }
}

export function validarPorto(id: string, doc: DocPorto): void {
  const ctx = { colecao: 'porto', id }
  exigirSemUndefined(ctx, doc)

  if (!/^[A-Z]{2}[A-Z0-9]{3}$/.test(doc.locode)) {
    falhar(ctx, 'locode', `não tem a forma de um código UN/LOCODE: ${JSON.stringify(doc.locode)}`)
  }
  if (!doc.nome) falhar(ctx, 'nome', 'está vazio')
  if (!doc.pais) falhar(ctx, 'pais', 'está vazio')
  if (!doc.fonte) falhar(ctx, 'fonte', 'está vazia; o cadastro precisa ser auditável')

  /**
   * Coordenada é opcional, mas **meia coordenada não existe**: um lado nulo e o
   * outro preenchido desenharia o ponto sobre o meridiano ou sobre a linha do
   * equador, que é um lugar plausível e errado.
   */
  const temLat = doc.latitude !== null
  const temLon = doc.longitude !== null
  if (temLat !== temLon) {
    falhar(ctx, 'latitude', 'coordenada pela metade: ou as duas ou nenhuma')
  }
  if (temLat) {
    if (typeof doc.latitude !== 'number' || Math.abs(doc.latitude) > 90) {
      falhar(ctx, 'latitude', `fora da faixa: ${JSON.stringify(doc.latitude)}`)
    }
    if (typeof doc.longitude !== 'number' || Math.abs(doc.longitude) > 180) {
      falhar(ctx, 'longitude', `fora da faixa: ${JSON.stringify(doc.longitude)}`)
    }
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

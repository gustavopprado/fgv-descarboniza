/**
 * Formato dos documentos do Firestore — CLAUDE.md §9.
 *
 * O Firestore aceita qualquer coisa. Estes tipos, junto da validação de escrita
 * em `validacao.ts`, são o que substitui o que o banco relacional recusava
 * sozinho: enum, CHECK, chave estrangeira e índice único.
 *
 * Duas regras atravessam o arquivo inteiro:
 *  - **campo ausente é `null` explícito, nunca `undefined`.** Nulo é categoria
 *    visível na agregação (§9.10); campo que some do documento vira registro
 *    que desaparece do total sem ninguém perceber;
 *  - **data é string `AAAA-MM-DD`**, nunca `Timestamp` (§9.1).
 */
import type { FaixaDistancia } from '@/lib/calculo/aereo'
import type { Combustivel, Transporte } from '@/lib/calculo/mobilidade'

/** `AAAA-MM-DD`. */
export type DataIso = string
/** `AAAA-MM`. */
export type MesIso = string

export type Modulo = 'mobilidade' | 'viagens' | 'maritimo'
export type Modal = 'aereo' | 'terrestre' | 'maritimo'
export type Periodicidade = 'mensal' | 'evento'
export type Escopo = 1 | 3
export type Severidade = 'informativo' | 'atencao' | 'erro'

export type Papel =
  | 'admin'
  | 'sustentabilidade'
  | 'gestor'
  | 'importacao'
  | 'colaborador'

/**
 * De onde o trecho veio (§7).
 *
 * `agencia` é o relatório da agência, histórico e congelado. `formulario` é o
 * viajante, a partir da data de corte. `cartao` é a planilha do cartão
 * empresarial: viagem que não passa pela agência e por isso não está na base
 * histórica — fonte separada, recarregável sem encostar nas outras duas.
 */
export type FonteDaViagem = 'agencia' | 'formulario' | 'cartao'
export type TipoDeViagem = 'aereo' | 'carro'
export type PropriedadeVeiculo = 'frota' | 'proprio' | 'locado'
export type NivelDado =
  | 'medido'
  | 'estimado_corredor'
  | 'estimado_media'
  | 'estimado_peso'

export type Alerta = {
  tipo: string
  descricao: string
  severidade: Severidade
}

/**
 * O fator que produziu a emissão deste documento, copiado no momento do cálculo.
 * Fator muda todo ano: sem a marca da versão não há como saber, depois, o que
 * foi calculado com o quê (§9.1).
 */
export type FatorAplicado = {
  categoria: string
  chave: string
  versao: string
  valor: number
  unidade: string
  vigenciaInicio: DataIso
}

/**
 * Comum às três coleções de emissão (§9.4).
 *
 * `fator` é nulo apenas onde a emissão é zero por definição — bicicleta, a pé e
 * "outro" não têm fator, têm regra (§6.2). A validação exige que emissão nula
 * acompanhe fator nulo, e vice-versa.
 */
export type EnvelopeEmissao = {
  modulo: Modulo
  modal: Modal
  escopo: Escopo
  periodicidade: Periodicidade
  ano: number
  mes: MesIso | null
  empresa: string | null
  fator: FatorAplicado | null
  alertas: Alerta[]
  /** Só os códigos, para `array-contains`: array de objeto não é indexável. */
  alertasCodigos: string[]
  atualizadoEm: DataIso
}

/* ------------------------------------------------------------- mobilidade */

/**
 * Uma resposta da pesquisa de mobilidade. **Sem endereço** (§6.1): só distância,
 * bairro e cidade.
 *
 * `mes` é nulo e `periodicidade` é `mensal`: a pesquisa é anual e o valor vale
 * para todo mês do ano-base. O nome do campo carrega a unidade de propósito.
 */
export type DocMobilidade = EnvelopeEmissao & {
  modulo: 'mobilidade'
  modal: 'terrestre'
  periodicidade: 'mensal'
  mes: null
  funcionarioId: string
  anoBase: number
  transporte: Transporte
  combustivel: Combustivel | null
  distanciaKm: number
  bairro: string | null
  cidade: string | null
  diasUteisMes: number
  co2KgMes: number
  excecao: boolean
  motivoExcecao: string | null
}

/* ----------------------------------------------------------------- viagens */

/**
 * Um documento por TRECHO (§9.6). Viagem com conexão vira dois documentos
 * ligados pelo mesmo `reservaId`. Não existe array aninhado de trechos.
 *
 * `ano` e `mes` saem da data do voo, nunca da data de lançamento da passagem.
 * `criadoPorUid` é o que permite ao `colaborador` ler apenas as próprias
 * submissões (§5.1).
 */
export type DocViagemTrecho = EnvelopeEmissao & {
  modulo: 'viagens'
  periodicidade: 'evento'
  reservaId: string
  ordem: number
  funcionarioId: string
  criadoPorUid: string | null
  tipo: TipoDeViagem
  fonte: FonteDaViagem
  contabilizar: boolean
  dataIda: DataIso
  dataVolta: DataIso | null
  origem: string
  destino: string
  companhia: string | null
  voo: string | null
  dataVoo: DataIso | null
  distanciaKm: number
  faixaDistancia: FaixaDistancia | null
  passageiros: number
  co2Kg: number
  /**
   * `fator` carimba o fator por faixa de distância. O multiplicador de classe é
   * o outro termo da conta (§7.2) e fica aqui, junto da cabine assumida — sem os
   * dois, a emissão do trecho não é reproduzível a partir do documento.
   */
  classeCabine: string | null
  multiplicadorClasse: number | null
  propriedadeVeiculo: PropriedadeVeiculo | null
  combustivel: Combustivel | null
  ocupantes: number | null
}

/* ---------------------------------------------------------------- marítimo */

/**
 * Um embarque do relatório do agente (§9.7). `modal` é `maritimo` no geral e
 * `aereo` na carga aérea de fornecedor, que é frete upstream e não pode ser
 * confundida com viagem de passageiro (§8.3).
 */
export type DocEmbarque = EnvelopeEmissao & {
  modulo: 'maritimo'
  periodicidade: 'evento'
  agente: string
  shipmentId: string
  houseRef: string | null
  trans: string | null
  mode: string | null
  portoOrigem: string | null
  portoDestino: string | null
  navioPartida: string | null
  navioTransbordo: string | null
  etd: DataIso | null
  eta: DataIso | null
  atd: DataIso | null
  ata: DataIso | null
  pesoKg: number | null
  volumeM3: number | null
  containers: number | null
  co2Kg: number
  nivelDado: NivelDado
  status: string | null
  previsao: boolean
}

/* ------------------------------------------------------------------- apoio */

/** **Sem endereço** (§6.1). `chaveOrigem` é chave técnica de ingestão. */
export type DocFuncionario = {
  matricula: string | null
  nome: string
  email: string | null
  departamento: string | null
  ativo: boolean
  chaveOrigem: string | null
}

export type DocFatorEmissao = {
  categoria: string
  chave: string
  valor: number
  unidade: string
  fonte: string
  versao: string
  vigenciaInicio: DataIso
  vigenciaFim: DataIso | null
}

export type DocAeroporto = {
  iata: string
  nome: string
  cidade: string | null
  uf: string | null
  utcOffset: number | null
  latitude: number | null
  longitude: number | null
  /**
   * Região usada para agregar o mapa em corredor (§10.3).
   *
   * Fica **gravada**, e não calculada na consulta, por dois motivos: é
   * revisável — dá para ver e corrigir uma classificação errada sem abrir
   * código — e trocar a regra depois não muda em silêncio um mapa já publicado.
   */
  regiao: string | null
  /**
   * Como a região foi obtida: `uf` é dado do cadastro, `coordenada` é
   * inferência por faixa continental. O critério viaja junto porque é ele que
   * diz de qual metade da classificação se deve desconfiar.
   */
  regiaoCriterio: 'uf' | 'coordenada' | 'indefinida' | null
}

export type DocMunicipio = {
  codigoIbge: string
  nome: string
  uf: string
  latitude: number | null
  longitude: number | null
}

export type DocRotaCache = {
  sequenciaIbge: string[]
  distanciaKm: number
  provedor: string
  calculadoEm: DataIso
}

export type DocContainerPortoMes = {
  ano: number
  mes: MesIso
  porto: string
  quantidade: number
}

/** `empresa` existe para o perfil `importacao`, que pode ser filtrado (§5). */
export type DocUsuarioPerfil = {
  email: string
  papel: Papel
  empresa: string | null
  funcionarioId: string | null
}

/* --------------------------------------------------------------- auxiliares */

/** Data de hoje em `AAAA-MM-DD`, no fuso local. */
export function hojeIso(): DataIso {
  const agora = new Date()
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  return `${agora.getFullYear()}-${mes}-${dia}`
}

export function anoDe(data: DataIso): number {
  return Number(data.slice(0, 4))
}

export function mesDe(data: DataIso): MesIso {
  return data.slice(0, 7)
}

/**
 * Monta os dois campos de alerta de uma vez. Manter `alertasCodigos` em sincronia
 * à mão é o tipo de coisa que passa despercebida até a consulta por código
 * devolver menos do que deveria.
 */
export function montarAlertas(alertas: Alerta[]): {
  alertas: Alerta[]
  alertasCodigos: string[]
} {
  return {
    alertas,
    alertasCodigos: [...new Set(alertas.map((a) => a.tipo))].sort(),
  }
}

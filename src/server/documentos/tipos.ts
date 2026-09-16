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
 * De onde o trecho do **inventário** veio (§7).
 *
 * As duas são administrativas e cobrem o mesmo tipo de registro: `agencia` é o
 * relatório da agência, histórico e congelado; `cartao` é a planilha do cartão
 * empresarial, viagem paga fora da agência e por isso ausente daquele
 * relatório.
 *
 * **O formulário do viajante não é fonte deste módulo** (§0.1). Ele alimenta o
 * programa de viagens, que tem coleção própria — `viagemRegistrada`, mais
 * abaixo. O campo existe por causa do escopo de recarga, para que regravar uma
 * fonte não enxergue nem apague a outra, e não para dividir a série: não há
 * data de corte e não há troca de fonte no tempo.
 */
export type FonteDaViagem = 'agencia' | 'cartao'
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
 * O que todo documento de emissão carrega, seja do inventário ou do programa.
 *
 * `fator` é nulo apenas onde a emissão é zero por definição — bicicleta, a pé e
 * "outro" não têm fator, têm regra (§6.2). A validação exige que emissão nula
 * acompanhe fator nulo, e vice-versa.
 *
 * Isto existe separado do envelope logo abaixo porque **a matemática é
 * compartilhada e o dado não é** (§7.5): o programa de viagens calcula com os
 * mesmos fatores e precisa carimbá-los do mesmo jeito, sem por isso ganhar os
 * campos que só fazem sentido num inventário.
 */
export type NucleoDeEmissao = {
  modal: Modal
  escopo: Escopo
  ano: number
  mes: MesIso | null
  fator: FatorAplicado | null
  alertas: Alerta[]
  /** Só os códigos, para `array-contains`: array de objeto não é indexável. */
  alertasCodigos: string[]
  atualizadoEm: DataIso
}

/**
 * Comum às três coleções de emissão do **inventário** (§9.4).
 *
 * `modulo`, `periodicidade` e `empresa` são campos de inventário: dizem de qual
 * relatório o documento faz parte, se ele é taxa ou evento, e por qual pessoa
 * jurídica responde. Nenhum dos três se aplica a um registro voluntário, e é por
 * isso que `viagemRegistrada` não os tem.
 */
export type EnvelopeEmissao = NucleoDeEmissao & {
  modulo: Modulo
  periodicidade: Periodicidade
  empresa: string | null
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
 *
 * **Não existe `criadoPorUid` aqui.** Ele é campo do programa de viagens, que
 * mora em `viagemRegistrada`: nenhum documento desta coleção é criado por
 * alguém usando a aplicação, todos vêm de carga. Enquanto o campo existiu aqui,
 * ele veio nulo em todo documento gravado — campo de um sistema no esquema do
 * outro, que é exatamente o que a §0.1 desfaz.
 */
export type DocViagemTrecho = EnvelopeEmissao & {
  modulo: 'viagens'
  periodicidade: 'evento'
  reservaId: string
  ordem: number
  funcionarioId: string
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

/* ------------------------------------------- programa de viagens (não é inventário) */

/**
 * Uma viagem registrada pelo próprio colaborador — CLAUDE.md §0.1 e §7.5.
 *
 * **Isto não é inventário, e a coleção separada é o que torna a mistura
 * impossível em vez de apenas proibida.** Um campo discriminador dentro de
 * `viagemTrecho` deixaria a separação dependendo de toda consulta futura
 * lembrar de filtrar por ele — e uma consulta que esquecesse somaria
 * autodeclaração voluntária a fonte administrativa completa, produzindo série
 * que mede adesão e parece medir emissão. Com duas coleções, esquecer o filtro
 * não é possível: não há filtro para esquecer.
 *
 * O que ele **não** tem é tão importante quanto o que tem:
 *
 *  - **sem `fonte`** — não há série a dividir nem data de corte; o inventário
 *    tem duas fontes administrativas e esta coleção não é uma delas;
 *  - **sem `contabilizar`** — itinerário duplicado é coisa de relatório de
 *    agência, não de formulário preenchido por quem viajou;
 *  - **sem `empresa`** — a empresa é dimensão de inventário, por qual pessoa
 *    jurídica o Escopo 3 responde;
 *  - **sem `passageiros`** — quem preenche é quem viajou, e a divisão entre
 *    ocupantes de um carro é `ocupantes`;
 *  - **sem `modulo` e sem `periodicidade`** — não faz parte de módulo nenhum do
 *    inventário.
 *
 * E `criadoPorUid` é **obrigatório**, ao contrário de tudo no inventário: é ele
 * que permite ao `colaborador` ler apenas as próprias submissões, na consulta
 * e não na interface (§5.1). Documento sem dono ficaria invisível para quem o
 * escreveu e visível para ninguém.
 *
 * O cálculo reaproveita os mesmos fatores e as mesmas funções do inventário —
 * o que não se compartilha é o dado, não a matemática (§7.5). Por isso o
 * `fator` é carimbado aqui do mesmo jeito.
 */
export type DocViagemRegistrada = NucleoDeEmissao & {
  /** Liga os trechos da mesma viagem, como no inventário. */
  reservaId: string
  ordem: number
  /** Quem registrou. Obrigatório: é o controle de acesso do §5.1. */
  criadoPorUid: string
  /** Vínculo com o cadastro, quando quem registrou já existe nele. */
  funcionarioId: string | null
  tipo: TipoDeViagem
  dataIda: DataIso
  dataVolta: DataIso | null
  origem: string
  destino: string
  distanciaKm: number
  co2Kg: number
  /** Aéreo: a distância é calculada do zero, então o uplift é aplicado (§7.2). */
  faixaDistancia: FaixaDistancia | null
  classeCabine: string | null
  multiplicadorClasse: number | null
  /** Carro: os três entram na conta, e por isso são exceção ao formulário mínimo. */
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

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
import type { Filial } from '@/lib/transportadoras'

/** `AAAA-MM-DD`. */
export type DataIso = string
/** `AAAA-MM`. */
export type MesIso = string

export type Modulo = 'mobilidade' | 'viagens' | 'maritimo' | 'transportadoras'
export type Modal = 'aereo' | 'terrestre' | 'maritimo' | 'rodoviario'
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

/**
 * De onde vem o número de uma entrega rodoviária — e **por que não é o
 * `NivelDado` do marítimo.**
 *
 * Lá os degraus dizem se o CO₂ foi informado pelo agente ou estimado, e por qual
 * média (§8.2). Aqui não existe emissão informada: a atividade é medida — peso e
 * distância vêm do relatório — e o fator é uma **média declarada de frete
 * rodoviário**, porque o sistema não sabe o caminhão, a carga de retorno nem a
 * ocupação (§9.2). Compartilhar a união deixaria `medido` escrevível numa
 * coleção onde nada é medido, e `calculado_tkm` escrevível num embarque.
 *
 * Um valor só, hoje. O segundo aparece no dia em que a origem trouxer dado por
 * veículo.
 */
export type NivelDadoRodoviario = 'calculado_tkm'

/**
 * Quem paga o frete da entrega — e é isso que decide a categoria do Escopo 3
 * (§9.1).
 *
 * `indefinido` é o estado de hoje, e é **declarado, não presumido**: o
 * levantamento de CIF/FOB está em aberto (§14), e enquanto não fechar o módulo
 * entra na Visão geral como cat. 4 provisória. Se apontar FOB, a classificação
 * muda para cat. 9 e o módulo pode precisar sair do total — reclassificação de
 * escopo, não ajuste de tela.
 */
export type RegimeFrete = 'cif' | 'fob' | 'indefinido'

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
  /**
   * Bloco de origem — a aba do relatório de onde o embarque veio.
   *
   * **É o escopo de recarga** (§8.4), e não o ano: um bloco atravessa a virada
   * do ano, então dois blocos do mesmo agente contêm documentos do mesmo ano.
   * Com o ano no escopo, recarregar um bloco apagaria os documentos do outro que
   * caíssem naquele ano.
   */
  bloco: string
  shipmentId: string
  houseRef: string | null
  trans: string | null
  mode: string | null
  /** Código UN/LOCODE, que é o que liga o embarque ao cadastro de portos. */
  portoOrigem: string | null
  portoDestino: string | null
  /**
   * O nome do lugar como o relatório o trouxe.
   *
   * Viaja ao lado do código porque os dois às vezes discordam — em embarque
   * aéreo e em transbordo, o código é o ponto de carregamento e o nome é a
   * origem real. Guardar os dois é o que permite sinalizar o desacordo em vez de
   * escolher um em silêncio.
   */
  portoOrigemNome: string | null
  portoDestinoNome: string | null
  navioPartida: string | null
  navioTransbordo: string | null
  etd: DataIso | null
  eta: DataIso | null
  atd: DataIso | null
  ata: DataIso | null
  /**
   * Chegada efetiva ao último desembarque.
   *
   * Existe no documento porque é **a única prova de fato que o frete aéreo
   * tem** — as colunas de navio nunca são preenchidas nesse modal. Sem ela
   * gravada, `previsao` não seria reproduzível a partir do documento: quem
   * conferisse depois veria um embarque aéreo sem partida efetiva e não teria
   * como saber por que ele não foi tratado como previsão (§8.3).
   */
  ataFinal: DataIso | null
  pesoKg: number | null
  volumeM3: number | null
  containers: number | null
  /** De onde saiu a contagem: a coluna numérica ou o texto de tipo (§8.3). */
  containersFonte: 'coluna' | 'tipo' | null
  co2Kg: number
  nivelDado: NivelDado
  /**
   * Quantos embarques medidos entraram na média carimbada em `fator`.
   *
   * Nulo em `medido`, onde não há média. Nos níveis estimados ele é o que torna
   * a conta **reproduzível a partir do documento**: a mesma média recalculada
   * depois, sobre uma base maior, daria outro número, e sem este campo o
   * documento não teria como dizer qual valia (§8.2).
   */
  baseDaEstimativa: number | null
  status: string | null
  previsao: boolean
}

/* --------------------------------------------------- transportadoras */

/**
 * Uma entrega do relatório de distribuição rodoviária — CLAUDE.md §9 e §10.11.
 *
 * O documento é a unidade de emissão do módulo: uma linha do relatório, uma
 * entrega, um documento (§10.1). A emissão sai de tonelada-quilômetro vezes um
 * fator médio de frete rodoviário — o sistema não sabe o modelo do caminhão, a
 * carga de retorno nem a taxa de ocupação (§9.2) —, e é por isso que o fator
 * carimbado, com fonte e vigência, **não é acabamento**: sem ele o número é uma
 * média que não diz de quem.
 *
 * O que o módulo não sabe está declarado em dois campos:
 *
 *  - `regimeFrete` é `indefinido` enquanto o levantamento de CIF/FOB não fechar
 *    (§9.1, §14). A tela declara o escopo como provisório, e a decisão pode
 *    reclassificar o módulo de cat. 4 para cat. 9 — ou tirá-lo do consolidado;
 *  - `nivelDado` diz que o número é calculado por tonelada-quilômetro, não
 *    medido. É o mesmo lugar em que o marítimo declara a qualidade do dado
 *    (§8.2), com uma união própria e o motivo escrito em `NivelDadoRodoviario`.
 *
 * **`clienteCodigo` é o identificador do relatório de faturamento, nunca o nome
 * do cliente** (§10.11): nome real não se versiona (§2.1) e não aparece em tela
 * nenhuma deste módulo — o agregado é por filial (§9.4).
 */
export type DocEntregaRodoviaria = EnvelopeEmissao & {
  modulo: 'transportadoras'
  modal: 'rodoviario'
  periodicidade: 'evento'
  filial: Filial
  data: DataIso
  /**
   * Índice da entrega dentro do mesmo par filial+data, na ordem do arquivo.
   *
   * Existe porque **a planilha não traz identificador de entrega**, e é ele que
   * completa o ID determinístico: recarregar o mesmo relatório sobrescreve em vez
   * de duplicar (§10.11). Mesmo papel que `ordem` cumpre em `viagemTrecho`.
   */
  ordem: number
  clienteCodigo: string | null
  distanciaKm: number
  pesoKg: number
  co2Kg: number
  regimeFrete: RegimeFrete
  nivelDado: NivelDadoRodoviario
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

/**
 * Um porto ou ponto de carregamento, identificado pelo código UN/LOCODE.
 *
 * O cadastro existe porque o mapa do módulo marítimo precisa de coordenada e o
 * relatório do agente não traz nenhuma — ele traz o código. A resolução vem da
 * lista oficial UN/LOCODE, carregada por seed, e não de geocodificação do nome:
 * o nome no relatório é texto livre, com nome de aeroporto, nome composto e nome
 * entre parênteses, e geocodificar texto assim põe o ponto no lugar errado sem
 * nenhum erro aparecer.
 *
 * `latitude` e `longitude` podem ser nulas: parte dos registros da lista oficial
 * não traz coordenada. O porto entra no cadastro assim mesmo — ausência de
 * coordenada é fato a declarar, e o embarque que depende dela fica fora do mapa
 * com a proporção anunciada, não some.
 */
export type DocPorto = {
  /** Cinco letras: país e local, como a lista publica. */
  locode: string
  nome: string
  pais: string
  subdivisao: string | null
  latitude: number | null
  longitude: number | null
  /**
   * O classificador de função da lista oficial, cru.
   *
   * É ele que diz se o código é porto marítimo, aeroporto ou ponto rodoviário —
   * e é o que permite sinalizar embarque marítimo cujo código de carregamento
   * não é porto, erro de preenchimento que sem isso viraria uma linha no mapa
   * saindo de onde navio não atraca.
   */
  funcao: string | null
  ehPorto: boolean
  /** Edição da lista de onde o registro saiu, para o cadastro ser auditável. */
  fonte: string
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

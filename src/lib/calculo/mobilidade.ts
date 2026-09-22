/**
 * Cálculo da mobilidade casa-trabalho — CLAUDE.md §6.2.
 *
 *   kg_co2_mes = distancia_km × 2 × dias_uteis_mes × fator
 *
 * O 2 é ida e volta. Dias úteis por mês é parâmetro de ambiente, nunca
 * constante. O fator vem da tabela `fator_emissao`: por veículo-km no carro e
 * na moto, por passageiro-km no ônibus.
 *
 * Hipóteses que precisam aparecer na tela de método:
 *  - um ocupante por carro e por moto, porque a pesquisa não pergunta carona;
 *  - bicicleta e deslocamento a pé emitem zero;
 *  - "outro" é tratado como zero, por não ser possível saber o modal.
 */

export type Transporte = 'carro' | 'onibus' | 'moto' | 'bicicleta' | 'a_pe' | 'outro'
export type Combustivel = 'gasolina' | 'etanol' | 'diesel' | 'flex' | 'eletrico'

/**
 * Como cada modal se escreve na tela.
 *
 * A chave é técnica e vira chave de fator, de agrupamento e de documento; ela
 * não é texto de interface. Sem este mapa a tela mostrava `a_pe` e `onibus` ao
 * lado de `Carro`, que é a chave vazando para onde ela não devia chegar.
 *
 * Chave desconhecida volta como veio: o balde da supressão passa por aqui com
 * o rótulo dele ("outros modais") e não pode ser reescrito.
 */
const ROTULO_DO_TRANSPORTE: Record<Transporte, string> = {
  carro: 'Carro',
  onibus: 'Ônibus',
  moto: 'Moto',
  bicicleta: 'Bicicleta',
  a_pe: 'A pé',
  outro: 'Outro',
}

export function rotuloDoTransporte(chave: string): string {
  return ROTULO_DO_TRANSPORTE[chave as Transporte] ?? chave
}

export const CATEGORIA_MOBILIDADE = 'mobilidade'

/** Categoria do fator na tabela, por modal. */
export function categoriaDoFator(transporte: Transporte): string {
  return `${CATEGORIA_MOBILIDADE}_${transporte}`
}

/**
 * Modais em que o combustível é do próprio deslocamento e muda o fator.
 *
 * O ônibus é motorizado, mas quem queima o combustível é a frota e o fator é
 * por passageiro-km: o campo não se aplica. A §6.2 fala em "modal motorizado";
 * a leitura adotada é esta, e está declarada na tela de método.
 */
const COM_COMBUSTIVEL_PROPRIO = new Set<Transporte>(['carro', 'moto'])

/** Modais de emissão zero por definição (§6.2). */
const EMISSAO_ZERO = new Set<Transporte>(['bicicleta', 'a_pe', 'outro'])

export function exigeCombustivel(transporte: Transporte): boolean {
  return COM_COMBUSTIVEL_PROPRIO.has(transporte)
}

export function emiteZero(transporte: Transporte): boolean {
  return EMISSAO_ZERO.has(transporte)
}

/** Chave do fator: o combustível onde ele se aplica, senão "padrao". */
export function chaveDoFator(
  transporte: Transporte,
  combustivel: Combustivel | null,
): string {
  return exigeCombustivel(transporte) && combustivel ? combustivel : 'padrao'
}

export type EntradaMobilidade = {
  distanciaKm: number
  diasUteisMes: number
  fatorKgPorKm: number
}

/** Emissão mensal de um funcionário, em kg CO₂e. */
export function emissaoMensal(entrada: EntradaMobilidade): number {
  const { distanciaKm, diasUteisMes, fatorKgPorKm } = entrada

  if (!Number.isFinite(distanciaKm) || distanciaKm < 0) {
    throw new Error(`Distância inválida: ${distanciaKm}`)
  }
  if (!Number.isFinite(diasUteisMes) || diasUteisMes <= 0) {
    throw new Error(`Dias úteis por mês inválido: ${diasUteisMes}`)
  }
  if (!Number.isFinite(fatorKgPorKm) || fatorKgPorKm < 0) {
    throw new Error(`Fator inválido: ${fatorKgPorKm}`)
  }

  const DESLOCAMENTOS_POR_DIA = 2 // ida e volta
  return distanciaKm * DESLOCAMENTOS_POR_DIA * diasUteisMes * fatorKgPorKm
}

/* ----------------------------------------------------- leitura do formulário */

const TRANSPORTE_POR_RESPOSTA: Record<string, Transporte> = {
  CARRO: 'carro',
  AUTOMOVEL: 'carro',
  'CARRO PROPRIO': 'carro',
  ONIBUS: 'onibus',
  'TRANSPORTE PUBLICO': 'onibus',
  MOTO: 'moto',
  MOTOCICLETA: 'moto',
  BICICLETA: 'bicicleta',
  BIKE: 'bicicleta',
  'A PE': 'a_pe',
  APE: 'a_pe',
  CAMINHADA: 'a_pe',
  OUTRO: 'outro',
  OUTROS: 'outro',
}

const COMBUSTIVEL_POR_RESPOSTA: Record<string, Combustivel> = {
  GASOLINA: 'gasolina',
  ETANOL: 'etanol',
  ALCOOL: 'etanol',
  DIESEL: 'diesel',
  FLEX: 'flex',
  ELETRICO: 'eletrico',
  ELETRICA: 'eletrico',
}

/** Converte a resposta do formulário no valor do enum, ou devolve null. */
export function transporteDaResposta(chaveNormalizada: string): Transporte | null {
  return TRANSPORTE_POR_RESPOSTA[chaveNormalizada] ?? null
}

export function combustivelDaResposta(chaveNormalizada: string): Combustivel | null {
  return COMBUSTIVEL_POR_RESPOSTA[chaveNormalizada] ?? null
}

/* ------------------------------------------------------------------ alertas */

export const ALERTA_COMBUSTIVEL_AUSENTE = 'combustivel_ausente'
export const ALERTA_COMBUSTIVEL_INDEVIDO = 'combustivel_em_modal_sem_combustivel'
export const ALERTA_COMBUSTIVEL_DESCONHECIDO = 'combustivel_desconhecido'
export const ALERTA_TRANSPORTE_DESCONHECIDO = 'transporte_desconhecido'
export const ALERTA_GEOCODIFICACAO = 'geocodificacao_falhou'
export const ALERTA_DISTANCIA_IMPROVAVEL = 'distancia_improvavel'
export const ALERTA_RESPOSTA_SUBSTITUIDA = 'resposta_substituida'
export const ALERTA_MATRICULA_NUMERICA = 'matricula_lida_como_numero'

/**
 * Combinação de modal e combustível que não tem fator definido.
 *
 * A ausência é proposital: moto a diesel e moto elétrica, por exemplo, indicam
 * erro de preenchimento, não um modal a ser estimado. A resposta é sinalizada e
 * fica fora da média — **nunca recebe valor aproximado** (§9.8).
 */
export const ALERTA_FATOR_AUSENTE = 'fator_ausente'

/**
 * O provedor de rota não devolveu distância, mesmo depois das tentativas.
 *
 * É falha de infraestrutura, não de dado: a resposta vira exceção para não
 * entrar na média com distância inventada, e o alerta deixa claro que ela pode
 * voltar ao cálculo numa recarga.
 */
export const ALERTA_DISTANCIA_INDISPONIVEL = 'distancia_indisponivel'

/**
 * A distância desta resposta é compartilhada por muitas outras.
 *
 * Denuncia geocodificação grosseira: quando o provedor devolve o centro do
 * município no lugar da coordenada do CEP, dezenas de endereços diferentes viram
 * o mesmo ponto e a distância deixa de medir qualquer coisa. O módulo continua
 * fechando por dentro — emissão bate com distância × dias × fator — e por isso o
 * erro não aparece em nenhuma conferência de coerência.
 */
export const ALERTA_GEOCODIFICACAO_IMPRECISA = 'geocodificacao_imprecisa'

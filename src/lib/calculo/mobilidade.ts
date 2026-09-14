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

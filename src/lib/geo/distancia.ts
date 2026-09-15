/**
 * Distância entre dois pontos.
 *
 * A ortodrômica serve ao aéreo, onde a rota é praticamente a linha reta com um
 * uplift conhecido (§7.2). Para deslocamento em terra ela subestima de forma
 * irregular, então a mobilidade e as viagens de carro usam distância
 * rodoviária, obtida de provedor externo (§7.4).
 */

export type Coordenada = { latitude: number; longitude: number }

export type ModoDeDistancia = 'rodoviaria' | 'ortodromica'

/**
 * O provedor recusou por limite de taxa. É transitório: esperar e repetir
 * resolve, e por isso não pode ser tratado como erro de dado.
 */
export class LimiteDeTaxaError extends Error {
  constructor(
    provedor: string,
    /** Quanto o provedor pediu para esperar, quando ele diz. */
    readonly esperarMs: number | null,
  ) {
    super(
      `${provedor} recusou por limite de taxa (429)` +
        (esperarMs === null ? '' : `; pediu ${Math.round(esperarMs / 1000)}s de espera`),
    )
    this.name = 'LimiteDeTaxaError'
  }
}

/**
 * O provedor recusou por credencial ou cota — 401 ou 403.
 *
 * Diferente do limite por minuto, isto **não passa esperando**: repetir só
 * gasta tempo, e tratar como falha da resposta produziria um módulo inteiro de
 * exceções, com média vazia e aparência de carga bem-sucedida. É fatal.
 */
export class ProvedorIndisponivelError extends Error {
  constructor(provedor: string, status: number, detalhe: string) {
    super(
      `${provedor} recusou com ${status}: ${detalhe}. Não adianta repetir — ` +
        'confira a chave e a cota do plano antes de recarregar.',
    )
    this.name = 'ProvedorIndisponivelError'
  }
}

export interface CalculadoraDeDistancia {
  readonly nome: string
  readonly modo: ModoDeDistancia
  /** Intervalo mínimo entre chamadas, em ms, para respeitar o provedor. */
  readonly intervaloMs: number
  entre(origem: Coordenada, destino: Coordenada): Promise<number>
}

/** Distância ortodrômica em km. */
export function distanciaOrtodromicaKm(
  origem: Coordenada,
  destino: Coordenada,
): number {
  const R = 6371.0088
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(destino.latitude - origem.latitude)
  const dLon = rad(destino.longitude - origem.longitude)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(origem.latitude)) *
      Math.cos(rad(destino.latitude)) *
      Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

class Ortodromica implements CalculadoraDeDistancia {
  readonly nome = 'ortodromica'
  readonly modo = 'ortodromica' as const
  readonly intervaloMs = 0

  async entre(origem: Coordenada, destino: Coordenada): Promise<number> {
    return distanciaOrtodromicaKm(origem, destino)
  }
}

class OpenRouteService implements CalculadoraDeDistancia {
  readonly nome = 'openrouteservice'
  readonly modo = 'rodoviaria' as const

  constructor(
    private readonly chave: string,
    /**
     * O plano gratuito aceita 40 chamadas por minuto. O padrão fica abaixo
     * disso de propósito: estourar o limite custa a carga inteira, e ganhar
     * alguns segundos não compensa.
     */
    readonly intervaloMs: number,
  ) {}

  async entre(origem: Coordenada, destino: Coordenada): Promise<number> {
    const resposta = await fetch(
      'https://api.openrouteservice.org/v2/directions/driving-car',
      {
        method: 'POST',
        headers: {
          Authorization: this.chave,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          coordinates: [
            [origem.longitude, origem.latitude],
            [destino.longitude, destino.latitude],
          ],
        }),
      },
    )
    if (resposta.status === 429) {
      throw new LimiteDeTaxaError('OpenRouteService', esperaPedida(resposta))
    }
    if (resposta.status === 401 || resposta.status === 403) {
      throw new ProvedorIndisponivelError(
        'OpenRouteService',
        resposta.status,
        (await resposta.text()).slice(0, 120),
      )
    }
    if (!resposta.ok) {
      throw new Error(`OpenRouteService respondeu ${resposta.status}`)
    }
    const dados = (await resposta.json()) as {
      routes?: { summary?: { distance?: number } }[]
    }
    const metros = dados.routes?.[0]?.summary?.distance
    if (typeof metros !== 'number') {
      throw new Error('OpenRouteService não devolveu distância para o trajeto.')
    }
    return metros / 1000
  }
}

class GoogleRoutes implements CalculadoraDeDistancia {
  readonly nome = 'google-routes'
  readonly modo = 'rodoviaria' as const

  constructor(
    private readonly chave: string,
    readonly intervaloMs: number,
  ) {}

  async entre(origem: Coordenada, destino: Coordenada): Promise<number> {
    const resposta = await fetch(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.chave,
          'X-Goog-FieldMask': 'routes.distanceMeters',
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: origem.latitude, longitude: origem.longitude } } },
          destination: {
            location: { latLng: { latitude: destino.latitude, longitude: destino.longitude } },
          },
          travelMode: 'DRIVE',
        }),
      },
    )
    if (resposta.status === 429) {
      throw new LimiteDeTaxaError('Google Routes', esperaPedida(resposta))
    }
    if (resposta.status === 401 || resposta.status === 403) {
      throw new ProvedorIndisponivelError(
        'Google Routes',
        resposta.status,
        (await resposta.text()).slice(0, 120),
      )
    }
    if (!resposta.ok) {
      throw new Error(`Google Routes respondeu ${resposta.status}`)
    }
    const dados = (await resposta.json()) as { routes?: { distanceMeters?: number }[] }
    const metros = dados.routes?.[0]?.distanceMeters
    if (typeof metros !== 'number') {
      throw new Error('Google Routes não devolveu distância para o trajeto.')
    }
    return metros / 1000
  }
}

/** Lê o `Retry-After` da resposta, em ms. Aceita segundos ou data HTTP. */
export function esperaPedida(resposta: { headers: Headers }): number | null {
  const cabecalho = resposta.headers.get('retry-after')
  if (!cabecalho) return null

  const segundos = Number(cabecalho)
  if (Number.isFinite(segundos)) return Math.max(0, segundos * 1000)

  const quando = Date.parse(cabecalho)
  return Number.isNaN(quando) ? null : Math.max(0, quando - Date.now())
}

/** Intervalo entre chamadas de rota; configurável, com padrão conservador. */
function intervaloDeRota(padrao: number): number {
  const bruto = process.env.ROTAS_INTERVALO_MS
  if (bruto === undefined || bruto.trim() === '') return padrao
  const valor = Number(bruto)
  if (!Number.isFinite(valor) || valor < 0) {
    throw new Error(`ROTAS_INTERVALO_MS inválido: ${bruto}`)
  }
  return valor
}

/**
 * Monta a calculadora conforme o ambiente. O modo é escolha declarada, não
 * padrão silencioso: ela muda o número do inventário e precisa ser declarada na
 * tela de método.
 */
export function criarCalculadoraDeDistancia(
  modo: ModoDeDistancia,
): CalculadoraDeDistancia {
  if (modo === 'ortodromica') return new Ortodromica()

  const provedor = (process.env.ROTAS_PROVEDOR ?? '').trim().toLowerCase()
  if (provedor === 'ors' || provedor === 'openrouteservice') {
    const chave = process.env.OPENROUTESERVICE_API_KEY?.trim()
    if (!chave) throw new Error('OPENROUTESERVICE_API_KEY não configurada.')
    // 1600 ms ≈ 37 chamadas por minuto, abaixo do limite de 40 do plano gratuito.
    return new OpenRouteService(chave, intervaloDeRota(1600))
  }
  if (provedor === 'google') {
    const chave = process.env.GOOGLE_ROUTES_API_KEY?.trim()
    if (!chave) throw new Error('GOOGLE_ROUTES_API_KEY não configurada.')
    return new GoogleRoutes(chave, intervaloDeRota(50))
  }
  throw new Error(
    `ROTAS_PROVEDOR inválido: "${provedor}". Use "ors" ou "google", ou rode com ` +
      'MOBILIDADE_DISTANCIA_MODO=ortodromica.',
  )
}

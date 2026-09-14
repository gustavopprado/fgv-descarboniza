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

export interface CalculadoraDeDistancia {
  readonly nome: string
  readonly modo: ModoDeDistancia
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

  async entre(origem: Coordenada, destino: Coordenada): Promise<number> {
    return distanciaOrtodromicaKm(origem, destino)
  }
}

class OpenRouteService implements CalculadoraDeDistancia {
  readonly nome = 'openrouteservice'
  readonly modo = 'rodoviaria' as const

  constructor(private readonly chave: string) {}

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

  constructor(private readonly chave: string) {}

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
    return new OpenRouteService(chave)
  }
  if (provedor === 'google') {
    const chave = process.env.GOOGLE_ROUTES_API_KEY?.trim()
    if (!chave) throw new Error('GOOGLE_ROUTES_API_KEY não configurada.')
    return new GoogleRoutes(chave)
  }
  throw new Error(
    `ROTAS_PROVEDOR inválido: "${provedor}". Use "ors" ou "google", ou rode com ` +
      'MOBILIDADE_DISTANCIA_MODO=ortodromica.',
  )
}

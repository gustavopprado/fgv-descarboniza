/**
 * Geocodificação por CEP — CLAUDE.md §6.1.
 *
 * O CEP entra por parâmetro, é usado na chamada e some. Nada aqui guarda CEP,
 * logradouro, número ou complemento: sem cache em disco, sem cache em memória
 * entre execuções, sem log. Quem chama também não pode registrar o CEP — só o
 * resultado em coordenada, que vira distância e é descartado.
 *
 * O que sai da máquina é o CEP, para o provedor escolhido. Nome e matrícula
 * nunca são enviados.
 */

import type { Coordenada } from './distancia'

export interface Geocodificador {
  readonly nome: string
  /** Intervalo mínimo entre chamadas, em ms, para respeitar o provedor. */
  readonly intervaloMs: number
  localizar(cep: string): Promise<Coordenada | null>
}

/** Aceita 99999-999 e 99999999; devolve só dígitos. */
export function digitosDoCep(cep: string): string | null {
  const digitos = cep.replace(/\D/g, '')
  return digitos.length === 8 ? digitos : null
}

function coordenadaValida(latitude: unknown, longitude: unknown): Coordenada | null {
  const lat = typeof latitude === 'string' ? Number(latitude) : latitude
  const lon = typeof longitude === 'string' ? Number(longitude) : longitude
  if (typeof lat !== 'number' || typeof lon !== 'number') return null
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (lat === 0 && lon === 0) return null
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  return { latitude: lat, longitude: lon }
}

/** BrasilAPI: específico de CEP e sem chave. Nem todo CEP traz coordenada. */
class BrasilApi implements Geocodificador {
  readonly nome = 'brasilapi'
  readonly intervaloMs = 250

  async localizar(cep: string): Promise<Coordenada | null> {
    const digitos = digitosDoCep(cep)
    if (!digitos) return null
    const resposta = await fetch(`https://brasilapi.com.br/api/cep/v2/${digitos}`)
    if (resposta.status === 404) return null
    if (!resposta.ok) throw new Error(`BrasilAPI respondeu ${resposta.status}`)
    const dados = (await resposta.json()) as {
      location?: { coordinates?: { latitude?: string; longitude?: string } }
    }
    const c = dados.location?.coordinates
    return coordenadaValida(c?.latitude, c?.longitude)
  }
}

/** Nominatim (OpenStreetMap): sem chave, limitado a uma chamada por segundo. */
class Nominatim implements Geocodificador {
  readonly nome = 'nominatim'
  readonly intervaloMs = 1100

  constructor(private readonly identificacao: string) {}

  async localizar(cep: string): Promise<Coordenada | null> {
    const digitos = digitosDoCep(cep)
    if (!digitos) return null
    const formatado = `${digitos.slice(0, 5)}-${digitos.slice(5)}`
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('postalcode', formatado)
    url.searchParams.set('country', 'Brazil')
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('limit', '1')

    const resposta = await fetch(url, {
      headers: { 'User-Agent': this.identificacao, 'Accept-Language': 'pt-BR' },
    })
    if (!resposta.ok) throw new Error(`Nominatim respondeu ${resposta.status}`)
    const dados = (await resposta.json()) as { lat?: string; lon?: string }[]
    return coordenadaValida(dados[0]?.lat, dados[0]?.lon)
  }
}

class GoogleGeocoding implements Geocodificador {
  readonly nome = 'google'
  readonly intervaloMs = 50

  constructor(private readonly chave: string) {}

  async localizar(cep: string): Promise<Coordenada | null> {
    const digitos = digitosDoCep(cep)
    if (!digitos) return null
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
    url.searchParams.set('address', `${digitos.slice(0, 5)}-${digitos.slice(5)}`)
    url.searchParams.set('components', 'country:BR')
    url.searchParams.set('key', this.chave)

    const resposta = await fetch(url)
    if (!resposta.ok) throw new Error(`Google Geocoding respondeu ${resposta.status}`)
    const dados = (await resposta.json()) as {
      status?: string
      results?: { geometry?: { location?: { lat?: number; lng?: number } } }[]
    }
    if (dados.status === 'ZERO_RESULTS') return null
    if (dados.status !== 'OK') {
      throw new Error(`Google Geocoding devolveu status ${dados.status}`)
    }
    const l = dados.results?.[0]?.geometry?.location
    return coordenadaValida(l?.lat, l?.lng)
  }
}

export function criarGeocodificador(): Geocodificador {
  const provedor = (process.env.GEOCODE_PROVEDOR ?? '').trim().toLowerCase()
  if (provedor === 'brasilapi') return new BrasilApi()
  if (provedor === 'nominatim') {
    const identificacao =
      process.env.GEOCODE_USER_AGENT?.trim() ??
      'fgv-descarboniza/1.0 (inventario de emissoes)'
    return new Nominatim(identificacao)
  }
  if (provedor === 'google') {
    const chave = process.env.GEOCODE_API_KEY?.trim()
    if (!chave) throw new Error('GEOCODE_API_KEY não configurada.')
    return new GoogleGeocoding(chave)
  }
  throw new Error(
    `GEOCODE_PROVEDOR inválido: "${provedor}". Use "brasilapi", "nominatim" ou "google".`,
  )
}

/** Espera entre chamadas, para não estourar o limite do provedor. */
export function aguardar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

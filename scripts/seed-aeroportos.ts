/**
 * Cadastra aeroportos que faltam, resolvendo a coordenada por geocodificação.
 *
 * **Por que não digitar a coordenada.** A base histórica trouxe os aeroportos
 * dela com latitude e longitude; um aeroporto que aparece só em outra fonte —
 * a planilha do cartão, por exemplo — chega sem coordenada nenhuma, e sem
 * coordenada não há distância nem emissão. Digitar de memória seria inventar
 * dado, que é o que a §9.8 proíbe para fator e vale igual aqui.
 *
 * O provedor é o mesmo já declarado na tela de método para geocodificação, com
 * a mesma chave. O script **imprime o que encontrou** e, sem `--gravar`, não
 * escreve nada: a conferência é humana, porque um código mal resolvido põe um
 * aeroporto no lugar errado do mundo e a distância sai errada em silêncio.
 *
 * Uso:
 *   npx tsx scripts/seed-aeroportos.ts FRA ADD CAN HKG
 *   npx tsx scripts/seed-aeroportos.ts FRA ADD CAN HKG --gravar
 */
import 'dotenv/config'

import { coordenadaValida } from '../src/lib/mapa'
import { idAeroporto } from '../src/server/documentos/ids'
import type { DocAeroporto } from '../src/server/documentos/tipos'
import { COLECAO } from '../src/server/firestore'
import { conectarFirestore, ehEntrada, executar, tituloDaEtapa } from './_comum'

type Achado = {
  iata: string
  nome: string
  latitude: number
  longitude: number
  /** O que o provedor devolveu, para conferência antes de gravar. */
  endereco: string
}

/** Intervalo entre chamadas, para não estourar o limite do provedor. */
const INTERVALO_MS = 250

async function esperar(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}

/**
 * Procura o aeroporto pelo código.
 *
 * A busca é por "aeroporto <código>" em vez do nome do aeroporto: o nome eu
 * teria que escrever de memória, e é justamente isso que não pode. O código
 * vem da planilha.
 */
async function procurar(iata: string, chave: string): Promise<Achado | null> {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  url.searchParams.set('address', `${iata} airport`)
  url.searchParams.set('language', 'pt-BR')
  url.searchParams.set('key', chave)

  const resposta = await fetch(url)
  if (!resposta.ok) {
    throw new Error(`Geocodificação de ${iata} falhou com HTTP ${resposta.status}.`)
  }
  const dados = (await resposta.json()) as {
    status?: string
    results?: {
      formatted_address?: string
      name?: string
      types?: string[]
      geometry?: { location?: { lat?: number; lng?: number } }
    }[]
  }

  if (dados.status === 'ZERO_RESULTS') return null
  if (dados.status !== 'OK') {
    throw new Error(`Geocodificação de ${iata} devolveu status ${dados.status}.`)
  }

  const primeiro = dados.results?.[0]
  const local = primeiro?.geometry?.location
  if (!coordenadaValida(local?.lat ?? null, local?.lng ?? null)) return null

  return {
    iata,
    nome: primeiro?.formatted_address ?? iata,
    latitude: local!.lat!,
    longitude: local!.lng!,
    endereco: primeiro?.formatted_address ?? '',
  }
}

async function principal(): Promise<void> {
  const argumentos = process.argv.slice(2)
  const gravar = argumentos.includes('--gravar')
  const codigos = argumentos
    .filter((a) => !a.startsWith('--'))
    .map((a) => a.trim().toUpperCase())
    .filter((a) => /^[A-Z]{3}$/.test(a))

  if (codigos.length === 0) {
    throw new Error(
      'Informe um ou mais códigos IATA.\n' +
        '  npx tsx scripts/seed-aeroportos.ts FRA ADD [--gravar]',
    )
  }

  const chave = process.env.GEOCODE_API_KEY?.trim()
  if (!chave) throw new Error('GEOCODE_API_KEY não configurada. Veja .env.example.')

  const { db, encerrar } = conectarFirestore()
  try {
    tituloDaEtapa(gravar ? 'Cadastro de aeroportos' : 'Cadastro de aeroportos (simulação)')

    const achados: Achado[] = []
    for (const iata of codigos) {
      const existente = await db.collection(COLECAO.aeroporto).doc(idAeroporto(iata)).get()
      if (existente.exists) {
        const atual = existente.data() as DocAeroporto
        const temCoordenada = coordenadaValida(atual.latitude, atual.longitude)
        console.log(
          `  ${iata}: já cadastrado${temCoordenada ? ', com coordenada. Nada a fazer.' : ', SEM coordenada. Será completado.'}`,
        )
        if (temCoordenada) continue
      }

      const achado = await procurar(iata, chave)
      await esperar(INTERVALO_MS)

      if (achado === null) {
        console.log(`  ${iata}: não encontrado. Confira o código.`)
        continue
      }
      console.log(
        `  ${iata}: ${achado.endereco}\n` +
          `       lat ${achado.latitude.toFixed(4)}, lon ${achado.longitude.toFixed(4)}`,
      )
      achados.push(achado)
    }

    if (achados.length === 0) {
      console.log('\nNada a gravar.')
      return
    }

    if (!gravar) {
      console.log(
        `\n${achados.length} aeroporto(s) prontos para cadastro. ` +
          'Confira o endereço de cada um acima e rode de novo com --gravar.',
      )
      return
    }

    const lote = db.batch()
    for (const achado of achados) {
      const dados: DocAeroporto = {
        iata: achado.iata,
        nome: achado.nome,
        cidade: null,
        uf: null,
        utcOffset: null,
        latitude: achado.latitude,
        longitude: achado.longitude,
      }
      lote.set(db.collection(COLECAO.aeroporto).doc(idAeroporto(achado.iata)), dados, {
        merge: true,
      })
    }
    await lote.commit()
    console.log(`\n${achados.length} aeroporto(s) cadastrados.`)
  } finally {
    await encerrar()
  }
}

if (ehEntrada(import.meta.url)) {
  void executar('seed-aeroportos', principal)
}

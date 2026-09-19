/**
 * Distância rodoviária entre municípios, com cache — CLAUDE.md §7.4.
 *
 * **Rodoviária, nunca ortodrômica.** Em trajeto regional a diferença passa de
 * 25%, é irregular e não se corrige com fator fixo: usar a linha reta aqui não
 * é aproximação, é outro número.
 *
 * **Este é o primeiro caminho do sistema em que o provedor pago é chamado por
 * quem usa a aplicação, e não por quem roda uma carga.** Três coisas seguem
 * disso, e as três estão implementadas aqui:
 *
 *  - **o cache deixa de ser conveniência e passa a ser o que segura a conta.**
 *    As rotas da empresa se repetem muito, e sem cache cada pessoa que registra
 *    a mesma viagem paga a mesma chamada de novo;
 *  - **a chave é a da aplicação**, separada da das cargas (§11.8): esta sai da
 *    Vercel, onde o IP não é estável, e por isso é restrita por API e coberta
 *    por teto de faturamento, em vez de restrita por IP;
 *  - **a chamada acontece no envio, nunca enquanto alguém digita.** O município
 *    é escolhido de uma lista fechada, que não custa rede; o provedor só é
 *    consultado quando o trajeto está montado.
 *
 * **A chave do cache é o par ordenado de códigos IBGE**, e não a viagem
 * inteira. A §7.4 pede a sequência ordenada, e um par é uma sequência de dois:
 * com o trajeto inteiro por chave, uma parada a mais inutilizaria tudo que já
 * estava guardado, enquanto por par o trecho Curitiba–Joinville serve a toda
 * viagem que passe por ele. Ordenado, e não normalizado: ida e volta podem
 * diferir, e fingir que não diferem seria inventar simetria.
 */
import type { Firestore } from 'firebase-admin/firestore'

import { chaveDeRotaDaAplicacao } from '@/lib/env'
import {
  esperaPedida,
  LimiteDeTaxaError,
  ProvedorIndisponivelError,
} from '@/lib/geo/distancia'
import { enderecoDoMunicipio, type Municipio } from '@/lib/municipios'
import { idRotaCache } from './documentos/ids'
import { hojeIso, type DocRotaCache } from './documentos/tipos'
import { COLECAO } from './firestore'

const PROVEDOR = 'google-routes'

/** Tentativas por trecho antes de desistir. Poucas: quem espera é uma pessoa. */
const TENTATIVAS = 3

export class RotaIndisponivelError extends Error {
  constructor(
    readonly origem: Municipio,
    readonly destino: Municipio,
    readonly causa: string,
  ) {
    super(
      `Não foi possível obter a distância rodoviária entre ` +
        `${origem.nome}/${origem.uf} e ${destino.nome}/${destino.uf}: ${causa}`,
    )
    this.name = 'RotaIndisponivelError'
  }
}

export type TrechoDeRota = {
  origem: Municipio
  destino: Municipio
  distanciaKm: number
  /** Veio do cache, sem chamar o provedor. Serve ao relatório e ao teste. */
  doCache: boolean
}

/**
 * Pergunta ao provedor a distância de um trecho.
 *
 * **O lugar vai como nome, UF e país, não como coordenada.** A lista embarcada
 * não guarda coordenada de propósito (ver `lib/municipios`): o que se quer é o
 * município, e é isso que o provedor resolve a partir do nome com a UF. Uma
 * coordenada nossa seria um ponto escolhido dentro da cidade, roteado como se
 * fosse a cidade.
 */
async function perguntarAoProvedor(
  origem: Municipio,
  destino: Municipio,
  chave: string,
): Promise<number> {
  const resposta = await fetch(
    'https://routes.googleapis.com/directions/v2:computeRoutes',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': chave,
        'X-Goog-FieldMask': 'routes.distanceMeters',
      },
      body: JSON.stringify({
        origin: { address: enderecoDoMunicipio(origem) },
        destination: { address: enderecoDoMunicipio(destino) },
        travelMode: 'DRIVE',
      }),
    },
  )

  if (resposta.status === 429) {
    throw new LimiteDeTaxaError('Google Routes', esperaPedida(resposta))
  }
  if (resposta.status === 401 || resposta.status === 403) {
    // Credencial e cota não se resolvem repetindo: quem espera é uma pessoa
    // olhando a tela, e insistir só troca um erro claro por uma espera longa.
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
    throw new Error('o provedor não devolveu rota entre os dois municípios')
  }
  return metros / 1000
}

async function esperar(ms: number): Promise<void> {
  if (ms <= 0) return
  await new Promise((resolver) => setTimeout(resolver, ms))
}

/**
 * Distância de um trecho, do cache ou do provedor.
 *
 * Grava no cache o que obteve. A gravação acontece depois da resposta e antes
 * do retorno, porque o valor é fato de geografia: ele vale para a próxima
 * pessoa mesmo que esta viagem acabe sendo recusada na validação.
 */
async function trechoRodoviario(
  db: Firestore,
  origem: Municipio,
  destino: Municipio,
): Promise<TrechoDeRota> {
  const id = idRotaCache([origem.codigoIbge, destino.codigoIbge])
  const ref = db.collection(COLECAO.rotaCache).doc(id)

  const guardado = await ref.get()
  if (guardado.exists) {
    const dados = guardado.data() as DocRotaCache
    return { origem, destino, distanciaKm: dados.distanciaKm, doCache: true }
  }

  const chave = chaveDeRotaDaAplicacao()
  let ultimo: unknown = null
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      const distanciaKm = await perguntarAoProvedor(origem, destino, chave)
      const dados: DocRotaCache = {
        sequenciaIbge: [origem.codigoIbge, destino.codigoIbge],
        distanciaKm,
        provedor: PROVEDOR,
        calculadoEm: hojeIso(),
      }
      await ref.set(dados)
      return { origem, destino, distanciaKm, doCache: false }
    } catch (erro) {
      // Chave e cota não melhoram com insistência; limite por minuto, sim.
      if (erro instanceof ProvedorIndisponivelError) {
        throw new RotaIndisponivelError(origem, destino, erro.message)
      }
      ultimo = erro
      if (erro instanceof LimiteDeTaxaError) {
        await esperar(erro.esperarMs ?? tentativa * 500)
      } else {
        await esperar(tentativa * 300)
      }
    }
  }

  throw new RotaIndisponivelError(
    origem,
    destino,
    ultimo instanceof Error ? ultimo.message : 'falha ao consultar o provedor',
  )
}

/**
 * O trajeto inteiro, trecho a trecho consecutivo (§7.5).
 *
 * Sequencial, e não em paralelo: o provedor tem limite por minuto, e uma rajada
 * de quatro chamadas simultâneas é o jeito mais fácil de tomar um 429 numa
 * viagem que teria funcionado.
 */
export async function trajetoRodoviario(
  db: Firestore,
  paradas: Municipio[],
): Promise<TrechoDeRota[]> {
  if (paradas.length < 2) {
    throw new Error('Um trajeto precisa de pelo menos origem e destino.')
  }

  const trechos: TrechoDeRota[] = []
  for (let i = 0; i + 1 < paradas.length; i++) {
    trechos.push(await trechoRodoviario(db, paradas[i], paradas[i + 1]))
  }
  return trechos
}

/**
 * Acesso ao Firestore — CLAUDE.md §11.2.
 *
 * Este módulo só roda no servidor. O cliente nunca consulta o Firestore
 * diretamente: quem lê e escreve é o Admin SDK, dentro de Server Components,
 * Route Handlers e dos scripts de carga. O que chega ao navegador é o agregado
 * que a tela desenha.
 *
 * O Admin SDK passa por cima das Security Rules. As rules em `firestore.rules`
 * negam tudo justamente por isso: elas são a última linha de defesa se algum
 * caminho de cliente for aberto por engano.
 */
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

import { credenciaisFirebase } from '@/lib/env'

const NOME_DA_APP = 'fgv-descarboniza'

function inicializar(): App {
  const existente = getApps().find((app) => app.name === NOME_DA_APP)
  if (existente) return existente

  const credencial = credenciaisFirebase()

  // Sem `credential`, o Admin SDK procura a credencial padrão do ambiente
  // (GOOGLE_APPLICATION_CREDENTIALS). Com as três variáveis, monta o certificado.
  if (credencial.modo === 'service-account') {
    return initializeApp(
      {
        credential: cert({
          projectId: credencial.projectId,
          clientEmail: credencial.clientEmail,
          privateKey: credencial.privateKey,
        }),
        projectId: credencial.projectId,
      },
      NOME_DA_APP,
    )
  }

  return initializeApp({ projectId: credencial.projectId }, NOME_DA_APP)
}

let instancia: Firestore | undefined

/**
 * Firestore do projeto. A instância é única por processo: em desenvolvimento o
 * hot reload reexecutaria a inicialização a cada recompilação.
 *
 * `ignoreUndefinedProperties` fica desligado de propósito. Campo ausente tem que
 * ser gravado como `null` explícito — é assim que "sem empresa" continua sendo
 * categoria visível na agregação (§9.10) em vez de sumir do documento.
 */
export function firestore(): Firestore {
  if (!instancia) {
    instancia = getFirestore(inicializar())
  }
  return instancia
}

/** Verificação de token e de sessão. Usado pela camada de autenticação. */
export function authAdmin(): Auth {
  return getAuth(inicializar())
}

/**
 * Nomes de coleção num lugar só (§9.2). String solta espalhada pelo código é
 * como se erra o nome de uma coleção e se cria outra, vazia, sem nenhum erro.
 *
 * As quatro coleções de emissão do inventário são `mobilidade`, `viagemTrecho`,
 * `embarque` e `entregaRodoviaria`. **`viagemRegistrada` não é uma delas**
 * (§0.1): é o programa de viagens, que compartilha casca, sessão e visual com o
 * inventário e nada além disso.
 */
export const COLECAO = {
  funcionario: 'funcionario',
  mobilidade: 'mobilidade',
  viagemTrecho: 'viagemTrecho',
  /** Programa de viagens, não inventário (§0.1, §7.5). */
  viagemRegistrada: 'viagemRegistrada',
  embarque: 'embarque',
  /** Entregas da distribuição rodoviária às filiais (§9, §10.11). */
  entregaRodoviaria: 'entregaRodoviaria',
  containerPortoMes: 'containerPortoMes',
  fatorEmissao: 'fatorEmissao',
  aeroporto: 'aeroporto',
  /** Portos, pelo código UN/LOCODE. Cadastro de apoio do módulo marítimo. */
  porto: 'porto',
  municipio: 'municipio',
  rotaCache: 'rotaCache',
  usuarioPerfil: 'usuarioPerfil',
} as const

export type NomeDeColecao = (typeof COLECAO)[keyof typeof COLECAO]

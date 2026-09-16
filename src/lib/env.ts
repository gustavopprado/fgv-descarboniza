/**
 * Acesso a variáveis de ambiente — sempre no servidor.
 *
 * Nada aqui pode virar `NEXT_PUBLIC_` (CLAUDE.md §11.2). A coordenada da
 * fábrica é parâmetro de ambiente e nunca constante no código (§6.2).
 *
 * Toda leitura falha explicitamente quando a variável não existe: é melhor o
 * script parar do que calcular com um padrão silencioso.
 */

export function obrigatoria(nome: string): string {
  const valor = process.env[nome]
  if (valor === undefined || valor.trim() === '') {
    throw new Error(
      `Variável de ambiente ausente: ${nome}. Veja .env.example.`,
    )
  }
  return valor.trim()
}

export function opcional(nome: string): string | undefined {
  const valor = process.env[nome]
  return valor === undefined || valor.trim() === '' ? undefined : valor.trim()
}

function numeroObrigatorio(nome: string): number {
  const bruto = obrigatoria(nome)
  const valor = Number(bruto)
  if (!Number.isFinite(valor)) {
    throw new Error(`Variável de ambiente ${nome} não é um número.`)
  }
  return valor
}

/**
 * Credenciais do Admin SDK. Duas formas, nesta ordem:
 *
 *  1. as três variáveis da service account — é o que funciona na Vercel, onde
 *     não há arquivo em disco;
 *  2. `GOOGLE_APPLICATION_CREDENTIALS` apontando para o JSON da service account
 *     — conveniente na máquina de quem roda as cargas.
 *
 * Sem nenhuma das duas, falha explicitamente. O JSON da service account nunca
 * entra no repositório (§2.1).
 */
export type CredenciaisFirebase =
  | {
      modo: 'service-account'
      projectId: string
      clientEmail: string
      privateKey: string
    }
  | { modo: 'padrao-do-ambiente'; projectId: string }

export function credenciaisFirebase(): CredenciaisFirebase {
  const projectId = obrigatoria('FIREBASE_PROJECT_ID')
  const clientEmail = opcional('FIREBASE_CLIENT_EMAIL')
  const privateKey = opcional('FIREBASE_PRIVATE_KEY')

  if (clientEmail && privateKey) {
    return {
      modo: 'service-account',
      projectId,
      clientEmail,
      // A chave viaja com \n escapado quando vem de variável de ambiente; sem
      // desfazer isso o Admin SDK recusa o PEM.
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }
  }

  if (opcional('GOOGLE_APPLICATION_CREDENTIALS')) {
    return { modo: 'padrao-do-ambiente', projectId }
  }

  throw new Error(
    'Credencial do Firebase ausente. Informe FIREBASE_CLIENT_EMAIL e ' +
      'FIREBASE_PRIVATE_KEY, ou aponte GOOGLE_APPLICATION_CREDENTIALS para o ' +
      'JSON da service account. Veja .env.example.',
  )
}

/** Origem dos deslocamentos de mobilidade. Nunca hardcoded (§6.2). */
export function coordenadaFabrica(): { latitude: number; longitude: number } {
  return {
    latitude: numeroObrigatorio('FABRICA_LATITUDE'),
    longitude: numeroObrigatorio('FABRICA_LONGITUDE'),
  }
}

/** Dias úteis por mês usados na mobilidade. Parâmetro, não constante (§6.2). */
export function diasUteisMes(): number {
  return numeroObrigatorio('MOBILIDADE_DIAS_UTEIS_MES')
}

/** Recorte com menos que isso não vai para a tela (§3.1). */
export function supressaoMinima(): number {
  return numeroObrigatorio('MOBILIDADE_SUPRESSAO_MINIMA')
}

/**
 * **Não existe data de corte, e a ausência é deliberada** (§0.1, §7).
 *
 * `VIAGENS_CORTE_FONTE` existiu enquanto se acreditou que o relatório da agência
 * e o formulário do viajante eram a mesma série, separadas por uma data. São
 * dois sistemas: um inventário alimentado por planilha e um programa de registro
 * voluntário. Não há o que cortar, e variável de ambiente que ninguém lê é
 * armadilha esperando alguém encontrar.
 */

/**
 * Parâmetros que a tela de método declara (§10).
 *
 * Todos são lidos como opcionais: a tela de método precisa abrir mesmo com
 * ambiente incompleto, justamente para mostrar o que falta. Quem calcula é que
 * exige — e quem exige falha alto.
 */
export function parametrosDeclarados(): {
  geocodeProvedor: string | null
  rotasProvedor: string | null
  mobilidadeDistanciaModo: string | null
  mobilidadeDistanciaMaximaKm: string | null
  mobilidadeAnoBase: string | null
} {
  return {
    geocodeProvedor: opcional('GEOCODE_PROVEDOR') ?? null,
    rotasProvedor: opcional('ROTAS_PROVEDOR') ?? null,
    mobilidadeDistanciaModo: opcional('MOBILIDADE_DISTANCIA_MODO') ?? null,
    mobilidadeDistanciaMaximaKm: opcional('MOBILIDADE_DISTANCIA_MAXIMA_KM') ?? null,
    mobilidadeAnoBase: opcional('MOBILIDADE_ANO_BASE') ?? null,
  }
}

/** Domínio do Workspace autorizado a entrar (§11.4). */
export function dominioWorkspace(): string {
  return obrigatoria('GOOGLE_WORKSPACE_DOMINIO')
}

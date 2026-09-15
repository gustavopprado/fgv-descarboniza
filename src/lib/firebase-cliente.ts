/**
 * SDK web do Firebase — **só autenticação** (CLAUDE.md §11.2).
 *
 * Este é o único ponto em que o navegador fala com o Firebase, e ele fala
 * apenas para provar quem é. O cliente **nunca** consulta o Firestore: o ID
 * token é trocado por um cookie de sessão no servidor e descartado em seguida.
 *
 * A configuração daqui é pública por natureza — não é credencial —, mas carrega
 * o id do projeto, que é identificador de infraestrutura e não se versiona
 * (§2.1). Por isso vem de variável de ambiente, não de constante.
 */
import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth'

const NOME_DA_APP = 'fgv-descarboniza-web'

function exigir(nome: string, valor: string | undefined): string {
  if (valor === undefined || valor.trim() === '') {
    throw new Error(`Variável de ambiente ausente: ${nome}. Veja .env.example.`)
  }
  return valor.trim()
}

function app(): FirebaseApp {
  if (getApps().some((a) => a.name === NOME_DA_APP)) return getApp(NOME_DA_APP)

  return initializeApp(
    {
      apiKey: exigir(
        'NEXT_PUBLIC_FIREBASE_API_KEY',
        process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      ),
      authDomain: exigir(
        'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      ),
      projectId: exigir(
        'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      ),
      appId: exigir(
        'NEXT_PUBLIC_FIREBASE_APP_ID',
        process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      ),
    },
    NOME_DA_APP,
  )
}

export function authWeb(): Auth {
  return getAuth(app())
}

/**
 * Provedor Google com dica de domínio.
 *
 * `hd` é só dica: ele limpa a lista de contas que o Google oferece, e nada mais.
 * **A restrição de verdade é a do servidor** (§11.4), que confere o domínio do
 * e-mail antes de emitir qualquer cookie.
 */
export function provedorGoogle(): GoogleAuthProvider {
  const provedor = new GoogleAuthProvider()
  const dominio = process.env.NEXT_PUBLIC_WORKSPACE_DOMINIO
  if (dominio !== undefined && dominio.trim() !== '') {
    provedor.setCustomParameters({ hd: dominio.trim() })
  }
  return provedor
}

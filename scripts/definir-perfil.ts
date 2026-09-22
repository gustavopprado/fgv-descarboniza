/**
 * Concede e revoga perfil de acesso — CLAUDE.md §5 e §11.12.
 *
 * **Conta do domínio sem documento em `usuarioPerfil` recebe `gestor`** (§5.2):
 * vê as sete telas e registra a própria viagem. Este script existe para o que o
 * padrão não dá — `admin`, `sustentabilidade` e `importacao` — e para o que ele
 * dá demais: `colaborador`, que é **mais restrito** que o padrão.
 *
 * **`remover` devolve a pessoa ao padrão, não a tira do sistema.** Para
 * restringir alguém, grave `colaborador`; apagar o documento afrouxa. Tirar do
 * sistema inteiro é assunto do Workspace — fora do domínio não há login.
 *
 * Roda fora da aplicação, como as cargas.
 *
 * A pessoa precisa ter entrado ao menos uma vez, para existir no Firebase Auth.
 *
 * Uso:
 *   npm run perfil -- alguem@dominio papel [empresa]
 *   npm run perfil -- alguem@dominio remover
 *
 * Papéis: admin | sustentabilidade | gestor | importacao | colaborador
 */
import 'dotenv/config'

import { dominioWorkspace } from '../src/lib/env'
import type { DocUsuarioPerfil, Papel } from '../src/server/documentos/tipos'
import { COLECAO, authAdmin } from '../src/server/firestore'
import { conectarFirestore, ehEntrada, executar } from './_comum'

const PAPEIS: readonly Papel[] = [
  'admin',
  'sustentabilidade',
  'gestor',
  'importacao',
  'colaborador',
]

export const REMOVER = 'remover'

export type Comando =
  | { acao: 'conceder'; email: string; papel: Papel; empresa: string | null }
  | { acao: 'remover'; email: string }

function ehPapel(valor: string): valor is Papel {
  return (PAPEIS as readonly string[]).includes(valor)
}

/**
 * Lê os argumentos e recusa a combinação que não faz sentido.
 *
 * Separado da execução para poder ser testado sem banco: é aqui que mora a
 * regra de que empresa só existe no perfil `importacao` (§5) e de que o domínio
 * precisa ser o corporativo — conceder acesso a uma conta que o login recusaria
 * seria criar um perfil órfão que ninguém consegue usar nem encontrar.
 */
export function interpretarComando(
  argumentos: string[],
  dominioPermitido: string,
): Comando {
  const [email, alvo, empresa] = argumentos

  if (email === undefined || alvo === undefined) {
    throw new Error(
      'Uso: npm run perfil -- alguem@dominio papel [empresa]\n' +
        `     npm run perfil -- alguem@dominio ${REMOVER}\n` +
        `Papéis: ${PAPEIS.join(' | ')}`,
    )
  }

  const dominio = dominioPermitido.toLowerCase()
  if (!email.toLowerCase().endsWith(`@${dominio}`)) {
    throw new Error(
      `${email} está fora do domínio corporativo (@${dominio}). O login recusaria essa conta.`,
    )
  }

  if (alvo === REMOVER) {
    if (empresa !== undefined) {
      throw new Error(`"${REMOVER}" não aceita mais argumentos.`)
    }
    return { acao: 'remover', email: email.toLowerCase() }
  }

  if (!ehPapel(alvo)) {
    throw new Error(
      `Papel desconhecido: ${alvo}. Use um de: ${PAPEIS.join(', ')} — ou "${REMOVER}".`,
    )
  }
  if (alvo !== 'importacao' && empresa !== undefined) {
    throw new Error(
      'Empresa só faz sentido no perfil "importacao", que pode ser filtrado por empresa (§5).',
    )
  }

  return {
    acao: 'conceder',
    email: email.toLowerCase(),
    papel: alvo,
    empresa: empresa ?? null,
  }
}

async function principal(): Promise<void> {
  const comando = interpretarComando(process.argv.slice(2), dominioWorkspace())

  const usuario = await authAdmin()
    .getUserByEmail(comando.email)
    .catch(() => {
      throw new Error(
        `${comando.email} ainda não existe no Firebase Auth. Peça para a pessoa entrar ` +
          'uma vez; o perfil é concedido depois.',
      )
    })

  const { db, encerrar } = conectarFirestore()
  try {
    const documento = db.collection(COLECAO.usuarioPerfil).doc(usuario.uid)

    if (comando.acao === 'remover') {
      await documento.delete()
      // O papel é lido do perfil a cada requisição, então a remoção já valeria
      // na próxima. Revogar o token derruba junto a sessão que estiver aberta,
      // para a pessoa reentrar já com o papel novo em vez de seguir com o antigo
      // até o cookie expirar.
      await authAdmin().revokeRefreshTokens(usuario.uid)
      console.log(
        `Perfil de ${comando.email} removido e sessão encerrada.\n` +
          'ATENÇÃO: remover NÃO tira o acesso. Sendo do domínio, a pessoa volta\n' +
          'ao papel padrão (§5.2) e continua vendo tudo. Para restringir, grave\n' +
          '"colaborador", que é mais restrito que o padrão.',
      )
      return
    }

    const perfil: DocUsuarioPerfil = {
      email: comando.email,
      papel: comando.papel,
      empresa: comando.empresa,
      funcionarioId: null,
    }

    // ID determinístico: o uid. Reexecutar corrige o papel em vez de duplicar,
    // e o papel novo vale na requisição seguinte, sem precisar deslogar ninguém.
    await documento.set(perfil)
    console.log(`Perfil "${comando.papel}" concedido a ${comando.email}.`)
    if (comando.empresa !== null) {
      console.log('Consultas limitadas à empresa informada.')
    }
  } finally {
    await encerrar()
  }
}

if (ehEntrada(import.meta.url)) {
  void executar('definir-perfil', principal)
}

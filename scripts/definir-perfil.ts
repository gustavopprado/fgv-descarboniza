/**
 * Concede e revoga perfil de acesso — CLAUDE.md §5 e §11.12.
 *
 * Conta autenticada sem documento em `usuarioPerfil` não recebe papel nenhum
 * (não há padrão, não há "colaborador por enquanto"): quem entra sem perfil vê
 * um aviso e não vê dado. Este script é o único caminho para conceder ou tirar
 * acesso, e roda fora da aplicação, como as cargas.
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
      // em vez de deixá-la viva numa tela que não mostra mais nada.
      await authAdmin().revokeRefreshTokens(usuario.uid)
      console.log(`Perfil de ${comando.email} removido e sessão encerrada.`)
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

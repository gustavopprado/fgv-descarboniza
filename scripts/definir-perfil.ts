/**
 * Concede perfil de acesso a uma conta — CLAUDE.md §5.
 *
 * Conta autenticada sem documento em `usuarioPerfil` não recebe papel nenhum
 * (não há padrão, não há "colaborador por enquanto"): quem entra sem perfil vê
 * um aviso e não vê dado. Este script é o único caminho para conceder acesso, e
 * roda fora da aplicação, como as cargas.
 *
 * A pessoa precisa ter entrado ao menos uma vez, para existir no Firebase Auth.
 *
 * Uso:
 *   npm run perfil -- alguem@dominio papel [empresa]
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

function ehPapel(valor: string): valor is Papel {
  return (PAPEIS as readonly string[]).includes(valor)
}

async function principal(): Promise<void> {
  const [email, papel, empresa] = process.argv.slice(2)

  if (email === undefined || papel === undefined) {
    throw new Error(
      'Uso: npm run perfil -- alguem@dominio papel [empresa]\n' +
        `Papéis: ${PAPEIS.join(' | ')}`,
    )
  }
  if (!ehPapel(papel)) {
    throw new Error(`Papel desconhecido: ${papel}. Use um de: ${PAPEIS.join(', ')}`)
  }

  const dominio = dominioWorkspace().toLowerCase()
  if (!email.toLowerCase().endsWith(`@${dominio}`)) {
    throw new Error(
      `${email} está fora do domínio corporativo (@${dominio}). O login recusaria essa conta.`,
    )
  }
  if (papel !== 'importacao' && empresa !== undefined) {
    throw new Error(
      'Empresa só faz sentido no perfil "importacao", que pode ser filtrado por empresa (§5).',
    )
  }

  const usuario = await authAdmin()
    .getUserByEmail(email)
    .catch(() => {
      throw new Error(
        `${email} ainda não existe no Firebase Auth. Peça para a pessoa entrar uma vez; ` +
          'o perfil é concedido depois.',
      )
    })

  const perfil: DocUsuarioPerfil = {
    email: email.toLowerCase(),
    papel,
    empresa: empresa ?? null,
    funcionarioId: null,
  }

  const { db, encerrar } = conectarFirestore()
  try {
    // ID determinístico: o uid. Reexecutar corrige o papel em vez de duplicar.
    await db.collection(COLECAO.usuarioPerfil).doc(usuario.uid).set(perfil)
    console.log(`Perfil "${papel}" concedido a ${email}.`)
    if (empresa !== undefined) console.log(`Consultas limitadas à empresa informada.`)
  } finally {
    await encerrar()
  }
}

if (ehEntrada(import.meta.url)) {
  void executar('definir-perfil', principal)
}

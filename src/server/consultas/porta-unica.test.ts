/**
 * Guarda arquitetural da §9.10: **nenhuma tela lê coleção por fora da camada de
 * consulta.**
 *
 * Essa regra concentra num lugar só o anonimato, a supressão de grupos pequenos
 * e a autorização. Se uma tela alcançar o Firestore direto, as três garantias
 * caem juntas — e isso é o tipo de coisa que entra por descuido, num import
 * conveniente, e não aparece em nenhuma revisão de número.
 *
 * Por isso a regra é testada, e não só escrita.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const RAIZ_DAS_TELAS = 'src/app'

/** Import que dá acesso direto ao banco, sem passar pela camada de consulta. */
const ACESSO_DIRETO = [
  'firebase-admin',
  'server/firestore',
  'server/escrita',
  'firestore()',
]

function arquivosDe(diretorio: string): string[] {
  let encontrados: string[] = []
  for (const nome of readdirSync(diretorio)) {
    const caminho = join(diretorio, nome)
    if (statSync(caminho).isDirectory()) {
      encontrados = encontrados.concat(arquivosDe(caminho))
    } else if (/\.tsx?$/.test(nome)) {
      encontrados.push(caminho)
    }
  }
  return encontrados
}

test('nenhuma tela alcança o Firestore por fora da camada de consulta', () => {
  const infratores: string[] = []

  for (const caminho of arquivosDe(RAIZ_DAS_TELAS)) {
    const conteudo = readFileSync(caminho, 'utf8')
    for (const padrao of ACESSO_DIRETO) {
      if (conteudo.includes(padrao)) {
        infratores.push(`${caminho} usa "${padrao}"`)
      }
    }
  }

  assert.deepEqual(
    infratores,
    [],
    'Tela lendo banco direto: o anonimato, a supressão e a autorização ficam de fora. ' +
      'Use src/server/consultas.',
  )
})

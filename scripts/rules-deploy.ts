/**
 * Publica as regras do Firestore.
 *
 * O `firebase deploy` precisa saber o projeto, e o caminho normal para isso é um
 * `.firebaserc` na raiz — que seria versionado e carregaria o id do projeto, um
 * identificador de infraestrutura que não entra no git (§2.1).
 *
 * Então o projeto vem do `.env`, que já tem o valor e não é versionado. Fonte
 * única, nada para sincronizar à mão e nada a mais para ignorar.
 *
 * Uso:
 *   npm run rules:deploy
 */
import 'dotenv/config'
import { spawn } from 'node:child_process'

import { obrigatoria } from '../src/lib/env'
import { ehEntrada } from './_comum'

function principal(): void {
  const projeto = obrigatoria('FIREBASE_PROJECT_ID')

  console.log(`Publicando firestore.rules no projeto ${projeto}...`)
  console.log('As regras negam leitura e escrita para qualquer cliente (§11.6).\n')

  // `shell: true` porque no Windows o executável é firebase.cmd.
  const processo = spawn(
    'firebase',
    ['deploy', '--only', 'firestore:rules', '--project', projeto],
    { stdio: 'inherit', shell: true },
  )

  processo.on('error', (erro) => {
    console.error(
      `\nNão consegui executar o firebase CLI: ${erro.message}\n` +
        'Instale com "npm i -g firebase-tools" e autentique com "firebase login".',
    )
    process.exitCode = 1
  })

  processo.on('exit', (codigo) => {
    process.exitCode = codigo ?? 1
  })
}

if (ehEntrada(import.meta.url)) principal()

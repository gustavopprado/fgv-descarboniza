/**
 * Guarda contra credencial em arquivo versionado — CLAUDE.md §2.1.
 *
 * O `.env.example` é o arquivo mais perigoso do repositório: ele existe para ser
 * público e tem exatamente o formato de um arquivo de segredos, então preencher
 * o arquivo errado é um erro fácil de cometer e caro de desfazer — histórico
 * público não se apaga.
 *
 * Este teste varre os arquivos versionados procurando o que tem cara de
 * credencial. Ele não substitui a revisão do commit; serve para que o erro
 * apareça em `npm test` e no gancho de pré-commit, e não no GitHub.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

/** Arquivos versionados que podem, por engano, receber valor real. */
const VERSIONADOS = ['.env.example']

/**
 * Padrões que denunciam credencial de verdade. São propositalmente estreitos: o
 * objetivo é não disparar em placeholder, para o teste não virar ruído que se
 * aprende a ignorar.
 */
const PADROES: { nome: string; regex: RegExp }[] = [
  { nome: 'chave privada PEM com corpo real', regex: /BEGIN[ A-Z]*PRIVATE KEY-----\\?n?[A-Za-z0-9+/]{40}/ },
  { nome: 'chave de API do Google', regex: /AIza[0-9A-Za-z_-]{30,}/ },
  { nome: 'client secret do OAuth', regex: /GOCSPX-[A-Za-z0-9_-]{12,}/ },
  { nome: 'token do GitHub', regex: /gh[pousr]_[A-Za-z0-9]{30,}/ },
  { nome: 'chave de acesso da AWS', regex: /AKIA[0-9A-Z]{16}/ },
]

test('nenhum arquivo versionado carrega credencial real', () => {
  const achados: string[] = []

  for (const caminho of VERSIONADOS) {
    let conteudo: string
    try {
      conteudo = readFileSync(caminho, 'utf8')
    } catch {
      continue // arquivo ausente não é o problema que este teste resolve
    }
    for (const { nome, regex } of PADROES) {
      if (regex.test(conteudo)) achados.push(`${caminho}: ${nome}`)
    }
  }

  assert.deepEqual(
    achados,
    [],
    'Credencial real em arquivo versionado. Mova os valores para .env, que é ' +
      'ignorado pelo git, e restaure o arquivo com "git checkout -- <arquivo>". ' +
      'Se isso já foi commitado, a chave precisa ser rotacionada.',
  )
})

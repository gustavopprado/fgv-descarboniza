/**
 * Infraestrutura comum dos scripts de carga.
 *
 * Os scripts rodam fora da aplicação, na máquina de quem opera a carga
 * (CLAUDE.md §5: não existe tela de upload). Eles leem arquivos que não são
 * versionados e nunca escrevem cópia, log ou dump do que leram.
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { Firestore } from 'firebase-admin/firestore'

import { firestore } from '../src/server/firestore'

export type Conexao = {
  db: Firestore
  encerrar: () => Promise<void>
}

/**
 * Firestore para os scripts de carga. `terminate()` no fim libera a conexão
 * gRPC; sem isso o processo fica pendurado depois de terminar o trabalho.
 */
export function conectarFirestore(): Conexao {
  const db = firestore()
  return { db, encerrar: () => db.terminate() }
}

/**
 * Caminho de uma base. Vem de argumento de linha de comando, de variável de
 * ambiente ou do padrão — nessa ordem. O caminho nunca é impresso junto de
 * conteúdo do arquivo.
 */
export function caminhoDaBase(
  argumento: string | undefined,
  variavel: string,
  padrao: string,
): string {
  return resolve(argumento ?? process.env[variavel] ?? padrao)
}

export function lerJson<T>(caminho: string): T {
  try {
    return JSON.parse(readFileSync(caminho, 'utf8')) as T
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro)
    throw new Error(`Não foi possível ler ${caminho}: ${motivo}`)
  }
}

/** Número com casas fixas, para o relatório de conferência no terminal. */
export function n(valor: number, casas = 1): string {
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })
}

export function tituloDaEtapa(texto: string): void {
  console.log(`\n${texto}`)
  console.log('─'.repeat(texto.length))
}

/**
 * Verdadeiro só quando o módulo foi chamado direto pela linha de comando.
 * Sem isso, importar uma função de um script dispararia a carga inteira.
 */
export function ehEntrada(importMetaUrl: string): boolean {
  const invocado = process.argv[1]
  if (!invocado) return false
  return importMetaUrl === pathToFileURL(invocado).href
}

/** Encerra o processo relatando a falha sem despejar dado da base no console. */
export async function executar(
  nome: string,
  tarefa: () => Promise<void>,
): Promise<void> {
  try {
    await tarefa()
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro)
    console.error(`\n[${nome}] falhou: ${motivo}`)
    process.exitCode = 1
  }
}

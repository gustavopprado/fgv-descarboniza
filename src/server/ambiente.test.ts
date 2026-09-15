/**
 * Guarda do `.env.example` — CLAUDE.md §2 e §14.
 *
 * O arquivo de exemplo é versionado e público, e é o mais perigoso do
 * repositório: ele tem exatamente o formato de um arquivo de segredos.
 * `segredos.test.ts` já vigia credencial ali dentro. Este teste vigia outra
 * coisa, mais silenciosa: **placeholder que passaria por valor real.**
 *
 * `FABRICA_LATITUDE="0.0000"` parecia inofensivo e é uma coordenada válida no
 * Golfo da Guiné. Uma carga rodada a partir dela mediria a distância de todo
 * mundo até o oceano; como distância acima do limite vira exceção, e exceção
 * fica fora da média por desenho, o módulo inteiro ficaria em exceção com média
 * válida e vazia — erro que não estoura em lugar nenhum. O mesmo vale para uma
 * data de corte plausível, que já foi lida como compromisso uma vez.
 *
 * Para estes, exemplo vazio é mais seguro: o código recusa rodar sem o valor, e
 * recusar é melhor que calcular a partir de um palpite.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

/**
 * Variáveis em que um valor de exemplo produziria número errado em silêncio.
 * Não é a lista de tudo que é obrigatório: é a lista do que engana.
 */
const PRECISAM_VIR_VAZIAS = [
  'FABRICA_LATITUDE',
  'FABRICA_LONGITUDE',
  'VIAGENS_CORTE_FONTE',
  'MOBILIDADE_ANO_BASE',
  'FATORES_VIGENCIA_INICIO',
  'MARITIMO_BASE_DE_DATA',
]

function valorNoExemplo(conteudo: string, nome: string): string | null {
  const linha = conteudo
    .split('\n')
    .find((l) => l.trimStart().startsWith(`${nome}=`))
  if (linha === undefined) return null
  return linha.slice(linha.indexOf('=') + 1).trim().replace(/^"|"$/g, '')
}

test('placeholder plausível não volta ao .env.example', () => {
  const conteudo = readFileSync('.env.example', 'utf8')

  for (const nome of PRECISAM_VIR_VAZIAS) {
    const valor = valorNoExemplo(conteudo, nome)
    assert.notEqual(valor, null, `${nome} sumiu do .env.example`)
    assert.equal(
      valor,
      '',
      `${nome} tem valor de exemplo. Um valor plausível aqui vira número errado ` +
        'em silêncio: deixe vazio e deixe o código recusar rodar sem ele.',
    )
  }
})

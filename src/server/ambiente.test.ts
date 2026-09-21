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
 * válida e vazia — erro que não estoura em lugar nenhum.
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
  'MOBILIDADE_ANO_BASE',
  'VIAGENS_ANO_BASE',
  'FATORES_VIGENCIA_INICIO',
  // Um número plausível aqui vira proporção de adesão errada, e proporção
  // errada parece funcionar (§13). Vazio, a tela declara que não há denominador.
  'PROGRAMA_QUADRO',
  // Uma data plausível aqui trancaria submissão que ninguém decidiu trancar, e
  // o viajante veria o botão sumir sem nada ter sido fechado.
  'PROGRAMA_FECHADO_ATE',
  // Os dois limiares do marítimo decidem o que recebe alerta e o que **não é
  // importado** (§8.1.1). Um valor plausível aqui viraria, sem ninguém rever,
  // ou um alerta que nunca dispara ou uma linha de emissão verdadeira recusada.
  // Eles se escolhem medindo a fração da base que cada candidato marcaria, e
  // essa medição é por base — não cabe num exemplo.
  'MARITIMO_LIMIAR_ATIPICO',
  'MARITIMO_LIMIAR_IMPOSSIVEL',
  // E a amostra mínima decide quando um corredor vira referência: um número
  // aqui mudaria em silêncio o que a cascata estima e o que ela deixa passar.
  'MARITIMO_AMOSTRA_MINIMA_CORREDOR',
  // O limiar das transportadoras decide o que **não é importado** (§9.3). Um
  // número plausível aqui ou descartaria entrega doméstica verdadeira ou
  // importaria uma importação como se fosse caminhão, e nos dois casos o total
  // muda sem ninguém rever. Ele também se escolhe medindo a base.
  'TRANSPORTADORAS_DISTANCIA_MAXIMA_KM',
]

/**
 * Variáveis que saíram de propósito, e que não podem voltar por distração.
 *
 * `MARITIMO_BASE_DE_DATA` prometia escolher entre duas bases de data, e só uma
 * tem caminho no código — a outra existe apenas na aba de resumo, que é
 * agregada. Variável que aceita um valor que o código não honra é pior que
 * constante: ela afirma uma configuração que não existe. A escolha ficou
 * constante em `src/lib/env.ts`, declarada na tela de método (§8.3).
 *
 * `VIAGENS_CORTE_FONTE` saiu pelo mesmo tipo de motivo, na §0.1: a premissa que
 * a justificava foi apagada, e variável que ninguém lê é armadilha esperando
 * alguém encontrar (§7).
 */
const NAO_PODEM_VOLTAR = ['MARITIMO_BASE_DE_DATA', 'VIAGENS_CORTE_FONTE']

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

test('variável removida de propósito não volta ao .env.example', () => {
  const conteudo = readFileSync('.env.example', 'utf8')

  for (const nome of NAO_PODEM_VOLTAR) {
    assert.equal(
      valorNoExemplo(conteudo, nome),
      null,
      `${nome} voltou ao .env.example. Ela foi removida porque o código não a lê — ` +
        'variável que ninguém honra promete configuração que não existe.',
    )
  }
})

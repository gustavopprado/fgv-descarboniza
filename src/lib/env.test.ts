/**
 * Guarda da separação entre as duas chaves de rota — CLAUDE.md §7.4 e §12.8.
 *
 * São duas chaves porque são dois destinos. A das cargas roda da máquina de
 * quem opera, onde o IP é estável e a chave pode ser restrita por ele; a da
 * aplicação sai da Vercel, cujo IP de saída não é, e lá o controle é restrição
 * por API mais teto de faturamento.
 *
 * **O que este arquivo prende é o caso que não estoura.** Enquanto o fallback
 * valia em produção, bastava `GOOGLE_ROUTES_API_KEY` aparecer no painel da
 * Vercel — por hábito, ou copiando o `.env` inteiro — para o formulário passar
 * a usar a chave das cargas. Nenhum teste falharia, nenhuma tela mudaria e o
 * número do inventário continuaria certo: o que muda é qual chave paga é
 * queimada, e por qual porta. Guarda que depende de alguém lembrar de não
 * configurar uma variável não é guarda.
 *
 * Toda massa aqui é fictícia, inventada do zero (§2.2).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { chaveDeRotaDaAplicacao } from './env'

const DO_APP = 'chave-ficticia-da-aplicacao'
const DAS_CARGAS = 'chave-ficticia-das-cargas'

/**
 * Roda a tarefa com o ambiente trocado e restaura depois.
 *
 * Síncrono de propósito: a função sob teste é síncrona, e a lição de 15/09 é
 * que restaurar o ambiente antes de a tarefa terminar faz o teste passar por
 * acidente — nos dois sentidos.
 */
function comAmbiente<T>(
  valores: Record<string, string | undefined>,
  tarefa: () => T,
): T {
  const anterior = { ...process.env }
  for (const [chave, valor] of Object.entries(valores)) {
    if (valor === undefined) delete process.env[chave]
    else process.env[chave] = valor
  }
  try {
    return tarefa()
  } finally {
    process.env = anterior
  }
}

test('em produção usa a chave da aplicação quando ela existe', () => {
  const chave = comAmbiente(
    {
      NODE_ENV: 'production',
      GOOGLE_ROUTES_API_KEY_APP: DO_APP,
      GOOGLE_ROUTES_API_KEY: DAS_CARGAS,
    },
    chaveDeRotaDaAplicacao,
  )
  assert.equal(chave, DO_APP)
})

test('em produção NÃO cai na chave das cargas — é a guarda desta suíte', () => {
  assert.throws(
    () =>
      comAmbiente(
        {
          NODE_ENV: 'production',
          GOOGLE_ROUTES_API_KEY_APP: undefined,
          GOOGLE_ROUTES_API_KEY: DAS_CARGAS,
        },
        chaveDeRotaDaAplicacao,
      ),
    /GOOGLE_ROUTES_API_KEY_APP/,
    'com a chave das cargas presente e a da aplicação ausente, produção tem ' +
      'que recusar em vez de devolver a das cargas',
  )
})

test('a recusa em produção diz que não há queda para a chave das cargas', () => {
  assert.throws(
    () =>
      comAmbiente(
        {
          NODE_ENV: 'production',
          GOOGLE_ROUTES_API_KEY_APP: undefined,
          GOOGLE_ROUTES_API_KEY: DAS_CARGAS,
        },
        chaveDeRotaDaAplicacao,
      ),
    /não há queda/,
    'a mensagem precisa dizer por que falhou: quem vir o erro com a variável ' +
      'das cargas configurada vai supor que o sistema não a enxergou',
  )
})

test('fora de produção o fallback continua, que é o motivo de ele existir', () => {
  const chave = comAmbiente(
    {
      NODE_ENV: 'development',
      GOOGLE_ROUTES_API_KEY_APP: undefined,
      GOOGLE_ROUTES_API_KEY: DAS_CARGAS,
    },
    chaveDeRotaDaAplicacao,
  )
  assert.equal(
    chave,
    DAS_CARGAS,
    'sem isto, quem desenvolve precisaria de duas chaves na máquina',
  )
})

test('fora de produção a chave da aplicação ainda tem precedência', () => {
  const chave = comAmbiente(
    {
      NODE_ENV: 'development',
      GOOGLE_ROUTES_API_KEY_APP: DO_APP,
      GOOGLE_ROUTES_API_KEY: DAS_CARGAS,
    },
    chaveDeRotaDaAplicacao,
  )
  assert.equal(chave, DO_APP)
})

test('sem nenhuma das duas, falha explicitamente em vez de devolver vazio', () => {
  assert.throws(
    () =>
      comAmbiente(
        {
          NODE_ENV: 'development',
          GOOGLE_ROUTES_API_KEY_APP: undefined,
          GOOGLE_ROUTES_API_KEY: undefined,
        },
        chaveDeRotaDaAplicacao,
      ),
    /Sem chave de rota/,
  )
})

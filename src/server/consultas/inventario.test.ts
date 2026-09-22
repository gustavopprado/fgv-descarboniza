/**
 * A §3.1 nos dois lados, exercitada na camada de consulta.
 *
 * **A regra difere entre os módulos de propósito**, e o documento avisa que a
 * diferença vai parecer inconsistência para quem chegar depois. É por isso que
 * ela tem teste dos dois lados, no mesmo arquivo:
 *
 *  - **Mobilidade suprime** (§3.1.1). Bairro com pouca gente identifica essa
 *    gente, e vira "outros". Uniformizar para baixo tiraria daqui a única coisa
 *    que impede identificar um respondente pelo lugar onde mora.
 *  - **Viagens não suprime** (§3.1.2). Rota é fato da operação da empresa, e o
 *    destino voado por uma pessoa aparece pelo próprio nome. Uniformizar para
 *    cima devolveria uma supressão que escondia um terço da emissão aérea sem
 *    proteger ninguém — a emissão já estava no total.
 *
 * O que continua absoluto nos dois é a primeira regra da §3.1, e também está
 * aqui: **nenhum identificador de pessoa sai da camada.**
 *
 * **Toda a massa é fictícia, inventada do zero** (§2.2).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Firestore } from 'firebase-admin/firestore'

import type {
  DocAeroporto,
  DocMobilidade,
  DocViagemTrecho,
  Papel,
} from '../documentos/tipos'
import type { ContextoDeAcesso } from './acesso'
import { consultarMobilidade, consultarViagens } from './inventario'

const ANO = 2031
const LIMITE = '5'

function ctx(papel: Papel = 'admin'): ContextoDeAcesso {
  return {
    uid: 'uid-ficticio',
    email: 'pessoa.ficticia@exemplo.invalid',
    papel,
    empresa: null,
    funcionarioId: null,
  }
}

function trecho(parcial: Partial<DocViagemTrecho>): DocViagemTrecho {
  return {
    modulo: 'viagens',
    modal: 'aereo',
    escopo: 3,
    periodicidade: 'evento',
    ano: ANO,
    mes: `${ANO}-03`,
    empresa: null,
    fator: null,
    alertas: [],
    alertasCodigos: [],
    atualizadoEm: '2031-03-01',
    reservaId: 'reserva-ficticia',
    ordem: 1,
    funcionarioId: 'pessoa-ficticia-1',
    tipo: 'aereo',
    fonte: 'agencia',
    contabilizar: true,
    dataIda: '2031-03-10',
    dataVolta: null,
    origem: 'AAA',
    destino: 'BBB',
    companhia: null,
    voo: null,
    dataVoo: '2031-03-10',
    distanciaKm: 100,
    faixaDistancia: 'curta',
    passageiros: 1,
    co2Kg: 10,
    classeCabine: 'economica',
    multiplicadorClasse: 1,
    propriedadeVeiculo: null,
    combustivel: null,
    ocupantes: null,
    ...parcial,
  }
}

function resposta(parcial: Partial<DocMobilidade>): DocMobilidade {
  return {
    modulo: 'mobilidade',
    modal: 'terrestre',
    escopo: 3,
    periodicidade: 'mensal',
    ano: ANO,
    mes: null,
    empresa: null,
    fator: null,
    alertas: [],
    alertasCodigos: [],
    atualizadoEm: '2031-03-01',
    funcionarioId: 'pessoa-ficticia-1',
    anoBase: ANO,
    transporte: 'a_pe',
    combustivel: null,
    distanciaKm: 3,
    bairro: 'Bairro Fictício A',
    cidade: 'Cidade Fictícia',
    diasUteisMes: 21,
    co2KgMes: 0,
    excecao: false,
    motivoExcecao: null,
    ...parcial,
  }
}

function aeroporto(iata: string, regiao: string, lat: number, lon: number): DocAeroporto {
  return {
    iata,
    nome: `Aeroporto fictício ${iata}`,
    cidade: `Cidade fictícia ${iata}`,
    uf: null,
    utcOffset: null,
    latitude: lat,
    longitude: lon,
    regiao,
    regiaoCriterio: 'uf',
  }
}

function bancoCom(dados: Record<string, unknown[]>): Firestore {
  const colecao = (nome: string) => {
    const consulta = {
      where: () => consulta,
      get: async () => ({
        docs: (dados[nome] ?? []).map((d) => ({ data: () => d })),
      }),
    }
    return consulta
  }
  return { collection: colecao } as unknown as Firestore
}

async function comAmbiente<T>(
  valores: Record<string, string>,
  tarefa: () => Promise<T>,
): Promise<T> {
  const anterior = { ...process.env }
  Object.assign(process.env, valores)
  try {
    return await tarefa()
  } finally {
    process.env = anterior
  }
}

/* --------------------------------------------- viagens: sem supressão */

/** Um destino, uma rota e um corredor com uma pessoa só. */
const UMA_PESSOA_SO = [
  trecho({
    reservaId: 'r1',
    funcionarioId: 'pessoa-ficticia-1',
    origem: 'AAA',
    destino: 'ZZZ',
    dataVoo: '2031-03-10',
    co2Kg: 900,
  }),
  ...Array.from({ length: 6 }, (_, i) =>
    trecho({
      reservaId: `r${i + 2}`,
      ordem: 1,
      funcionarioId: `pessoa-ficticia-${i + 2}`,
      origem: 'AAA',
      destino: 'BBB',
      dataVoo: `2031-0${i + 1}-05`,
      co2Kg: 10,
    }),
  ),
]

const CADASTRO = [
  aeroporto('AAA', 'Sul', -25.5, -49.2),
  aeroporto('BBB', 'Sudeste', -23.4, -46.5),
  aeroporto('ZZZ', 'Europa', 50.0, 8.6),
]

test('destino voado por uma pessoa aparece pelo próprio nome', async () => {
  const dados = await comAmbiente({ MOBILIDADE_SUPRESSAO_MINIMA: LIMITE }, () =>
    consultarViagens(
      ctx(),
      {},
      bancoCom({ viagemTrecho: UMA_PESSOA_SO, aeroporto: CADASTRO }),
    ),
  )

  const solitario = dados.destinos.find((d) => d.rotulo === 'ZZZ')
  assert.notEqual(solitario, undefined, 'o destino de uma pessoa foi suprimido')
  assert.equal(solitario?.pessoas, 1)
  assert.equal(solitario?.co2Kg, 900)

  assert.equal(
    dados.rotas.some((r) => r.rotulo === 'AAA → ZZZ'),
    true,
    'a rota de uma pessoa foi suprimida',
  )
  assert.equal(
    [...dados.destinos, ...dados.rotas].some((r) => r.resto),
    false,
    'com poucos recortes não há linha de resto a montar',
  )
})

test('corredor voado por uma pessoa é desenhado, e nada fica sem lugar', async () => {
  const dados = await comAmbiente({ MOBILIDADE_SUPRESSAO_MINIMA: LIMITE }, () =>
    consultarViagens(
      ctx(),
      {},
      bancoCom({ viagemTrecho: UMA_PESSOA_SO, aeroporto: CADASTRO }),
    ),
  )

  const intercontinental = dados.mapa.corredores.find((c) => c.corredor.includes('Europa'))
  assert.notEqual(intercontinental, undefined, 'o corredor de uma pessoa não foi desenhado')
  assert.equal(intercontinental?.pessoas, 1)

  // A emissão desenhada é a emissão aérea inteira: não sobra peso sem lugar no
  // mapa, que era exatamente o estado que a §3.1.2 desfez.
  assert.equal(dados.mapa.co2KgDesenhado, dados.mapa.co2KgAereo)
  assert.equal(dados.mapa.semGeografia, 0)
})

test('a tabela de viagens diz quantas pessoas e quando, nunca quem', async () => {
  const dados = await comAmbiente({ MOBILIDADE_SUPRESSAO_MINIMA: LIMITE }, () =>
    consultarViagens(
      ctx(),
      {},
      bancoCom({ viagemTrecho: UMA_PESSOA_SO, aeroporto: CADASTRO }),
    ),
  )

  const frequente = dados.destinos.find((d) => d.rotulo === 'BBB')
  assert.equal(frequente?.pessoas, 6)
  assert.equal(frequente?.primeira, '2031-01-05')
  assert.equal(frequente?.ultima, '2031-06-05')

  // A primeira regra da §3.1 continua absoluta: nenhum identificador sai daqui.
  const saida = JSON.stringify(dados)
  for (const identificador of ['pessoa-ficticia-1', 'funcionarioId', 'criadoPorUid']) {
    assert.equal(
      saida.includes(identificador),
      false,
      `identificador de pessoa saiu da camada: ${identificador}`,
    )
  }
})

/* ------------------------------------------- mobilidade: ainda suprime */

test('bairro com pouca gente continua virando "outros"', async () => {
  const respostas = [
    ...Array.from({ length: 6 }, (_, i) =>
      resposta({
        funcionarioId: `pessoa-ficticia-${i + 1}`,
        bairro: 'Bairro Fictício A',
        co2KgMes: 10,
      }),
    ),
    resposta({
      funcionarioId: 'pessoa-ficticia-99',
      bairro: 'Bairro Fictício B',
      co2KgMes: 7,
    }),
  ]

  const dados = await comAmbiente({ MOBILIDADE_SUPRESSAO_MINIMA: LIMITE }, () =>
    consultarMobilidade(ctx(), { anoBase: ANO }, bancoCom({ mobilidade: respostas })),
  )

  assert.equal(
    dados.porBairro.some((g) => g.rotulo === 'Bairro Fictício B'),
    false,
    'bairro de uma pessoa apareceu nomeado: a supressão da mobilidade caiu',
  )
  const outros = dados.porBairro.find((g) => g.agrupadoPorSupressao)
  assert.notEqual(outros, undefined)
  assert.equal(outros?.co2Kg, 7)
  // O total continua batendo: suprimir esconde o rótulo, nunca o valor.
  assert.equal(
    dados.porBairro.reduce((s, g) => s + g.documentos, 0),
    respostas.length,
  )
})

/* ------------------------------------------ o agregado por região do mapa */

/**
 * O ponto do mapa abre um agregado, e ele tem duas contas que é fácil errar em
 * sentidos opostos: **pessoa não soma** entre corredores, e **trecho conta nas
 * duas regiões** que ele liga. Uma tela que trocasse as duas pareceria certa.
 */
test('a região fecha com os corredores que a tocam, e pessoa não soma', async () => {
  const dados = await comAmbiente({ MOBILIDADE_SUPRESSAO_MINIMA: LIMITE }, () =>
    consultarViagens(
      ctx(),
      {},
      bancoCom({ viagemTrecho: UMA_PESSOA_SO, aeroporto: CADASTRO }),
    ),
  )

  for (const regiao of dados.mapa.regioes) {
    const seus = dados.mapa.corredores.filter(
      (c) => c.origemRegiao === regiao.regiao || c.destinoRegiao === regiao.regiao,
    )
    assert.equal(
      seus.reduce((s, c) => s + c.trechos, 0),
      regiao.trechos,
      `os corredores de ${regiao.regiao} não somam os trechos da região`,
    )
    assert.equal(
      seus.reduce((s, c) => s + c.co2Kg, 0),
      regiao.co2Kg,
      `os corredores de ${regiao.regiao} não somam a emissão da região`,
    )
  }

  // O Sul é origem de tudo na massa: sete trechos, seis pessoas distintas —
  // somar os corredores dele daria mais, e é isso que a tela não pode fazer.
  const sul = dados.mapa.regioes.find((r) => r.regiao === 'Sul')
  assert.equal(sul?.trechos, 7)
  assert.equal(sul?.pessoas, 7)
  const corredoresDoSul = dados.mapa.corredores.filter(
    (c) => c.origemRegiao === 'Sul' || c.destinoRegiao === 'Sul',
  )
  assert.equal(
    corredoresDoSul.reduce((s, c) => s + c.pessoas, 0) >= (sul?.pessoas ?? 0),
    true,
  )
})

test('o corredor carrega o período, e nada nele diz quem', async () => {
  const dados = await comAmbiente({ MOBILIDADE_SUPRESSAO_MINIMA: LIMITE }, () =>
    consultarViagens(
      ctx(),
      {},
      bancoCom({ viagemTrecho: UMA_PESSOA_SO, aeroporto: CADASTRO }),
    ),
  )

  const domestico = dados.mapa.corredores.find((c) => c.corredor.includes('Sudeste'))
  assert.equal(domestico?.primeira, '2031-01-05')
  assert.equal(domestico?.ultima, '2031-06-05')

  const saida = JSON.stringify(dados.mapa)
  assert.equal(saida.includes('pessoa-ficticia-1'), false)
  assert.equal(saida.includes('funcionarioId'), false)
})

/**
 * **O mapa desenha aéreo, e o que fica de fora precisa ser dito** (§10.3).
 *
 * O trecho de carro guarda município em `origem` e `destino`, e a lista do IBGE
 * não está no inventário: não há coordenada de onde tirar a linha. Hoje nenhuma
 * das duas fontes administrativas traz carro, então o número é zero e a frase
 * não aparece — e é exatamente por isso que isto tem teste: o primeiro trecho
 * rodoviário que entrar faria o mapa somar menos que o total **sem nenhum erro
 * em lugar nenhum**, e mapa menor que o número é lido como falha de carga.
 */
test('trecho de carro não é desenhado, e o que ele pesa sai declarado', async () => {
  const comCarro = [
    ...UMA_PESSOA_SO,
    trecho({
      reservaId: 'r-carro',
      funcionarioId: 'pessoa-ficticia-9',
      tipo: 'carro',
      modal: 'terrestre',
      origem: 'Município fictício A',
      destino: 'Município fictício B',
      dataVoo: null,
      dataIda: '2031-03-20',
      co2Kg: 40,
      classeCabine: null,
      multiplicadorClasse: null,
      faixaDistancia: null,
      propriedadeVeiculo: 'proprio',
      combustivel: 'gasolina',
      ocupantes: 1,
    }),
  ]

  const dados = await comAmbiente({ MOBILIDADE_SUPRESSAO_MINIMA: LIMITE }, () =>
    consultarViagens(ctx(), {}, bancoCom({ viagemTrecho: comCarro, aeroporto: CADASTRO })),
  )

  assert.equal(
    dados.mapa.co2KgNaoAereo,
    40,
    'a emissão rodoviária precisa sair da camada como número, senão a tela não ' +
      'tem como declarar o recorte e o mapa cala sobre o que não desenhou',
  )
  assert.equal(
    dados.mapa.co2KgDesenhado,
    dados.mapa.co2KgAereo,
    'tudo que é aéreo continua desenhado: o que ficou de fora é de outro modal',
  )
  assert.equal(
    dados.mapa.co2KgAereo + dados.mapa.co2KgNaoAereo,
    dados.co2Kg,
    'desenhado mais não desenhado tem que fechar com o total do recorte — se não ' +
      'fechar, há emissão sem lugar e sem menção',
  )
  assert.equal(
    dados.mapa.corredores.some((c) => c.corredor.includes('Município')),
    false,
    'município não vira corredor: ele não tem coordenada no inventário',
  )
})

/* ------------------------------------- mobilidade: a faixa que o radar abre */

/**
 * **O recorte do radar é a faixa, nunca o ponto** (§3.1.1).
 *
 * Clicar num ponto mostraria modal e distância de uma pessoa, que é isolar um
 * indivíduo — com as distâncias quase todas distintas, o par identifica tão bem
 * quanto um nome. A faixa responde à mesma pergunta em agregado, e o modal
 * dentro dela passa pela mesma supressão do bairro.
 *
 * O teste não é vazio por construção: a faixa cheia **mostra o modal pelo
 * nome**, e é isso que prova que a supressão da faixa pequena é a regra agindo,
 * e não a lista vindo vazia.
 */
test('a faixa do radar agrega, e não separa o modal de quem está sozinho', async () => {
  const respostas = [
    ...Array.from({ length: 6 }, (_, i) =>
      resposta({
        funcionarioId: `pessoa-ficticia-${i + 1}`,
        transporte: 'carro',
        distanciaKm: 3,
        co2KgMes: 10,
      }),
    ),
    resposta({
      funcionarioId: 'pessoa-ficticia-99',
      transporte: 'moto',
      distanciaKm: 40,
      co2KgMes: 30,
    }),
  ]

  const dados = await comAmbiente({ MOBILIDADE_SUPRESSAO_MINIMA: LIMITE }, () =>
    consultarMobilidade(ctx(), { anoBase: ANO }, bancoCom({ mobilidade: respostas })),
  )

  const perto = dados.faixas.find((f) => f.pessoas === 6)
  const longe = dados.faixas.find((f) => f.pessoas === 1)
  assert.notEqual(perto, undefined, 'a faixa de quem mora perto sumiu')
  assert.notEqual(longe, undefined, 'a faixa de quem mora longe sumiu')

  // A faixa cheia mostra o modal pelo nome — sem isto, o resto passaria à toa.
  assert.ok(
    perto!.porModal.some((g) => g.rotulo === 'carro' && !g.agrupadoPorSupressao),
    'a faixa com gente suficiente deixou de nomear o modal',
  )

  // A faixa de uma pessoa não diz de que ela vai.
  assert.equal(
    longe!.porModal.some((g) => g.rotulo === 'moto'),
    false,
    'o modal de quem mora sozinho numa faixa apareceu pelo nome: isso é o ' +
      'ponto clicável que a §3.1.1 proíbe, por outra porta',
  )
  assert.ok(
    longe!.porModal.every((g) => g.agrupadoPorSupressao),
    'a faixa pequena precisa cair inteira no balde',
  )
})

/**
 * **Cada pessoa cai em exatamente uma faixa**, então as faixas somam o total —
 * ao contrário do agregado por região de viagens, em que somar passa do total.
 * Um vão entre dois anéis não quebraria nada: sumiria da contagem e o total
 * continuaria parecendo plausível.
 */
test('as faixas do radar somam o total da tela', async () => {
  const respostas = [
    ...Array.from({ length: 6 }, (_, i) =>
      resposta({
        funcionarioId: `pessoa-ficticia-${i + 1}`,
        transporte: 'carro',
        distanciaKm: 2 + i * 4,
        co2KgMes: 10 + i,
      }),
    ),
    resposta({
      funcionarioId: 'pessoa-ficticia-99',
      transporte: 'onibus',
      distanciaKm: 41.5,
      co2KgMes: 7,
    }),
    // **Quem mora a zero quilômetro da fábrica**, que é o piso do primeiro
    // anel. Sem massa aqui, o ramo que recolhe essa pessoa fica sem guarda: o
    // vão não aparece em nenhuma outra distância, porque todas as outras faixas
    // têm o piso aberto.
    resposta({
      funcionarioId: 'pessoa-ficticia-100',
      transporte: 'a_pe',
      distanciaKm: 0,
      co2KgMes: 0,
    }),
  ]

  const dados = await comAmbiente({ MOBILIDADE_SUPRESSAO_MINIMA: LIMITE }, () =>
    consultarMobilidade(ctx(), { anoBase: ANO }, bancoCom({ mobilidade: respostas })),
  )

  assert.equal(
    dados.faixas.reduce((s, f) => s + f.pessoas, 0),
    dados.respondentes,
    'alguém ficou fora de todas as faixas, ou foi contado em duas',
  )
  assert.ok(
    Math.abs(dados.faixas.reduce((s, f) => s + f.co2Kg, 0) - dados.co2KgMes) < 1e-9,
    'as faixas não reproduzem a emissão do módulo',
  )

  // Um ponto no radar para cada pessoa que as faixas contam.
  assert.equal(dados.radarDistanciasKm.length, dados.respondentes)

  // A primeira regra da §3.1 continua absoluta, e agora também no que a faixa
  // devolve: nenhum identificador, nenhum bairro, nenhuma cidade.
  const saida = JSON.stringify(dados.faixas)
  for (const vazamento of ['pessoa-ficticia', 'funcionarioId', 'Bairro', 'Cidade']) {
    assert.equal(
      saida.includes(vazamento),
      false,
      `a faixa do radar levou algo que não é dela: ${vazamento}`,
    )
  }
})

/**
 * As duas contas do programa de viagens que é fácil errar — §7.5 e §13.
 *
 * Nenhuma das duas estoura quando está errada, e é por isso que elas têm teste:
 *
 *  - **a divisão pelos ocupantes.** O documento guarda a emissão do veículo, que
 *    é o que distância e fator reproduzem; a divisão acontece ao atribuir a uma
 *    pessoa. Se ela deixar de acontecer, dois caronas que registrem a mesma
 *    viagem contam o mesmo carro duas vezes no total — e o total continua sendo
 *    um número plausível;
 *  - **o denominador da adesão.** Ele não sai de coleção nenhuma. O candidato
 *    óbvio, o tamanho da coleção de funcionários, inclui gente que só aparece
 *    como aprovador de passagem: com ele a adesão nasce menor do que é, e o
 *    indicador **parece funcionar**, que é a forma mais cara de estar errado.
 *
 * **Toda a massa é fictícia, inventada do zero** (§2.2).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Firestore } from 'firebase-admin/firestore'

import type { DocAeroporto, DocViagemRegistrada, Papel } from '../documentos/tipos'
import type { ContextoDeAcesso } from './acesso'
import {
  consultarMinhasViagens,
  consultarPrograma,
  periodoFechadoPara,
} from './programa'

const ANO = 2033

function ctx(papel: Papel = 'admin', uid = 'uid-ficticio-1'): ContextoDeAcesso {
  return {
    uid,
    email: 'pessoa.ficticia@exemplo.invalid',
    papel,
    empresa: null,
    funcionarioId: null,
  }
}

function registro(parcial: Partial<DocViagemRegistrada> = {}): DocViagemRegistrada {
  return {
    modal: 'terrestre',
    escopo: 3,
    ano: ANO,
    mes: `${ANO}-05`,
    fator: null,
    alertas: [],
    alertasCodigos: [],
    atualizadoEm: '2033-05-01',
    reservaId: 'registro-ficticio',
    ordem: 1,
    criadoPorUid: 'uid-ficticio-1',
    funcionarioId: null,
    tipo: 'carro',
    dataIda: '2033-05-10',
    dataVolta: null,
    origem: '1111111',
    destino: '2222222',
    distanciaKm: 100,
    co2Kg: 0,
    faixaDistancia: null,
    classeCabine: null,
    multiplicadorClasse: null,
    propriedadeVeiculo: 'proprio',
    combustivel: 'gasolina',
    ocupantes: 1,
    ...parcial,
  }
}

function aeroportoComCidade(
  iata: string,
  cidade: string,
  uf: string | null,
  regiao: string,
  latitude: number,
  longitude: number,
): DocAeroporto {
  return { ...aeroportoFicticio(iata, cidade, regiao, latitude, longitude), uf }
}

function aeroportoFicticio(
  iata: string,
  cidade: string,
  regiao: string,
  latitude: number,
  longitude: number,
): DocAeroporto {
  return {
    iata,
    nome: `Aeroporto fictício ${iata}`,
    cidade,
    uf: null,
    utcOffset: null,
    latitude,
    longitude,
    regiao,
    regiaoCriterio: 'uf',
  }
}

function bancoCom(dados: Record<string, unknown[]>): Firestore {
  const colecao = (nome: string) => {
    const consulta = {
      where: () => consulta,
      select: () => consulta,
      get: async () => ({
        size: (dados[nome] ?? []).length,
        docs: (dados[nome] ?? []).map((d, i) => ({
          id: `doc-ficticio-${i}`,
          data: () => d,
        })),
      }),
    }
    return consulta
  }
  return { collection: colecao } as unknown as Firestore
}

async function comAmbiente<T>(
  valores: Record<string, string | undefined>,
  tarefa: () => Promise<T>,
): Promise<T> {
  const anterior = { ...process.env }
  for (const [chave, valor] of Object.entries(valores)) {
    if (valor === undefined) delete process.env[chave]
    else process.env[chave] = valor
  }
  try {
    return await tarefa()
  } finally {
    process.env = anterior
  }
}

/* ------------------------------------------------------------ ocupantes */

test('a emissão do carro é do veículo, e se divide ao ser atribuída a alguém', async () => {
  const banco = bancoCom({
    viagemRegistrada: [registro({ co2Kg: 90, ocupantes: 3 })],
    funcionario: [],
  })

  const minhas = await comAmbiente({ PROGRAMA_FECHADO_ATE: undefined }, () =>
    consultarMinhasViagens(ctx('colaborador'), banco),
  )

  assert.equal(minhas.viagens.length, 1)
  assert.equal(
    minhas.viagens[0].co2KgVeiculo,
    90,
    'o documento guarda o que o veículo emitiu, que é o que distância e fator reproduzem',
  )
  assert.equal(
    minhas.viagens[0].co2Kg,
    30,
    'atribuída a quem registrou, a emissão é a parte dela: o veículo dividido pelos ocupantes',
  )
  assert.equal(minhas.co2Kg, 30, 'o total de quem registrou soma as partes, não os veículos')
})

test('dois caronas registrando a mesma viagem não contam o carro duas vezes', async () => {
  // O mesmo trajeto, o mesmo carro, dois ocupantes — cada um com o próprio
  // registro, como a §7.5 prevê: quem viajou preenche.
  const banco = bancoCom({
    viagemRegistrada: [
      registro({ criadoPorUid: 'uid-ficticio-1', reservaId: 'r-1', co2Kg: 80, ocupantes: 2 }),
      registro({ criadoPorUid: 'uid-ficticio-2', reservaId: 'r-2', co2Kg: 80, ocupantes: 2 }),
    ],
    funcionario: [],
  })

  const dados = await comAmbiente({ PROGRAMA_QUADRO: undefined }, () =>
    consultarPrograma(ctx(), {}, banco),
  )

  assert.equal(
    dados.co2Kg,
    80,
    'as duas metades somam um carro, e não dois: sem a divisão o programa ' +
      'inflaria a cada carona registrada',
  )
  assert.equal(dados.viagens, 2, 'ainda são duas submissões, de duas pessoas')
})

test('no aéreo não há divisão: cada trecho é um passageiro', async () => {
  const banco = bancoCom({
    viagemRegistrada: [
      registro({ tipo: 'aereo', modal: 'aereo', co2Kg: 55, ocupantes: null, propriedadeVeiculo: null, combustivel: null }),
    ],
    funcionario: [],
  })

  const minhas = await consultarMinhasViagens(ctx('colaborador'), banco)
  assert.equal(minhas.viagens[0].co2Kg, 55)
  assert.equal(minhas.viagens[0].co2KgVeiculo, 55)
})

/* ------------------------------------------------------- denominador */

test('sem o parâmetro do quadro, a adesão sai como contagem e não como proporção', async () => {
  const banco = bancoCom({
    viagemRegistrada: [
      registro({ criadoPorUid: 'uid-ficticio-1' }),
      registro({ criadoPorUid: 'uid-ficticio-2', reservaId: 'r-2' }),
    ],
    // A coleção de funcionários é grande e **não é o denominador**: ela inclui
    // quem só aparece como aprovador de passagem. Se voltasse a ser, a
    // proporção abaixo apareceria com um número.
    funcionario: Array.from({ length: 40 }, (_, i) => ({ nome: `Pessoa fictícia ${i}` })),
  })

  const dados = await comAmbiente({ PROGRAMA_QUADRO: undefined }, () =>
    consultarPrograma(ctx(), {}, banco),
  )

  assert.equal(dados.cobertura.registraram, 2)
  assert.equal(dados.cobertura.quadro, null)
  assert.equal(
    dados.cobertura.proporcao,
    null,
    'sem denominador declarado, a tela conta e diz que não há proporção — ' +
      'denominador errado é pior que indicador ausente, porque parece funcionar',
  )
})

test('com o parâmetro, a adesão é sobre o quadro declarado', async () => {
  const banco = bancoCom({
    viagemRegistrada: [registro({ criadoPorUid: 'uid-ficticio-1' })],
    funcionario: Array.from({ length: 40 }, (_, i) => ({ nome: `Pessoa fictícia ${i}` })),
  })

  const dados = await comAmbiente({ PROGRAMA_QUADRO: '4' }, () =>
    consultarPrograma(ctx(), {}, banco),
  )

  assert.equal(dados.cobertura.quadro, 4)
  assert.equal(dados.cobertura.proporcao, 0.25)
})

/* --------------------------------------------------- período fechado */

test('o fechamento congela o que tem ida até a data, e só isso', async () => {
  await comAmbiente({ PROGRAMA_FECHADO_ATE: '2033-06-30' }, async () => {
    assert.equal(periodoFechadoPara('2033-06-30').editavel, false, 'a própria data fecha')
    assert.equal(periodoFechadoPara('2033-06-29').editavel, false)
    assert.equal(periodoFechadoPara('2033-07-01').editavel, true, 'o dia seguinte continua aberto')
  })

  await comAmbiente({ PROGRAMA_FECHADO_ATE: undefined }, async () => {
    const situacao = periodoFechadoPara('2020-01-01')
    assert.equal(situacao.fechadoAte, null)
    assert.equal(
      situacao.editavel,
      true,
      'sem data no ambiente nada está fechado: é o estado inicial, não um esquecimento',
    )
  })
})

/* --------------------------------------------------------------- mapa */

/**
 * **Todo ponto é um lugar de verdade, e os dois modais entram no mesmo mapa.**
 *
 * É a diferença entre este mapa e o do inventário, e ela é o motivo de o teste
 * existir: lá o ponto é uma região, agregada por legibilidade; aqui é a cidade
 * do aeroporto e o município. Se alguém "uniformizar" os dois um dia, o ponto
 * de uma região inteira volta a cair ao lado do ponto de um município.
 */
test('o mapa desenha voo e carro, cada um pelo lugar de verdade', async () => {
  const banco = bancoCom({
    viagemRegistrada: [
      registro({
        tipo: 'aereo',
        modal: 'aereo',
        origem: 'AAA',
        destino: 'BBB',
        co2Kg: 100,
        ocupantes: null,
        propriedadeVeiculo: null,
        combustivel: null,
      }),
      // Curitiba e São José dos Pinhais: dois municípios reais da lista
      // embarcada, que é dado público do IBGE — não é massa vinda de base real.
      registro({ reservaId: 'r-carro', origem: '4106902', destino: '4125506', co2Kg: 60, ocupantes: 2 }),
    ],
    funcionario: [],
    aeroporto: [
      aeroportoFicticio('AAA', 'Cidade fictícia A', 'Sul', -25.5, -49.2),
      aeroportoFicticio('BBB', 'Cidade fictícia B', 'Sudeste', -23.4, -46.5),
    ],
  })

  const dados = await consultarPrograma(ctx(), {}, banco)

  assert.equal(dados.mapa.ligacoes.length, 2, 'uma ligação por modal')
  assert.equal(dados.mapa.semGeografia, 0)

  const aerea = dados.mapa.ligacoes.find((l) => l.chave.includes('AAA'))
  assert.equal(
    aerea?.origem.rotulo,
    'Cidade fictícia A',
    'o voo sai da cidade do aeroporto, não de uma região agregada',
  )
  assert.equal(aerea?.origem.domestico, true)

  // Procurada pelo rótulo, e não pelo código: a identidade do lugar é cidade e
  // UF, justamente para o aeroporto e o município da mesma cidade serem um ponto.
  const rodoviaria = dados.mapa.ligacoes.find((l) =>
    l.origem.rotulo.startsWith('Curitiba'),
  )
  assert.equal(
    rodoviaria?.origem.rotulo,
    'Curitiba/PR',
    'o carro sai do município, com a UF junto para o nome não ser ambíguo',
  )
  assert.equal(rodoviaria?.destino.rotulo, 'São José dos Pinhais/PR')
  assert.equal(
    rodoviaria?.co2Kg,
    30,
    'a espessura segue a emissão atribuída, já dividida pelos ocupantes (§7.5)',
  )

  assert.equal(
    dados.mapa.co2KgDesenhado,
    dados.co2Kg,
    'desenhado mais não desenhado fecha com o total da tela',
  )
})

test('ida e volta são a mesma linha, e quem volta ao ponto de partida vira anel', async () => {
  const banco = bancoCom({
    viagemRegistrada: [
      registro({ origem: '4106902', destino: '4125506', co2Kg: 40, ocupantes: 1 }),
      // A volta, registrada como trecho próprio: o sentido não desenha duas
      // linhas sobrepostas.
      registro({
        reservaId: 'r-volta',
        origem: '4125506',
        destino: '4106902',
        co2Kg: 40,
        ocupantes: 1,
      }),
    ],
    funcionario: [],
  })

  const dados = await consultarPrograma(ctx(), {}, banco)

  assert.equal(dados.mapa.ligacoes.length, 1, 'ida e volta são a mesma ligação')
  assert.equal(dados.mapa.ligacoes[0].co2Kg, 80, 'e ela soma as duas pontas')

  const mesmoLugar = await consultarPrograma(
    ctx(),
    {},
    bancoCom({
      viagemRegistrada: [
        registro({ origem: '4106902', destino: '4106902', co2Kg: 10, ocupantes: 1 }),
      ],
      funcionario: [],
    }),
  )
  const anel = mesmoLugar.mapa.ligacoes[0]
  assert.equal(
    anel.origem.chave,
    anel.destino.chave,
    'origem e destino iguais: o desenho faz disso um anel, porque ponto não tem direção',
  )
})

/**
 * **Lugar sem coordenada é declarado, não desaparecido.**
 *
 * Acontece de verdade: o IBGE cria o município no cadastro de localidades antes
 * de refazer a malha, então um lugar recém-criado pode ser escolhido no
 * formulário e ainda não ter ponto. Sem esta contagem, o mapa somaria menos que
 * o total da tela sem uma palavra — e mapa menor que o número é lido como falha
 * de carga.
 */
test('trecho sem coordenada do lugar sai declarado, e continua no total', async () => {
  const banco = bancoCom({
    viagemRegistrada: [
      registro({ origem: '4106902', destino: '4125506', co2Kg: 40, ocupantes: 1 }),
      registro({
        reservaId: 'r-sem-ponto',
        tipo: 'aereo',
        modal: 'aereo',
        origem: 'AAA',
        destino: 'ZZZ',
        co2Kg: 25,
        ocupantes: null,
        propriedadeVeiculo: null,
        combustivel: null,
      }),
    ],
    funcionario: [],
    // ZZZ não está no cadastro: é o caso de aeroporto sem coordenada.
    aeroporto: [aeroportoFicticio('AAA', 'Cidade fictícia A', 'Sul', -25.5, -49.2)],
  })

  const dados = await consultarPrograma(ctx(), {}, banco)

  assert.equal(dados.mapa.semGeografia, 1)
  assert.equal(dados.mapa.co2KgSemGeografia, 25)
  assert.equal(dados.mapa.co2KgDesenhado, 40)
  assert.equal(
    dados.mapa.co2KgDesenhado + dados.mapa.co2KgSemGeografia,
    dados.co2Kg,
    'o que não foi desenhado continua contando: some do mapa, não do total',
  )
})

/**
 * **O aeroporto de uma cidade e o município dessa cidade são o mesmo lugar.**
 *
 * Com o código como identidade, eles viravam dois pontos a poucos pixels um do
 * outro, com dois rótulos sobrepostos — medido no desenho, a menos de vinte
 * pixels — e o mapa passava a dizer que se foi a dois lugares quando se foi a
 * um. A identidade é cidade e UF, e este teste é o que impede a volta do código.
 */
test('voo e carro pela mesma cidade são um ponto só no mapa', async () => {
  const banco = bancoCom({
    viagemRegistrada: [
      registro({
        reservaId: 'r-aereo',
        tipo: 'aereo',
        modal: 'aereo',
        origem: 'AAA',
        destino: 'BBB',
        co2Kg: 100,
        ocupantes: null,
        propriedadeVeiculo: null,
        combustivel: null,
      }),
      // O mesmo lugar de onde o voo saiu, agora escolhido como município.
      registro({ reservaId: 'r-carro', origem: '4106902', destino: '4125506', co2Kg: 20 }),
    ],
    funcionario: [],
    aeroporto: [
      // O cadastro põe este aeroporto em Curitiba/PR — a mesma cidade do
      // município 4106902 da lista do IBGE.
      aeroportoComCidade('AAA', 'Curitiba', 'PR', 'Sul', -25.53, -49.17),
      aeroportoComCidade('BBB', 'Cidade fictícia B', 'SP', 'Sudeste', -23.4, -46.5),
    ],
  })

  const dados = await consultarPrograma(ctx(), {}, banco)

  const lugares = new Set(
    dados.mapa.ligacoes.flatMap((l) => [l.origem.chave, l.destino.chave]),
  )
  assert.equal(
    lugares.size,
    3,
    'três lugares: a cidade de onde se saiu pelos dois modais, e os dois destinos',
  )

  const rotulos = new Set(
    dados.mapa.ligacoes.flatMap((l) => [l.origem.rotulo, l.destino.rotulo]),
  )
  assert.equal(
    [...rotulos].filter((r) => r.startsWith('Curitiba')).length,
    1,
    'um rótulo só para Curitiba: dois deles cairiam sobrepostos no desenho',
  )
})

test('aeroporto sem UF não se funde com ninguém', async () => {
  const banco = bancoCom({
    viagemRegistrada: [
      registro({
        tipo: 'aereo',
        modal: 'aereo',
        origem: 'AAA',
        destino: 'ZZZ',
        co2Kg: 100,
        ocupantes: null,
        propriedadeVeiculo: null,
        combustivel: null,
      }),
    ],
    funcionario: [],
    aeroporto: [
      aeroportoComCidade('AAA', 'Curitiba', 'PR', 'Sul', -25.53, -49.17),
      // Estrangeiro: sem UF, a identidade cai no próprio código. O pior caso é
      // o comportamento anterior — dois pontos separados —, nunca juntar
      // lugares distintos.
      aeroportoComCidade('ZZZ', 'Cidade fictícia estrangeira', null, 'Europa', 50, 8.6),
    ],
  })

  const dados = await consultarPrograma(ctx(), {}, banco)
  const ligacao = dados.mapa.ligacoes[0]
  const estrangeiro = [ligacao.origem, ligacao.destino].find((p) => !p.domestico)
  assert.equal(estrangeiro?.chave, 'ZZZ')
  assert.equal(estrangeiro?.rotulo, 'Cidade fictícia estrangeira')
})

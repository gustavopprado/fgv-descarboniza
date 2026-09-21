/**
 * Testes da validação de escrita, dos IDs determinísticos e das guardas de
 * recarga.
 *
 * Desde que o banco relacional saiu, estas regras são a única coisa que impede
 * dado inválido de entrar no inventário (§9.9). Por isso elas têm teste.
 *
 * **Toda a massa aqui é fictícia, inventada do zero** (§2.2): nenhum nome,
 * código, data ou valor sai de base real.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { recarregarEscopo } from '../escrita'
import {
  idEntregaRodoviaria,
  idFatorEmissao,
  idFuncionario,
  idMobilidade,
  idViagemRegistrada,
  idViagemTrecho,
  sanitizarSegmento,
} from './ids'
import { montarAlertas } from './tipos'
import type {
  DocEmbarque,
  DocEntregaRodoviaria,
  DocFatorEmissao,
  DocMobilidade,
  DocPorto,
  DocViagemRegistrada,
  DocViagemTrecho,
} from './tipos'
import {
  DocumentoInvalidoError,
  ehDataIso,
  validarEmbarque,
  validarEntregaRodoviaria,
  validarFatorEmissao,
  validarMobilidade,
  validarPorto,
  validarViagemRegistrada,
  validarViagemTrecho,
} from './validacao'

/** Recusa esperada da validação, e não um erro qualquer vindo do teste. */
function recusa(acao: () => unknown): void {
  assert.throws(acao, DocumentoInvalidoError)
}

/* ------------------------------------------------------------------- IDs */

test('ID de documento é determinístico e seguro para o Firestore', () => {
  assert.equal(idFuncionario({ matricula: 'X99' }), 'mat_X99')
  assert.equal(idFuncionario({ chaveOrigem: 'pessoa-ficticia' }), 'org_pessoa-ficticia')
  assert.throws(() => idFuncionario({}), Error)

  assert.equal(idMobilidade(2031, '0042'), '2031_0042')
  assert.equal(idViagemTrecho('agencia', 'ZZ001', 2), 'agencia_ZZ001_2')
  assert.equal(
    idFatorEmissao('exemplo_faixa', 'curta', 'FICT-2031', '2031-01-01'),
    'exemplo_faixa__curta__FICT-2031__2031-01-01',
  )

  // A barra é proibida no ID e vira hífen; o separador de campos é "_", que a
  // limpeza nunca produz — então duas origens diferentes não colapsam no mesmo
  // documento.
  assert.equal(sanitizarSegmento('a/b'), 'a-b')
  assert.equal(sanitizarSegmento('a b'), 'a-b')
  assert.notEqual(sanitizarSegmento('a/b'), sanitizarSegmento('a_b'))

  assert.throws(() => sanitizarSegmento('   '), Error)
  assert.throws(() => sanitizarSegmento('__interno'), Error)
})

/* ----------------------------------------------------------------- datas */

test('data é AAAA-MM-DD e o calendário é conferido', () => {
  assert.ok(ehDataIso('2031-02-28'))
  assert.ok(!ehDataIso('2031-02-31'))
  assert.ok(!ehDataIso('2031-13-01'))
  assert.ok(!ehDataIso('01/01/2031'))
  assert.ok(!ehDataIso(''))
})

/* ------------------------------------------------------------ mobilidade */

function mobilidade(): DocMobilidade {
  return {
    modulo: 'mobilidade',
    modal: 'terrestre',
    escopo: 3,
    periodicidade: 'mensal',
    ano: 2031,
    mes: null,
    empresa: null,
    fator: {
      categoria: 'mobilidade_carro',
      chave: 'gasolina',
      versao: 'FICT-2031',
      valor: 0.2,
      unidade: 'kg CO2e por km',
      vigenciaInicio: '2031-01-01',
    },
    ...montarAlertas([]),
    atualizadoEm: '2031-06-01',
    funcionarioId: 'mat_0042',
    anoBase: 2031,
    transporte: 'carro',
    combustivel: 'gasolina',
    distanciaKm: 10,
    bairro: 'Bairro Fictício',
    cidade: 'Cidade Fictícia',
    diasUteisMes: 20,
    co2KgMes: 80,
    excecao: false,
    motivoExcecao: null,
  }
}

test('mobilidade válida passa, inclusive com emissão zero por definição', () => {
  validarMobilidade('2031_0042', mobilidade())

  // Bicicleta, a pé e "outro" não têm fator: têm regra (§6.2).
  validarMobilidade('x', {
    ...mobilidade(),
    transporte: 'bicicleta',
    combustivel: null,
    fator: null,
    co2KgMes: 0,
  })
})

test('mobilidade recusa o que o banco recusava', () => {
  // O tipo já proíbe `mes` na mobilidade; o cast existe para provar que a
  // validação também recusa, caso o documento venha de fora do TypeScript.
  recusa(() =>
    validarMobilidade('x', {
      ...mobilidade(),
      mes: '2031-06',
    } as unknown as DocMobilidade),
  )
  recusa(() =>
    validarMobilidade('x', { ...mobilidade(), escopo: 2 } as unknown as DocMobilidade),
  )
  recusa(() => validarMobilidade('x', { ...mobilidade(), anoBase: 2030 }))
  recusa(() => validarMobilidade('x', { ...mobilidade(), distanciaKm: -1 }))
  recusa(() => validarMobilidade('x', { ...mobilidade(), diasUteisMes: 0 }))
})

test('mobilidade exige motivo quando é exceção, e só quando é', () => {
  recusa(() => validarMobilidade('x', { ...mobilidade(), excecao: true }))
  recusa(() => validarMobilidade('x', { ...mobilidade(), motivoExcecao: 'qualquer' }))
  validarMobilidade('x', {
    ...mobilidade(),
    excecao: true,
    motivoExcecao: 'motivo fictício',
  })
})

test('campo ausente precisa ser null explícito, nunca undefined', () => {
  recusa(() =>
    validarMobilidade('x', {
      ...mobilidade(),
      bairro: undefined,
    } as unknown as DocMobilidade),
  )
})

test('fator nulo só se sustenta com emissão zero', () => {
  recusa(() => validarMobilidade('x', { ...mobilidade(), fator: null }))
  recusa(() =>
    validarMobilidade('x', {
      ...mobilidade(),
      fator: { ...mobilidade().fator!, versao: '' },
    }),
  )
})

test('alertasCodigos precisa refletir alertas', () => {
  recusa(() =>
    validarMobilidade('x', {
      ...mobilidade(),
      alertas: [{ tipo: 'exemplo_ficticio', descricao: 'texto', severidade: 'atencao' }],
      alertasCodigos: [],
    }),
  )
  validarMobilidade('x', {
    ...mobilidade(),
    ...montarAlertas([
      { tipo: 'exemplo_ficticio', descricao: 'texto', severidade: 'atencao' },
      { tipo: 'exemplo_ficticio', descricao: 'outro texto', severidade: 'informativo' },
    ]),
  })
})

/* --------------------------------------------------------------- viagens */

function trecho(): DocViagemTrecho {
  return {
    modulo: 'viagens',
    modal: 'aereo',
    escopo: 3,
    periodicidade: 'evento',
    ano: 2031,
    mes: '2031-03',
    empresa: null,
    fator: {
      categoria: 'viagem_aerea_faixa',
      chave: 'curta',
      versao: 'FICT-2031',
      valor: 0.2,
      unidade: 'kg CO2e por passageiro-km',
      vigenciaInicio: '2031-01-01',
    },
    ...montarAlertas([]),
    atualizadoEm: '2031-06-01',
    reservaId: 'ZZ001',
    ordem: 1,
    funcionarioId: 'org_pessoa-ficticia',
    tipo: 'aereo',
    fonte: 'agencia',
    contabilizar: true,
    dataIda: '2031-03-10',
    dataVolta: '2031-03-12',
    origem: 'AAA',
    destino: 'BBB',
    companhia: 'ZZ',
    voo: 'ZZ0001',
    dataVoo: '2031-03-10',
    distanciaKm: 100,
    faixaDistancia: 'curta',
    passageiros: 1,
    co2Kg: 20,
    classeCabine: 'economica',
    multiplicadorClasse: 1,
    propriedadeVeiculo: null,
    combustivel: null,
    ocupantes: null,
  }
}

function trechoDeCarro(): DocViagemTrecho {
  return {
    ...trecho(),
    tipo: 'carro',
    modal: 'terrestre',
    dataVoo: null,
    faixaDistancia: null,
    companhia: null,
    voo: null,
    classeCabine: null,
    multiplicadorClasse: null,
    propriedadeVeiculo: 'proprio',
    combustivel: 'flex',
    ocupantes: 2,
  }
}

test('trecho aéreo e trecho de carro válidos passam', () => {
  validarViagemTrecho('agencia_ZZ001_1', trecho())
  validarViagemTrecho('cartao_ZZ002_1', trechoDeCarro())
  validarViagemTrecho('cartao_ZZ003_1', {
    ...trechoDeCarro(),
    propriedadeVeiculo: 'frota',
    escopo: 1,
  })
})

test('ano e mês têm que bater com a data de referência do documento', () => {
  recusa(() => validarViagemTrecho('x', { ...trecho(), mes: '2031-04' }))
  recusa(() => validarViagemTrecho('x', { ...trecho(), ano: 2030, mes: '2030-03' }))
})

test('aéreo sem data do voo é recusado — é ela que define o mês', () => {
  recusa(() => validarViagemTrecho('x', { ...trecho(), dataVoo: null }))
})

/* ------------------------------- a §0.1 como invariante de escrita ------- */

/**
 * **O inventário recusa o formulário, e isso é a §0.1 em código.**
 *
 * Enquanto a separação fosse só um filtro nas consultas, bastava uma consulta
 * esquecer o `where` para somar autodeclaração voluntária a fonte administrativa
 * completa — e o resultado seria uma série cuja variação mede quanta gente
 * preencheu, não quanta emissão houve. Erro assim não estoura em lugar nenhum,
 * então precisa estourar na escrita.
 */
test('trecho de inventário com fonte do formulário é recusado', () => {
  recusa(() =>
    validarViagemTrecho('x', {
      ...trecho(),
      fonte: 'formulario' as unknown as DocViagemTrecho['fonte'],
    }),
  )
})

test('as duas fontes administrativas do inventário passam', () => {
  validarViagemTrecho('x', { ...trecho(), fonte: 'agencia' })
  validarViagemTrecho('x', { ...trecho(), fonte: 'cartao' })
})

/* ------------------------------------------ programa de viagens ---------- */

function registrada(): DocViagemRegistrada {
  return {
    modal: 'aereo',
    escopo: 3,
    ano: 2031,
    mes: '2031-05',
    fator: {
      categoria: 'viagem_aerea_faixa',
      chave: 'curta',
      versao: 'FICT-2031',
      valor: 0.2,
      unidade: 'kg CO2e por passageiro-km',
      vigenciaInicio: '2031-01-01',
    },
    ...montarAlertas([]),
    atualizadoEm: '2031-06-01',
    reservaId: 'reg-0001',
    ordem: 1,
    criadoPorUid: 'uid-ficticio',
    funcionarioId: 'org_pessoa-ficticia',
    tipo: 'aereo',
    dataIda: '2031-05-04',
    dataVolta: '2031-05-08',
    origem: 'AAA',
    destino: 'BBB',
    distanciaKm: 100,
    co2Kg: 20,
    faixaDistancia: 'curta',
    classeCabine: 'economica',
    multiplicadorClasse: 1,
    propriedadeVeiculo: null,
    combustivel: null,
    ocupantes: null,
  }
}

test('viagem registrada válida passa', () => {
  validarViagemRegistrada(idViagemRegistrada('uid-ficticio', 'reg-0001', 1), registrada())
})

/**
 * Sem dono, a submissão fica invisível para quem a escreveu e visível para
 * ninguém: `criadoPorUid` é o controle de acesso do `colaborador` (§5.1), e no
 * inventário esse campo nem existe.
 */
test('viagem registrada sem quem registrou é recusada', () => {
  recusa(() => validarViagemRegistrada('x', { ...registrada(), criadoPorUid: '' }))
})

/**
 * Esta é a única coleção preenchida à mão por gente usando a aplicação, e é
 * onde erro de digitação chega. As outras vêm de carga conferida.
 */
test('volta anterior à ida é recusada', () => {
  recusa(() => validarViagemRegistrada('x', { ...registrada(), dataVolta: '2031-05-01' }))
  validarViagemRegistrada('x', { ...registrada(), dataVolta: null })
})

test('as regras da §9.9 valem no programa como valem no inventário', () => {
  // ano e mês contra a data de referência
  recusa(() => validarViagemRegistrada('x', { ...registrada(), mes: '2031-06' }))
  // escopo coerente com a propriedade do veículo
  recusa(() =>
    validarViagemRegistrada('x', {
      ...registrada(),
      tipo: 'carro',
      modal: 'terrestre',
      faixaDistancia: null,
      classeCabine: null,
      multiplicadorClasse: null,
      propriedadeVeiculo: 'frota',
      escopo: 3,
    }),
  )
  // ocupantes inteiro ≥ 1
  recusa(() => validarViagemRegistrada('x', { ...registrada(), ocupantes: 0 }))
  // fator nulo só com emissão zero
  recusa(() => validarViagemRegistrada('x', { ...registrada(), fator: null }))
})

/**
 * O ID do inventário sai do arquivo de origem; aqui não há arquivo, e a origem
 * é quem registrou. Duas pessoas com a mesma sequência de reserva não podem
 * colidir num documento só.
 */
test('o ID da viagem registrada separa pessoas', () => {
  assert.notEqual(
    idViagemRegistrada('uid-a', 'reg-0001', 1),
    idViagemRegistrada('uid-b', 'reg-0001', 1),
  )
  assert.equal(
    idViagemRegistrada('uid-a', 'reg-0001', 1),
    idViagemRegistrada('uid-a', 'reg-0001', 1),
  )
})

test('modal precisa corresponder ao tipo da viagem', () => {
  recusa(() => validarViagemTrecho('x', { ...trecho(), tipo: 'carro' }))
})

test('frota é Escopo 1; próprio e locado são Escopo 3', () => {
  recusa(() =>
    validarViagemTrecho('x', { ...trechoDeCarro(), propriedadeVeiculo: 'frota', escopo: 3 }),
  )
  recusa(() =>
    validarViagemTrecho('x', { ...trechoDeCarro(), propriedadeVeiculo: 'proprio', escopo: 1 }),
  )
  recusa(() =>
    validarViagemTrecho('x', { ...trechoDeCarro(), propriedadeVeiculo: 'locado', escopo: 1 }),
  )
})

test('aéreo com emissão precisa carimbar o multiplicador de classe', () => {
  // `fator` guarda o fator por faixa; sem o multiplicador, a conta do trecho
  // não é reproduzível a partir do documento (§9.6).
  recusa(() => validarViagemTrecho('x', { ...trecho(), multiplicadorClasse: null }))
  recusa(() => validarViagemTrecho('x', { ...trecho(), classeCabine: null }))
  recusa(() => validarViagemTrecho('x', { ...trecho(), multiplicadorClasse: 0 }))
})

test('ocupantes e passageiros são inteiros positivos', () => {
  recusa(() => validarViagemTrecho('x', { ...trechoDeCarro(), ocupantes: 0 }))
  recusa(() => validarViagemTrecho('x', { ...trechoDeCarro(), ocupantes: 1.5 }))
  recusa(() => validarViagemTrecho('x', { ...trecho(), passageiros: 0 }))
})

/* -------------------------------------------------------------- marítimo */

function embarque(): DocEmbarque {
  return {
    modulo: 'maritimo',
    modal: 'maritimo',
    escopo: 3,
    periodicidade: 'evento',
    ano: 2031,
    mes: '2031-05',
    empresa: 'Empresa Fictícia',
    fator: null,
    ...montarAlertas([]),
    atualizadoEm: '2031-06-01',
    agente: 'Agente Fictício',
    bloco: 'FICT_2031',
    shipmentId: 'SHP-FICT-0001',
    houseRef: null,
    trans: null,
    mode: null,
    portoOrigem: 'XXAAA',
    portoDestino: 'XXBBB',
    portoOrigemNome: 'Porto Fictício A',
    portoDestinoNome: 'Porto Fictício B',
    navioPartida: null,
    navioTransbordo: null,
    etd: '2031-05-04',
    eta: '2031-06-20',
    atd: null,
    ata: null,
    ataFinal: null,
    pesoKg: 1000,
    volumeM3: 10,
    containers: 1,
    containersFonte: 'coluna',
    co2Kg: 2000,
    nivelDado: 'medido',
    baseDaEstimativa: null,
    status: null,
    previsao: false,
  }
}

test('embarque válido passa, inclusive com carga aérea de fornecedor', () => {
  validarEmbarque('agente_SHP-FICT-0001', embarque())
  // Frete aéreo upstream: modal aéreo dentro do módulo marítimo (§8.3).
  validarEmbarque('x', { ...embarque(), modal: 'aereo' })
})

test('embarque recusa identificador vazio e número negativo', () => {
  recusa(() => validarEmbarque('x', { ...embarque(), shipmentId: '' }))
  recusa(() => validarEmbarque('x', { ...embarque(), agente: '' }))
  recusa(() => validarEmbarque('x', { ...embarque(), bloco: '' }))
  recusa(() => validarEmbarque('x', { ...embarque(), containers: -1 }))
  recusa(() => validarEmbarque('x', { ...embarque(), etd: '2031-05-32' }))
  recusa(() =>
    validarEmbarque('x', { ...embarque(), modal: 'terrestre' } as unknown as DocEmbarque),
  )
})

test('embarque medido tem emissão sem fator, e é o único que pode', () => {
  // O número é do agente, não de fator × atividade (§8.1). Nas outras coleções
  // fator nulo com emissão não-zero é recusado, e continua sendo.
  validarEmbarque('x', embarque())
  recusa(() => validarEmbarque('x', { ...embarque(), fator: fatorDaMedia() }))
  recusa(() => validarEmbarque('x', { ...embarque(), baseDaEstimativa: 3 }))
})

test('embarque estimado precisa carimbar a média e o tamanho da amostra', () => {
  // Sem os dois, a estimativa não é reproduzível a partir do documento: a mesma
  // média recalculada sobre base maior daria outro número (§8.2, §9.1).
  const estimado = {
    ...embarque(),
    nivelDado: 'estimado_corredor' as const,
    fator: fatorDaMedia(),
    baseDaEstimativa: 4,
  }
  validarEmbarque('x', estimado)
  recusa(() => validarEmbarque('x', { ...estimado, fator: null }))
  recusa(() => validarEmbarque('x', { ...estimado, baseDaEstimativa: null }))
  recusa(() => validarEmbarque('x', { ...estimado, baseDaEstimativa: 0 }))
})

test('contagem de contêineres não entra sem dizer de onde veio', () => {
  recusa(() => validarEmbarque('x', { ...embarque(), containersFonte: null }))
  // Sem contagem nenhuma, não há procedência a declarar.
  validarEmbarque('x', { ...embarque(), containers: null, containersFonte: null })
})

test('ano e mês do embarque batem com a data de partida prevista', () => {
  // Campo de filtro desnormalizado que não bate com o dado faz o corte por
  // período mentir sem nenhum sinal (§9.9).
  recusa(() => validarEmbarque('x', { ...embarque(), mes: '2031-04' }))
  recusa(() => validarEmbarque('x', { ...embarque(), ano: 2030, mes: '2030-05' }))
})

function fatorDaMedia(): DocEmbarque['fator'] {
  return {
    categoria: 'maritimo_media_corredor',
    chave: 'XXAAA-XXBBB',
    versao: 'FICT_2031',
    valor: 1500,
    unidade: 'kg CO2e/contêiner',
    vigenciaInicio: '2031-06-01',
  }
}

/* ------------------------------------------------------------------ portos */

/* ------------------------------------------------------- transportadoras */

function fatorDoFrete(): DocEntregaRodoviaria['fator'] {
  return {
    categoria: 'frete_rodoviario_tkm',
    chave: 'geral',
    versao: 'FICT-2031',
    valor: 0.5,
    unidade: 'kg CO2e/t.km',
    vigenciaInicio: '2031-01-01',
  }
}

function entrega(): DocEntregaRodoviaria {
  return {
    modulo: 'transportadoras',
    modal: 'rodoviario',
    escopo: 3,
    periodicidade: 'evento',
    ano: 2031,
    mes: '2031-05',
    empresa: null,
    fator: fatorDoFrete(),
    ...montarAlertas([]),
    atualizadoEm: '2031-06-01',
    filial: '02',
    data: '2031-05-04',
    ordem: 1,
    clienteCodigo: '99999 01',
    distanciaKm: 120.5,
    pesoKg: 800,
    co2Kg: 48.2,
    regimeFrete: 'indefinido',
    nivelDado: 'calculado_tkm',
  }
}

test('entrega rodoviária válida passa, e o ID sai de filial, data e ordem', () => {
  validarEntregaRodoviaria('02_2031-05-04_1', entrega())
  assert.equal(idEntregaRodoviaria('02', '2031-05-04', 1), '02_2031-05-04_1')
})

/**
 * Filial nova não é linha a aceitar: é a §9.4 desatualizada, e um quarto código
 * gravado apareceria no agregado como uma filial que a tela não sabe desenhar.
 */
test('filial fora das três conhecidas é recusada', () => {
  recusa(() => validarEntregaRodoviaria('x', { ...entrega(), filial: '04' as '01' }))
  recusa(() => validarEntregaRodoviaria('x', { ...entrega(), filial: '' as '01' }))
})

/**
 * É `regimeFrete` que a tela lê para declarar o escopo como provisório (§9.1).
 * Texto livre aqui apagaria a ressalva sem apagar o número.
 */
test('regime de frete só admite cif, fob e indefinido', () => {
  validarEntregaRodoviaria('x', { ...entrega(), regimeFrete: 'cif' })
  validarEntregaRodoviaria('x', { ...entrega(), regimeFrete: 'fob' })
  recusa(() =>
    validarEntregaRodoviaria('x', { ...entrega(), regimeFrete: 'talvez' as 'cif' }),
  )
})

/**
 * No envelope, fator nulo se sustenta onde a emissão é zero por definição. Aqui
 * não existe entrega que não emita por definição: o zero vem de peso zero, e a
 * conta continua sendo fator × atividade — sem o carimbo, a linha não se
 * reproduz a partir do documento (§9.2).
 */
test('entrega sem fator carimbado é recusada, mesmo com emissão zero', () => {
  recusa(() => validarEntregaRodoviaria('x', { ...entrega(), fator: null }))
  recusa(() =>
    validarEntregaRodoviaria('x', { ...entrega(), fator: null, co2Kg: 0, pesoKg: 0 }),
  )
  validarEntregaRodoviaria('x', { ...entrega(), co2Kg: 0, pesoKg: 0 })
})

test('frete de terceiro é Escopo 3, e o modal é rodoviário', () => {
  recusa(() => validarEntregaRodoviaria('x', { ...entrega(), escopo: 1 }))
  recusa(() =>
    validarEntregaRodoviaria('x', { ...entrega(), modal: 'terrestre' as 'rodoviario' }),
  )
  recusa(() =>
    validarEntregaRodoviaria('x', {
      ...entrega(),
      periodicidade: 'mensal' as 'evento',
    }),
  )
})

test('ano e mês da entrega batem com a data dela', () => {
  recusa(() => validarEntregaRodoviaria('x', { ...entrega(), mes: '2031-06' }))
  recusa(() => validarEntregaRodoviaria('x', { ...entrega(), ano: 2030 }))
  recusa(() => validarEntregaRodoviaria('x', { ...entrega(), data: '2031-05-32' }))
})

test('entrega recusa medida negativa e ordem fora de sequência', () => {
  recusa(() => validarEntregaRodoviaria('x', { ...entrega(), distanciaKm: -1 }))
  recusa(() => validarEntregaRodoviaria('x', { ...entrega(), pesoKg: -1 }))
  recusa(() => validarEntregaRodoviaria('x', { ...entrega(), ordem: 0 }))
  recusa(() => validarEntregaRodoviaria('x', { ...entrega(), ordem: 1.5 }))
  // Código de cliente ausente é nulo explícito, e passa: o agregado é por filial.
  validarEntregaRodoviaria('x', { ...entrega(), clienteCodigo: null })
})

function porto(): DocPorto {
  return {
    locode: 'XXAAA',
    nome: 'Porto Fictício A',
    pais: 'XX',
    subdivisao: null,
    latitude: -25.5,
    longitude: -48.5,
    funcao: '1-------',
    ehPorto: true,
    fonte: 'lista fictícia 2031-1',
  }
}

test('porto exige código, nome e procedência', () => {
  validarPorto('XXAAA', porto())
  recusa(() => validarPorto('x', { ...porto(), locode: 'XX' }))
  recusa(() => validarPorto('x', { ...porto(), nome: '' }))
  recusa(() => validarPorto('x', { ...porto(), fonte: '' }))
})

test('porto aceita coordenada ausente, mas não pela metade', () => {
  // Parte dos registros da lista oficial não traz coordenada, e o porto entra
  // assim mesmo. O que não pode é um lado nulo e o outro preenchido: isso
  // desenharia o ponto sobre o equador ou sobre o meridiano — plausível e errado.
  validarPorto('x', { ...porto(), latitude: null, longitude: null })
  recusa(() => validarPorto('x', { ...porto(), latitude: null }))
  recusa(() => validarPorto('x', { ...porto(), longitude: null }))
  recusa(() => validarPorto('x', { ...porto(), latitude: 91 }))
  recusa(() => validarPorto('x', { ...porto(), longitude: -181 }))
})

/* --------------------------------------------------------------- fatores */

function fator(): DocFatorEmissao {
  return {
    categoria: 'exemplo_categoria',
    chave: 'curta',
    valor: 0.2,
    unidade: 'kg CO2e por km',
    fonte: 'fonte fictícia',
    versao: 'FICT-2031',
    vigenciaInicio: '2031-01-01',
    vigenciaFim: null,
  }
}

test('fator exige versão, unidade e vigência coerente', () => {
  validarFatorEmissao('x', fator())
  validarFatorEmissao('x', { ...fator(), vigenciaFim: '2031-12-31' })
  recusa(() => validarFatorEmissao('x', { ...fator(), vigenciaFim: '2030-12-31' }))
  recusa(() => validarFatorEmissao('x', { ...fator(), versao: '' }))
  recusa(() => validarFatorEmissao('x', { ...fator(), unidade: '' }))
  recusa(() => validarFatorEmissao('x', { ...fator(), valor: -1 }))
})

/* ---------------------------------------------------- guardas da recarga */

test('recarga vazia é recusada antes de encostar no banco', async () => {
  // Uma carga sem documento nenhum é quase sempre erro de leitura do arquivo, e
  // apagaria o escopo inteiro sem nada no lugar.
  await assert.rejects(
    () => recarregarEscopo({ colecao: 'mobilidade', escopo: [], documentos: [] }),
    /não produziu nenhum documento/,
  )
})

test('ID repetido na mesma carga é recusado', async () => {
  await assert.rejects(
    () =>
      recarregarEscopo({
        colecao: 'mobilidade',
        escopo: [],
        documentos: [
          { id: 'a', dados: { x: 1 } },
          { id: 'a', dados: { x: 2 } },
        ],
      }),
    /ID repetido/,
  )
})

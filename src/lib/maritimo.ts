/**
 * Leitura do relatório do agente de carga — CLAUDE.md §8.
 *
 * O arquivo é export de sistema de gestão de embarques, com uma aba de detalhe
 * por agente e período, uma aba de resumo montada à mão e várias abas de
 * template do próprio sistema de origem. As armadilhas da §8.3 vivem todas
 * aqui, e cada uma tem um comentário no ponto onde é tratada.
 *
 * O módulo é **puro**: recebe abas já lidas em forma de matriz e devolve
 * embarques. Quem abre arquivo, quem fala com o banco e quem estima o que o
 * agente não informou é o script de carga.
 *
 * **Nada aqui conhece nome de agente, de porto, de navio ou de empresa.** Toda
 * decisão é por forma — presença de coluna, presença de identificador, formato
 * do texto —, nunca por lista de nomes: lista de nome real não entra em
 * repositório público (§2.2), e lista de nome nesta camada é também o jeito mais
 * rápido de fazer um agente novo nascer invisível.
 */

import {
  chave,
  dataOuNulo,
  numeroOuNulo,
  texto,
  textoOuNulo,
  type AbaLida,
  type CelulaBruta,
} from './planilha'

/**
 * Os primitivos de planilha moram em `planilha.ts` desde que o segundo leitor
 * apareceu — as lições de data inválida e de fuso são de qualquer base em
 * Excel, e duas cópias delas seriam uma que envelhece sem a outra.
 *
 * Os tipos continuam saindo daqui porque é isto que o script de carga importa.
 */
export type { AbaLida, CelulaBruta }

export type AlertaDeLeitura = { tipo: string; descricao: string }

/** De onde saiu a contagem de contêineres deste embarque. */
export type FonteDaContagem = 'coluna' | 'tipo'

export type EmbarqueLido = {
  /** Aba de origem. É o escopo de recarga (§8.4). */
  bloco: string
  /** Agente de carga, derivado do nome da aba. */
  agente: string
  /** Linha na planilha, para mensagem de conferência. Não vai ao banco. */
  linha: number

  shipmentId: string
  empresa: string | null
  trans: string | null
  mode: string | null
  origemNome: string | null
  destinoNome: string | null
  locodeOrigem: string | null
  locodeDestino: string | null
  houseRef: string | null

  pesoKg: number | null
  volumeM3: number | null
  containers: number | null
  containersFonte: FonteDaContagem | null
  containerTipo: string | null

  co2Kg: number | null

  etd: string | null
  eta: string | null
  atd: string | null
  ata: string | null
  /** Chegada efetiva ao último desembarque. É a única prova de fato do aéreo. */
  ataFinal: string | null
  navioPartida: string | null
  navioTransbordo: string | null

  /** O texto da coluna de status, quando ela traz texto. Ver `previsao`. */
  statusBruto: string | null
  /**
   * Embarque que ainda não aconteceu: o CO₂ lançado é previsão, não realizado.
   *
   * **Só o grau conclusivo entra aqui** — ver `grauDeRealizacao`. Embarque com
   * itinerário e sem data efetiva **não** é previsão: recebe alerta próprio e
   * continua no total.
   */
  previsao: boolean
  /** Ver `grauDeRealizacao`. Vai ao alerta, não ao documento. */
  realizacao: GrauDeRealizacao

  alertas: AlertaDeLeitura[]
}

export type LinhaDescartada = {
  linha: number
  motivo: string
}

export type BlocoLido = {
  bloco: string
  agente: string
  /** Linha da planilha onde o cabeçalho foi encontrado, para o relatório. */
  linhaDoCabecalho: number
  /** Colunas nomeadas que a aba tem, para o relatório de diferença entre abas. */
  colunas: string[]
  embarques: EmbarqueLido[]
  /** Linhas dentro da faixa de dados que não viraram embarque, com o motivo. */
  descartadas: LinhaDescartada[]
  /**
   * Quantas linhas tinham coluna de status sem valor.
   *
   * A coluna é **fórmula**, e fórmula que depende da data de hoje: ela
   * reclassifica sozinha a cada execução. Exportada sem cache, chega vazia. Este
   * número existe para o relatório da carga dizer de onde a flag de previsão
   * saiu de verdade — ver `previsao`.
   */
  linhasSemStatus: number
}

/* ------------------------------------------------------------- códigos */

export const ALERTA_EMBARQUE_PREVISTO = 'embarque_previsto'
export const ALERTA_SEM_DATA_EFETIVA = 'embarque_sem_data_efetiva'
export const ALERTA_SEM_CONTAGEM_DE_CONTAINER = 'sem_contagem_de_container'
export const ALERTA_CONTAGEM_POR_TIPO = 'contagem_de_container_pelo_tipo'
export const ALERTA_SEM_LOCODE = 'embarque_sem_locode'
export const ALERTA_CARGA_AEREA = 'carga_aerea_de_fornecedor'

/**
 * Agente de carga a partir do nome da aba.
 *
 * O export nomeia a aba de detalhe como agente e período separados por
 * sublinhado. Vale a parte antes do primeiro sublinhado; sem sublinhado, a aba
 * inteira. **O escopo de recarga é a aba, não o agente** (§8.4), então uma
 * convenção diferente num export futuro não faz uma carga apagar a outra — no
 * pior caso agrupa errado, e isso aparece no relatório.
 */
export function agenteDoBloco(nomeDaAba: string): string {
  const [primeiro] = nomeDaAba.trim().split('_')
  return (primeiro || nomeDaAba).trim()
}

/**
 * A aba tem nome de bloco de agente — `agente_período` — ainda que não traga
 * detalhe nenhum.
 *
 * **É o que separa "fonte que não veio" de "lixo do sistema de origem".** Os
 * dois caem na mesma pilha de abas não lidas, e tratá-los igual é o silêncio que
 * a §8.4 existe para impedir: um agente inteiro ficando de fora do inventário
 * parece, no relatório, exatamente igual a uma aba de template.
 *
 * A regra é de forma, como a do cabeçalho: nome de aba não vira lista neste
 * repositório (§2.2). Uma aba de agente nomeada fora da convenção continua
 * aparecendo nominalmente entre as ignoradas — some da contagem, não do
 * relatório.
 */
export function pareceBlocoDeAgente(nomeDaAba: string): boolean {
  return /^[^_]+_\d{4}$/.test(nomeDaAba.trim())
}

/* ------------------------------------------------------------- realização */

/**
 * Em que grau se sabe que o embarque aconteceu — CLAUDE.md §8.3.
 *
 * **A ausência de uma coluna significa coisas diferentes em cada modal, e por
 * isso não serve de prova.** A coluna de partida efetiva é de navio: no frete
 * aéreo ela nunca é preenchida, por construção. Uma derivação que lesse só ela
 * marcaria todo embarque aéreo como não realizado — e, como previsão fica fora
 * do total, descartaria emissão verdadeira por falta de uma coluna que aquele
 * modal não tem.
 *
 * Três graus, e **só o primeiro sai do total**:
 *
 *  - `previsto` — o embarque ainda não aconteceu. Duas entradas, e nenhuma delas
 *    depende do modal: **nenhuma data, de espécie nenhuma** (a reserva criada
 *    antes de existir viagem, com o CO₂ já lançado), ou **partida prevista para
 *    depois do fim do próprio arquivo** (a viagem marcada, ainda por fazer).
 *  - `sem_data_efetiva` — devia ter partido e nenhuma data de fato foi lançada.
 *    Pode ter acontecido sem ninguém digitar, e descartar emissão real por falta
 *    de digitação é erro maior que incluir uma previsão. Recebe alerta e
 *    **continua no total**. É aqui que o modal é declarado, porque a força da
 *    prova difere: no marítimo há três colunas de fato possíveis, no aéreo há
 *    uma só.
 *  - `realizado` — tem pelo menos uma data de fato que o seu modal admite.
 */
export type GrauDeRealizacao = 'previsto' | 'sem_data_efetiva' | 'realizado'

/**
 * As datas de fato que cada modal pode ter.
 *
 * Modal desconhecido admite todas: aceitar prova a mais erra para o lado de
 * manter emissão no total, que é o lado seguro desta regra.
 */
export function provasDeFato(
  modal: 'aereo' | 'maritimo' | 'indefinido',
  embarque: { atd: string | null; ata: string | null; ataFinal: string | null },
): (string | null)[] {
  if (modal === 'aereo') return [embarque.ataFinal]
  return [embarque.atd, embarque.ata, embarque.ataFinal]
}

/** O modal do embarque, pela coluna de transporte. */
export function modalDe(trans: string | null): 'aereo' | 'maritimo' | 'indefinido' {
  const t = (trans ?? '').trim().toUpperCase()
  if (t === 'AIR') return 'aereo'
  if (t === 'SEA') return 'maritimo'
  return 'indefinido'
}

/**
 * Até quando o arquivo sabe o que aconteceu — a última data de **fato** que ele
 * traz, em qualquer linha.
 *
 * É o que separa "a viagem ainda não foi" de "a viagem foi e ninguém lançou", e
 * **sai do próprio arquivo em vez do relógio**: a coluna de status da origem é
 * fórmula comparada com a data de hoje, e por isso reclassifica sozinha a cada
 * execução. Uma classificação que muda sem o dado mudar não é reprodutível.
 *
 * O erro possível é uma data de fato digitada longe demais no futuro, que
 * empurraria a referência adiante e faria uma previsão verdadeira cair em
 * `sem_data_efetiva`. O efeito é manter a emissão no total com alerta, que é o
 * lado seguro de errar.
 */
export function dataDeReferencia(
  embarques: { atd: string | null; ata: string | null; ataFinal: string | null }[],
): string | null {
  let maior: string | null = null
  for (const e of embarques) {
    for (const d of [e.atd, e.ata, e.ataFinal]) {
      if (d !== null && (maior === null || d > maior)) maior = d
    }
  }
  return maior
}

export function grauDeRealizacao(
  embarque: {
    trans: string | null
    etd: string | null
    eta: string | null
    atd: string | null
    ata: string | null
    ataFinal: string | null
  },
  referencia: string | null,
): GrauDeRealizacao {
  const fatos = provasDeFato(modalDe(embarque.trans), embarque)
  if (fatos.some((d) => d !== null)) return 'realizado'

  const previstas = [embarque.etd, embarque.eta]
  if (previstas.every((d) => d === null) && embarque.atd === null && embarque.ata === null) {
    return 'previsto'
  }
  if (referencia !== null && embarque.etd !== null && embarque.etd > referencia) {
    return 'previsto'
  }
  return 'sem_data_efetiva'
}

/* --------------------------------------------------------------- cabeçalho */

/** A coluna que identifica uma aba de detalhe, e é o que localiza o cabeçalho. */
const COLUNA_IDENTIFICADORA = 'SHIPMENT ID'

/**
 * Outras colunas que uma aba de detalhe traz, e das quais o cabeçalho precisa
 * ter um mínimo. Não é a lista do que se lê — é forma, não contrato: coluna
 * ausente continua sendo ausente e não erro fatal (§8.3).
 */
const COLUNAS_DE_DETALHE = [
  'CO2',
  'TRANS',
  'MODE',
  'ORIGIN NAME',
  'DESTINATION NAME',
  'HOUSE REF',
  'WEIGHT',
  'VOLUME',
  'FIRST LOAD',
  'LAST DISCHARGE',
  'ETD FIRST LOAD',
  'ETA LAST DISCHARGE',
  'CONTAINER TYPE',
]

/**
 * Quantas dessas colunas o cabeçalho precisa ter, além do identificador.
 *
 * O número é folgado nos dois sentidos de propósito: uma aba de detalhe traz
 * duas dezenas de colunas nomeadas, e a aba de configuração que motivou a regra
 * traz três, das quais só uma é conhecida. Entre um e outro há margem para uma
 * aba de agente novo vir com menos colunas e continuar sendo lida.
 */
const MINIMO_DE_COLUNAS_DE_DETALHE = 4

/**
 * Localiza a linha de cabeçalho **pelo conteúdo, nunca por índice fixo** (§8.3).
 *
 * Ela muda de posição entre as abas do mesmo arquivo. Devolve `-1` quando a aba
 * não é de detalhe — e é isso que descarta as abas de template do sistema de
 * origem, **sem nenhuma lista de nomes de aba no código**: template novo nasce
 * ignorado e aba de agente novo nasce lida.
 *
 * **O identificador sozinho não basta, e descobrir isso custou um bloco
 * fantasma.** O sistema de origem guarda a configuração de ordenação numa aba
 * cuja primeira célula é o nome do campo identificador — rótulo de campo, não
 * cabeçalho de tabela. A regra mordia nela e produzia um bloco com linhas cujos
 * identificadores eram nomes de campo; nenhuma virava documento, mas todas
 * viravam recusa declarada dentro da conferência de cobertura, que é onde ruído
 * custa mais caro. Por isso o cabeçalho precisa também **ter forma de tabela de
 * embarques**: um mínimo das outras colunas do export.
 */
export function localizarCabecalho(linhas: CelulaBruta[][]): number {
  for (let r = 0; r < linhas.length; r++) {
    const linha = linhas[r] ?? []
    const nomes = new Set(linha.map(chave))
    if (!nomes.has(COLUNA_IDENTIFICADORA)) continue
    const conhecidas = COLUNAS_DE_DETALHE.filter((c) => nomes.has(c)).length
    if (conhecidas >= MINIMO_DE_COLUNAS_DE_DETALHE) return r
  }
  return -1
}

/**
 * Mapa de nome de coluna para índice, mais os índices sem nome.
 *
 * **As colunas mudam entre abas** (§8.3): uma aba tem a coluna de empresa e a
 * outra não, e isso desloca todas as seguintes. Por isso a leitura é sempre por
 * nome, nunca por posição — e coluna ausente devolve nulo, não erro fatal.
 */
export function mapearColunas(cabecalho: CelulaBruta[]): {
  nomeadas: Map<string, number>
  anonimas: number[]
} {
  const nomeadas = new Map<string, number>()
  const anonimas: number[] = []
  for (let c = 0; c < cabecalho.length; c++) {
    const nome = chave(cabecalho[c])
    if (nome === '') anonimas.push(c)
    // Há nome de coluna repetido — a unidade aparece duas vezes, uma para peso
    // e outra para volume. Vence a primeira; as seguintes não são usadas.
    else if (!nomeadas.has(nome)) nomeadas.set(nome, c)
  }
  return { nomeadas, anonimas }
}

/**
 * Soma a quantidade de contêineres descrita no texto de tipo.
 *
 * O texto vem como `2x20GP`, e um embarque pode ter mais de um grupo. Devolve
 * nulo quando não há nenhum grupo legível — nulo é ausência, não zero: zero
 * afirmaria que o embarque não levou contêiner nenhum.
 */
export function contarPeloTipo(bruto: string | null): number | null {
  if (bruto === null) return null
  let total = 0
  for (const grupo of bruto.matchAll(/(\d+)\s*x\s*\d+/gi)) total += Number(grupo[1])
  return total > 0 ? total : null
}

/* ------------------------------------------------------------------ leitura */

/**
 * Lê uma aba de detalhe. Devolve `null` quando a aba não é de detalhe.
 *
 * `referencia` é a última data de fato do **arquivo inteiro**, e é o que separa
 * previsão de lançamento faltando — ver `dataDeReferencia`. Sem ela, nenhum
 * embarque com itinerário é classificado como previsto: a leitura de uma aba
 * isolada não tem como saber até quando o arquivo enxerga.
 */
export function lerAbaMaritima(
  aba: AbaLida,
  referencia: string | null = null,
): BlocoLido | null {
  const r0 = localizarCabecalho(aba.linhas)
  if (r0 < 0) return null

  const { nomeadas, anonimas } = mapearColunas(aba.linhas[r0] ?? [])
  const bloco = aba.nome.trim()
  const agente = agenteDoBloco(bloco)

  const embarques: EmbarqueLido[] = []
  const descartadas: LinhaDescartada[] = []
  let linhasSemStatus = 0

  /**
   * A coluna numérica de quantidade de contêineres **não tem nome** no export, e
   * é mais confiável que fazer parse do texto de tipo (§8.3). Ela é procurada
   * entre as colunas sem nome, pela presença de número na faixa de dados — não
   * por posição, que muda junto com as demais colunas.
   */
  const colunaDeContagem = anonimas.find((c) =>
    aba.linhas
      .slice(r0 + 1)
      .some((linha) => typeof (linha ?? [])[c] === 'number'),
  )

  for (let r = r0 + 1; r < aba.linhas.length; r++) {
    const linha = aba.linhas[r] ?? []
    const em = (nome: string): CelulaBruta => {
      const c = nomeadas.get(nome)
      return c === undefined ? null : (linha[c] ?? null)
    }

    const shipmentId = texto(em(COLUNA_IDENTIFICADORA))

    /**
     * **Há linhas de total dentro da aba de dados** (§8.3) — uma com a soma e
     * outra com o indicador, e elas ocupam colunas de dado. O que as separa de
     * um embarque é não terem identificador.
     *
     * Descartar em silêncio seria transformar erro de leitura em cobertura
     * correta: linha não vazia sem identificador é registrada com o motivo, e o
     * script imprime todas.
     */
    if (shipmentId === '') {
      const temConteudo = linha.some((c) => texto(c) !== '')
      if (temConteudo) {
        descartadas.push({ linha: r + 1, motivo: 'linha sem identificador de embarque' })
      }
      continue
    }

    const alertas: AlertaDeLeitura[] = []

    const containerTipo = textoOuNulo(em('CONTAINER TYPE'))
    const daColuna =
      colunaDeContagem === undefined ? null : numeroOuNulo(linha[colunaDeContagem] ?? null)
    const peloTipo = contarPeloTipo(containerTipo)

    let containers: number | null = null
    let containersFonte: FonteDaContagem | null = null
    if (daColuna !== null && daColuna > 0) {
      containers = daColuna
      containersFonte = 'coluna'
    } else if (peloTipo !== null) {
      containers = peloTipo
      containersFonte = 'tipo'
      alertas.push({
        tipo: ALERTA_CONTAGEM_POR_TIPO,
        descricao: 'a aba não traz a coluna numérica; a contagem saiu do texto de tipo',
      })
    } else {
      alertas.push({
        tipo: ALERTA_SEM_CONTAGEM_DE_CONTAINER,
        descricao: 'nem coluna numérica nem texto de tipo trazem quantidade',
      })
    }

    const atd = dataOuNulo(em('ATD PARTIDA'))
    const ata = dataOuNulo(em('ATA PARTIDA'))
    const ataFinal = dataOuNulo(em('JW_ATALAST'))
    const etd = dataOuNulo(em('ETD FIRST LOAD'))
    const eta = dataOuNulo(em('ETA LAST DISCHARGE'))
    const trans = textoOuNulo(em('TRANS'))
    const statusBruto = textoOuNulo(em('STATUS 2.0'))
    if (nomeadas.has('STATUS 2.0') && statusBruto === null) linhasSemStatus++

    /**
     * **Embarque ainda não embarcado já vem com CO₂ lançado** (§8.3), e a flag
     * sai do fato, nunca da coluna de status.
     *
     * A coluna de status é fórmula que compara a partida com a data de hoje:
     * ela reclassifica sozinha a cada execução, e no arquivo exportado chega sem
     * valor nenhum. Qual fato vale é o que `grauDeRealizacao` decide — e ele
     * declara o modal em vez de ler uma ausência que significa coisas
     * diferentes em cada um.
     */
    const realizacao = grauDeRealizacao({ trans, etd, eta, atd, ata, ataFinal }, referencia)
    const previsao = realizacao === 'previsto'
    if (previsao) {
      alertas.push({
        tipo: ALERTA_EMBARQUE_PREVISTO,
        descricao:
          etd === null
            ? 'nenhuma data, prevista ou efetiva: o CO₂ lançado é previsão, não realizado'
            : 'partida prevista para depois do fim do arquivo: o CO₂ lançado é previsão',
      })
    } else if (realizacao === 'sem_data_efetiva') {
      const modal = modalDe(trans)
      alertas.push({
        tipo: ALERTA_SEM_DATA_EFETIVA,
        descricao:
          modal === 'aereo'
            ? 'frete aéreo sem data de chegada efetiva: para este modal não há coluna de ' +
              'partida de navio, então a chegada é a única prova possível — a ausência dela ' +
              'não afirma que o embarque não aconteceu, e ele continua no total'
            : 'sem nenhuma data efetiva: pode ter acontecido e não ter sido lançado, ' +
              'e por isso continua no total',
      })
    }

    /**
     * **Há carga aérea de fornecedor no arquivo** (§8.3). É Escopo 3 cat. 4,
     * frete upstream — não é o módulo de viagens, que é passageiro, cat. 6. O
     * alerta existe para ela ser contável na tela de método em vez de se diluir.
     */
    if (trans !== null && chave(trans) === 'AIR') {
      alertas.push({
        tipo: ALERTA_CARGA_AEREA,
        descricao: 'frete aéreo de fornecedor: Escopo 3 cat. 4, não é viagem de passageiro',
      })
    }

    const locodeOrigem = textoOuNulo(em('FIRST LOAD'))
    const locodeDestino = textoOuNulo(em('LAST DISCHARGE'))
    if (locodeOrigem === null || locodeDestino === null) {
      alertas.push({
        tipo: ALERTA_SEM_LOCODE,
        descricao: 'sem código de porto em uma das pontas: o embarque não entra no mapa',
      })
    }

    embarques.push({
      bloco,
      agente,
      linha: r + 1,
      shipmentId,
      empresa: textoOuNulo(em('CONSIGNEE NAME')),
      trans,
      mode: textoOuNulo(em('MODE')),
      origemNome: textoOuNulo(em('ORIGIN NAME')),
      destinoNome: textoOuNulo(em('DESTINATION NAME')),
      locodeOrigem: locodeOrigem === null ? null : chave(locodeOrigem),
      locodeDestino: locodeDestino === null ? null : chave(locodeDestino),
      houseRef: textoOuNulo(em('HOUSE REF')),
      pesoKg: numeroOuNulo(em('WEIGHT')),
      volumeM3: numeroOuNulo(em('VOLUME')),
      containers,
      containersFonte,
      containerTipo,
      co2Kg: numeroOuNulo(em('CO2')),
      etd,
      eta,
      atd,
      ata,
      ataFinal,
      navioPartida: textoOuNulo(em('VESSEL PARTIDA')),
      navioTransbordo: textoOuNulo(em('VESSEL TRANSBORDO')),
      statusBruto,
      previsao,
      realizacao,
      alertas,
    })
  }

  return {
    bloco,
    agente,
    linhaDoCabecalho: r0 + 1,
    colunas: [...nomeadas.keys()],
    embarques,
    descartadas,
    linhasSemStatus,
  }
}

/**
 * Lê o arquivo inteiro. Devolve os blocos de detalhe e **o que foi ignorado**.
 *
 * As abas ignoradas são devolvidas nominalmente de propósito: é o que faz o
 * relatório da carga dizer que existe uma aba de agente sem detalhe, em vez de
 * ela sumir junto com os templates. Fonte que some sem ninguém ver é o erro que
 * a §8.4 existe para impedir.
 */
export function lerRelatorioMaritimo(abas: AbaLida[]): {
  blocos: BlocoLido[]
  /**
   * Abas com nome de bloco de agente e **sem detalhe linha a linha**.
   *
   * Não são lixo: são fonte que não veio. O volume delas não está no total, e
   * isso é ausência de fonte, não de qualidade (§8.2) — a cascata estima o que
   * falta dentro de um embarque, não o embarque que não existe.
   */
  semDetalhe: string[]
  ignoradas: string[]
  /** Até quando o arquivo sabe o que aconteceu. Vai ao relatório da carga. */
  referencia: string | null
} {
  const ignoradas: string[] = []
  const semDetalhe: string[] = []

  /**
   * **Duas passadas, e a primeira existe por causa da referência.**
   *
   * A classificação de previsão compara a partida prevista de uma linha com a
   * última data de fato do arquivo **inteiro** — que só se conhece depois de ler
   * todas as abas. A primeira passada lê para descobrir até quando o arquivo
   * enxerga; a segunda lê para valer. São matrizes já em memória, e reler custa
   * menos que espalhar a classificação por fora da leitura.
   */
  const primeira: BlocoLido[] = []
  for (const aba of abas) {
    const bloco = lerAbaMaritima(aba)
    if (bloco !== null) {
      primeira.push(bloco)
    } else if (pareceBlocoDeAgente(aba.nome)) {
      semDetalhe.push(aba.nome.trim())
    } else {
      ignoradas.push(aba.nome)
    }
  }
  const referencia = dataDeReferencia(primeira.flatMap((b) => b.embarques))

  const blocos: BlocoLido[] = []
  for (const aba of abas) {
    const bloco = lerAbaMaritima(aba, referencia)
    if (bloco !== null) blocos.push(bloco)
  }
  return { blocos, semDetalhe, ignoradas, referencia }
}

/* ------------------------------------------------------- corredor e outliers */

/** Corredor de um embarque: o par de códigos de porto, na ordem do transporte. */
export function corredorDe(embarque: {
  locodeOrigem: string | null
  locodeDestino: string | null
}): string | null {
  if (embarque.locodeOrigem === null || embarque.locodeDestino === null) return null
  return `${embarque.locodeOrigem}-${embarque.locodeDestino}`
}

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null
  const ordenado = [...valores].sort((a, b) => a - b)
  const meio = ordenado.length / 2
  return ordenado.length % 2 === 1
    ? ordenado[Math.floor(meio)]
    : (ordenado[meio - 1] + ordenado[meio]) / 2
}

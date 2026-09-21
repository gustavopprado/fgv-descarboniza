/**
 * Leitura do relatório de entregas por filial — CLAUDE.md §9.
 *
 * O arquivo é export do sistema de faturamento: uma linha por entrega, com data,
 * filial, cliente, distância e peso. As armadilhas da §9.3 vivem todas aqui, e
 * cada uma tem um comentário no ponto onde é tratada.
 *
 * O módulo é **puro**: recebe abas já lidas em forma de matriz e devolve
 * entregas. Quem abre arquivo, quem resolve o fator e quem fala com o banco é o
 * script de carga.
 *
 * **Nada aqui conhece nome de cliente nem de transportadora.** Toda decisão é
 * por forma — presença de coluna, presença de cliente, ordem de grandeza da
 * distância —, nunca por lista de nomes: nome real não entra em repositório
 * público (§2.1), e a planilha não diz qual transportadora fez a entrega (§9.1).
 */
import { chave, dataBrOuNulo, dataDeSerieOuNulo, dataOuNulo, texto, type AbaLida, type CelulaBruta } from './planilha'

/**
 * As três filiais de onde sai a distribuição — CLAUDE.md §9.4.
 *
 * Nome e cidade são fato da empresa e estão no próprio documento de
 * especificação; o que não entra aqui é coordenada escrita à mão. **O ponto do
 * mapa sai do centroide do município, pelo código do IBGE**, que é a mesma
 * fonte que o programa de viagens usa para desenhar (§7.4) — assim não há
 * coordenada solta no código, e em particular não há como a coordenada da
 * fábrica, que é parâmetro de ambiente (§2.1), acabar versionada por descuido
 * disfarçada de "ponto da matriz".
 */
export const FILIAIS_DO_MODULO = [
  { filial: '01', nome: 'Matriz', codigoIbge: '4106902' },
  { filial: '02', nome: 'Filial Itajaí', codigoIbge: '4208203' },
  { filial: '03', nome: 'Filial Pernambuco', codigoIbge: '2602902' },
] as const

/** Os códigos de filial que o módulo conhece (§9.4). */
export const FILIAIS = FILIAIS_DO_MODULO.map((f) => f.filial) as readonly Filial[]
export type Filial = (typeof FILIAIS_DO_MODULO)[number]['filial']

export function ehFilial(valor: string): valor is Filial {
  return (FILIAIS as readonly string[]).includes(valor)
}

export type EntregaLida = {
  /** Linha na planilha, para mensagem de conferência. Não vai ao banco. */
  linha: number
  filial: Filial
  data: string
  /**
   * O identificador do cliente no relatório de faturamento, **nunca o nome**
   * (§10.11).
   *
   * Nulo quando a coluna de código vem vazia, e nulo é o certo aí: cair no nome
   * do cliente seria pôr nome real no banco e no caminho da tela, e recusar a
   * linha seria descartar emissão verdadeira por falta de um campo que a conta
   * não usa — o agregado é por filial (§9.4).
   */
  clienteCodigo: string | null
  distanciaKm: number
  pesoKg: number
  /**
   * Índice da entrega dentro do mesmo par filial+data, na ordem do arquivo.
   *
   * **É o que dá identidade à linha**, porque a planilha não traz identificador
   * de entrega (§10.11) — e por isso ele conta **apenas as entregas aceitas**:
   * se a linha descartada consumisse um número, tirar uma entrega internacional
   * do arquivo deslocaria o identificador de todas as seguintes daquele dia.
   */
  ordem: number
}

export type LinhaDescartada = {
  linha: number
  motivo: string
}

export type Parametros = {
  /**
   * Acima desta distância a linha não é entrega rodoviária doméstica (§9.3).
   *
   * Parâmetro declarado, nunca constante: ele decide o que **não entra** no
   * inventário, e um número que muda sem registro muda o total sem registro.
   */
  distanciaMaximaKm: number
}

export type RelatorioDeEntregas = {
  /** Aba de onde as entregas vieram. */
  aba: string
  /** Linha da planilha onde o cabeçalho foi encontrado, para o relatório. */
  linhaDoCabecalho: number
  /** Colunas nomeadas que a aba tem, para o relatório da carga. */
  colunas: string[]
  entregas: EntregaLida[]
  /** Linhas recusadas com motivo — anunciadas, nunca silenciosas. */
  descartadas: LinhaDescartada[]
  /**
   * Linhas sem cliente, descartadas **sem alerta** (§9.3).
   *
   * É formato de exportação — linha em branco e o rodapé com os filtros
   * aplicados do relatório —, não dado incompleto que precise virar exceção
   * visível. Contadas porque a conferência de cobertura precisa fechar a conta
   * entre o arquivo e o banco, e descarte que não é contado é buraco.
   */
  semCliente: number
  /**
   * Entregas aceitas cujo código de cliente veio vazio.
   *
   * Contadas para o relatório da carga, e não para recusar nada: o número do
   * módulo não usa o cliente. Se este contador crescer, é sinal de que o export
   * mudou de forma — não de que o inventário está errado.
   */
  semCodigoDoCliente: number
  /** O que a distância recusou, para a carga declarar o corte (§9.3). */
  internacionais: {
    linhas: number
    menorDistanciaKm: number | null
    maiorDistanciaKm: number | null
  }
  /** Abas que não têm cabeçalho de entregas, para o relatório da carga. */
  ignoradas: string[]
}

/* ------------------------------------------------------------------ colunas */

/**
 * Nome normalizado de coluna: sem acento, em caixa alta, espaço colapsado.
 *
 * O cabeçalho traz acento e unidade — "Distância (km)", "Peso Bruto" —, e
 * prender a leitura à grafia exata faria uma troca de rótulo na origem derrubar
 * a carga. O casamento é por **começo do nome**, que é a parte estável.
 */
function normalizar(valor: CelulaBruta): string {
  return chave(valor)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/** Coluna → como reconhecê-la. A ordem é a do relatório, e não importa. */
const COLUNAS = {
  data: 'DATA',
  filial: 'FILIAL',
  codigo: 'CODIGO',
  cliente: 'CLIENTE',
  distancia: 'DISTANCIA',
  peso: 'PESO',
} as const

type NomeDeColuna = keyof typeof COLUNAS

/** Sem estas quatro não há entrega: data, filial, cliente e as duas medidas. */
const OBRIGATORIAS: NomeDeColuna[] = ['data', 'filial', 'cliente', 'distancia', 'peso']

/**
 * Onde cada coluna está, procurando o cabeçalho **pelo conteúdo** (§9.3, §8.3).
 *
 * Devolve `null` quando a linha não é cabeçalho de entregas — e é isso que
 * descarta aba de resumo, aba de template e qualquer outra coisa que o export
 * traga, **sem nenhuma lista de nomes de aba no código**.
 */
export function mapearColunas(linha: CelulaBruta[]): Map<NomeDeColuna, number> | null {
  const mapa = new Map<NomeDeColuna, number>()
  for (let c = 0; c < linha.length; c++) {
    const nome = normalizar(linha[c])
    if (nome === '') continue
    for (const [campo, prefixo] of Object.entries(COLUNAS) as [NomeDeColuna, string][]) {
      if (nome.startsWith(prefixo) && !mapa.has(campo)) mapa.set(campo, c)
    }
  }
  return OBRIGATORIAS.every((campo) => mapa.has(campo)) ? mapa : null
}

/* ------------------------------------------------------------------ células */

/**
 * Número de uma coluna de medida, **aceitando só célula numérica**.
 *
 * Aqui está a diferença mais importante em relação ao leitor do marítimo, e ela
 * é de unidade: lá o número chega digitado à mão e a limpeza tolera o separador
 * de milhar brasileiro. Nesta base a distância tem casas decimais e vale poucos
 * quilômetros em entrega urbana — `"1.701"` é um quilômetro e setecentos metros,
 * e a mesma tolerância o leria como mil setecentos e um. **Não há como decidir
 * qual dos dois é sem olhar a origem**, então texto em coluna de medida recusa a
 * linha em vez de escolher: adivinhar aqui inventa distância.
 */
function medidaOuNulo(valor: CelulaBruta): number | null {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return null
  return valor
}

/**
 * Data da entrega.
 *
 * O pacote entrega a coluna como **número de série do Excel** — quem lê o
 * arquivo não interpreta formato de célula, de propósito (`scripts/_xlsx.ts`) —,
 * e a conversão acontece aqui, onde se sabe que a coluna significa data. As
 * outras duas formas existem para o dia em que o arquivo passar por CSV ou vier
 * de outro leitor: `DD/MM/AAAA` e `AAAA-MM-DD`.
 *
 * A ordem importa: o dia antes do mês é a convenção desta origem, e testá-la
 * antes do ISO evita ler `2025-01-02` como dois de janeiro num arquivo e como
 * primeiro de fevereiro no outro.
 */
function dataDaEntrega(valor: CelulaBruta): string | null {
  return dataDeSerieOuNulo(valor) ?? dataBrOuNulo(valor) ?? dataOuNulo(valor)
}

/* ------------------------------------------------------------------ leitura */

/**
 * Lê as entregas de todas as abas que tenham cabeçalho de entregas.
 *
 * Na prática o export tem uma aba só; a varredura existe para que uma aba a mais
 * no arquivo não passe despercebida nem derrube a carga — ela aparece entre as
 * ignoradas, pelo nome.
 */
export function lerRelatorioDeEntregas(
  abas: AbaLida[],
  parametros: Parametros,
): RelatorioDeEntregas {
  const ignoradas: string[] = []
  const candidatas: { aba: AbaLida; colunas: Map<NomeDeColuna, number>; r0: number }[] = []

  for (const aba of abas) {
    let achou = false
    for (let r = 0; r < aba.linhas.length; r++) {
      const colunas = mapearColunas(aba.linhas[r] ?? [])
      if (colunas !== null) {
        candidatas.push({ aba, colunas, r0: r })
        achou = true
        break
      }
    }
    if (!achou) ignoradas.push(aba.nome)
  }

  /**
   * **Duas abas de entregas param a carga em vez de uma virar a fonte.**
   *
   * Escolher a primeira e ignorar a segunda seria uma fonte inteira ficando de
   * fora do inventário sem nada parecer errado — o defeito que já custou duas
   * vezes aqui (§8.4). Qual das duas é a base não se adivinha.
   */
  if (candidatas.length > 1) {
    throw new Error(
      `Mais de uma aba tem cabeçalho de entregas: ${candidatas
        .map((c) => c.aba.nome)
        .join(', ')}. Escolher uma delas deixaria a outra fora do inventário em ` +
        'silêncio; separe o arquivo ou diga qual é a fonte.',
    )
  }

  const escolhida = candidatas[0] ?? null
  if (escolhida === null) {
    throw new Error(
      'Nenhuma aba do arquivo tem cabeçalho de entregas (data, filial, cliente, ' +
        'distância e peso). O cabeçalho é localizado pelo conteúdo, nunca por ' +
        'posição — se o relatório mudou de forma, a carga para em vez de ler ' +
        'coluna errada (§9.3).',
    )
  }

  const { aba, colunas, r0 } = escolhida
  const entregas: EntregaLida[] = []
  const descartadas: LinhaDescartada[] = []
  let semCliente = 0
  let semCodigoDoCliente = 0
  const internacionais: number[] = []
  const ordemPorDia = new Map<string, number>()

  for (let r = r0 + 1; r < aba.linhas.length; r++) {
    const linha = aba.linhas[r] ?? []
    const numeroDaLinha = r + 1
    const em = (campo: NomeDeColuna): CelulaBruta => {
      const c = colunas.get(campo)
      return c === undefined ? null : (linha[c] ?? null)
    }

    // **Linha sem cliente sai sem alerta** (§9.3): é a linha em branco e o
    // rodapé de filtros do relatório, não dado incompleto.
    const cliente = texto(em('cliente'))
    if (cliente === '') {
      semCliente += 1
      continue
    }

    const filialBruta = texto(em('filial'))
    if (!ehFilial(filialBruta)) {
      // Filial nova não é linha a ignorar: é a §9.4 desatualizada. A carga
      // recusa a linha e **diz qual código apareceu**, para a decisão ser de
      // quem mantém a lista de filiais, não de um descarte silencioso.
      descartadas.push({
        linha: numeroDaLinha,
        motivo: `filial "${filialBruta}" não está entre as conhecidas (${FILIAIS.join(', ')})`,
      })
      continue
    }

    const data = dataDaEntrega(em('data'))
    if (data === null) {
      descartadas.push({ linha: numeroDaLinha, motivo: 'sem data que se possa ler' })
      continue
    }

    const distanciaKm = medidaOuNulo(em('distancia'))
    const pesoKg = medidaOuNulo(em('peso'))
    if (distanciaKm === null || pesoKg === null) {
      descartadas.push({
        linha: numeroDaLinha,
        motivo:
          'distância ou peso ausente, ou escrito como texto — em coluna de medida, ' +
          'texto é ambíguo e não se adivinha',
      })
      continue
    }
    if (distanciaKm < 0 || pesoKg < 0) {
      descartadas.push({ linha: numeroDaLinha, motivo: 'distância ou peso negativo' })
      continue
    }

    /**
     * **Linha internacional não entra** (§9.3). A partir de certo ponto do
     * relatório a distância salta para a casa dos dez mil quilômetros e o
     * cliente passa a ser do exterior: são entregas que pertencem ao módulo
     * marítimo, não a este. O limiar é parâmetro, e o descarte é contado e
     * anunciado — o módulo declara quanto ficou de fora.
     */
    if (distanciaKm > parametros.distanciaMaximaKm) {
      internacionais.push(distanciaKm)
      continue
    }

    const dia = `${filialBruta}|${data}`
    const ordem = (ordemPorDia.get(dia) ?? 0) + 1
    ordemPorDia.set(dia, ordem)

    const clienteCodigo = texto(em('codigo')) || null
    if (clienteCodigo === null) semCodigoDoCliente += 1

    entregas.push({
      linha: numeroDaLinha,
      filial: filialBruta,
      data,
      clienteCodigo,
      distanciaKm,
      pesoKg,
      ordem,
    })
  }

  return {
    aba: aba.nome,
    linhaDoCabecalho: r0 + 1,
    colunas: [...colunas.keys()],
    entregas,
    descartadas,
    semCliente,
    semCodigoDoCliente,
    internacionais: {
      linhas: internacionais.length,
      menorDistanciaKm: internacionais.length === 0 ? null : Math.min(...internacionais),
      maiorDistanciaKm: internacionais.length === 0 ? null : Math.max(...internacionais),
    },
    ignoradas,
  }
}

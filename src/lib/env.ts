/**
 * Acesso a variáveis de ambiente — sempre no servidor.
 *
 * Nada aqui pode virar `NEXT_PUBLIC_` (CLAUDE.md §11.2). A coordenada da
 * fábrica é parâmetro de ambiente e nunca constante no código (§6.2).
 *
 * Toda leitura falha explicitamente quando a variável não existe: é melhor o
 * script parar do que calcular com um padrão silencioso.
 */

export function obrigatoria(nome: string): string {
  const valor = process.env[nome]
  if (valor === undefined || valor.trim() === '') {
    throw new Error(
      `Variável de ambiente ausente: ${nome}. Veja .env.example.`,
    )
  }
  return valor.trim()
}

export function opcional(nome: string): string | undefined {
  const valor = process.env[nome]
  return valor === undefined || valor.trim() === '' ? undefined : valor.trim()
}

function numeroObrigatorio(nome: string): number {
  const bruto = obrigatoria(nome)
  const valor = Number(bruto)
  if (!Number.isFinite(valor)) {
    throw new Error(`Variável de ambiente ${nome} não é um número.`)
  }
  return valor
}

/**
 * Credenciais do Admin SDK. Duas formas, nesta ordem:
 *
 *  1. as três variáveis da service account — é o que funciona na Vercel, onde
 *     não há arquivo em disco;
 *  2. `GOOGLE_APPLICATION_CREDENTIALS` apontando para o JSON da service account
 *     — conveniente na máquina de quem roda as cargas.
 *
 * Sem nenhuma das duas, falha explicitamente. O JSON da service account nunca
 * entra no repositório (§2.1).
 */
export type CredenciaisFirebase =
  | {
      modo: 'service-account'
      projectId: string
      clientEmail: string
      privateKey: string
    }
  | { modo: 'padrao-do-ambiente'; projectId: string }

export function credenciaisFirebase(): CredenciaisFirebase {
  const projectId = obrigatoria('FIREBASE_PROJECT_ID')
  const clientEmail = opcional('FIREBASE_CLIENT_EMAIL')
  const privateKey = opcional('FIREBASE_PRIVATE_KEY')

  if (clientEmail && privateKey) {
    return {
      modo: 'service-account',
      projectId,
      clientEmail,
      // A chave viaja com \n escapado quando vem de variável de ambiente; sem
      // desfazer isso o Admin SDK recusa o PEM.
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }
  }

  if (opcional('GOOGLE_APPLICATION_CREDENTIALS')) {
    return { modo: 'padrao-do-ambiente', projectId }
  }

  throw new Error(
    'Credencial do Firebase ausente. Informe FIREBASE_CLIENT_EMAIL e ' +
      'FIREBASE_PRIVATE_KEY, ou aponte GOOGLE_APPLICATION_CREDENTIALS para o ' +
      'JSON da service account. Veja .env.example.',
  )
}

/** Origem dos deslocamentos de mobilidade. Nunca hardcoded (§6.2). */
export function coordenadaFabrica(): { latitude: number; longitude: number } {
  return {
    latitude: numeroObrigatorio('FABRICA_LATITUDE'),
    longitude: numeroObrigatorio('FABRICA_LONGITUDE'),
  }
}

/** Dias úteis por mês usados na mobilidade. Parâmetro, não constante (§6.2). */
export function diasUteisMes(): number {
  return numeroObrigatorio('MOBILIDADE_DIAS_UTEIS_MES')
}

/** Recorte com menos que isso não vai para a tela (§3.1.1). */
export function supressaoMinima(): number {
  return numeroObrigatorio('MOBILIDADE_SUPRESSAO_MINIMA')
}

/**
 * Ano que o inventário de viagens relata (§7).
 *
 * **O trecho entra pelo ano do voo, não pelo da emissão da passagem** — há
 * passagem comprada num ano com voo no seguinte, e o inventário agrupa pela data
 * do voo (§7.2). Trecho de outro ano não é carregado: ele pertence ao relatório
 * daquele ano, não a este.
 *
 * Sem padrão, de propósito. Um ano de exemplo aqui seria placeholder plausível —
 * carregaria o período errado sem nenhum erro aparecer, que é o caso da §14.
 */
export function anoBaseViagens(): number {
  const ano = numeroObrigatorio('VIAGENS_ANO_BASE')
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    throw new Error(`VIAGENS_ANO_BASE fora da faixa aceitável: ${ano}`)
  }
  return ano
}

/**
 * Ano-base da pesquisa de mobilidade, quando o ambiente o declara.
 *
 * **É a pesquisa que tem ano-base, não o ano civil.** A resposta é uma taxa
 * mensal que vale para os doze meses do ano-base (§9.5), então recortar a
 * coleção por ano civil devolve vazio — e um painel a menos sem erro nenhum
 * (§10.0).
 *
 * Opcional de propósito, e a diferença importa: sem o valor, o módulo não tem
 * recorte, e **isso é ausência, não zero** (§9.10). A tela declara qual dos dois
 * é, em vez de desenhar um zero que passa por medição.
 */
export function anoBaseMobilidade(): number | null {
  const bruto = opcional('MOBILIDADE_ANO_BASE')
  if (bruto === undefined) return null
  const ano = Number(bruto)
  return Number.isInteger(ano) && ano > 2000 && ano < 2100 ? ano : null
}

/* ----------------------------------------------- inventário consolidado */

/**
 * **O ano que o inventário consolidado relata — constante, nunca ambiente**
 * (§10.0).
 *
 * Não há seletor de ano na Visão geral, e por isso não há variável: viagens
 * relata um ano só, e o marítimo tem pontas parciais nos dois extremos da série
 * (§8.4). Um seletor convidaria a ler ponta parcial como ano cheio — que é a
 * §0.1 com outra roupa, queda de cobertura lida como queda de emissão.
 *
 * É constante pelo mesmo motivo que a base de data do marítimo passou a ser:
 * **a escolha que mais move o número não pode mudar por variável esquecida numa
 * máquina.** Um ano plausível no ambiente carregaria o período errado sem nada
 * parecer quebrado, que é a forma mais cara de estar errado.
 *
 * Lida pela Visão geral e pela tela de Método, nunca do ambiente.
 */
export const ANO_BASE_INVENTARIO = 2025

/* --------------------------------------------- programa de viagens (§7.5) */

/**
 * Quantas pessoas o programa poderia alcançar — o denominador da adesão.
 *
 * **Não sai de nenhuma coleção, e é por isso que é parâmetro.** O candidato
 * óbvio seria o tamanho da coleção de funcionários, e ele está errado: ela é
 * alimentada por mais de uma base e inclui gente que só aparece como aprovador
 * de passagem, nunca como viajante. Um denominador grande demais faz a adesão
 * parecer menor do que é, e o indicador **parece funcionar** — que é a forma
 * mais cara de estar errado (§13).
 *
 * Sem valor, a tela mostra a contagem e diz que o denominador não está
 * definido, em vez de exibir uma proporção inventada. É a mesma regra da tela de
 * método: decisão pendente é declarada, não deixada em branco.
 */
export function programaQuadro(): number | null {
  const bruto = opcional('PROGRAMA_QUADRO')
  if (bruto === undefined) return null
  const valor = Number(bruto)
  if (!Number.isInteger(valor) || valor < 1) {
    throw new Error(`PROGRAMA_QUADRO precisa ser inteiro ≥ 1: ${bruto}`)
  }
  return valor
}

/**
 * Até quando o período do programa está fechado (§7.5).
 *
 * Viagem cuja data de ida seja **até esta data, inclusive**, fica somente
 * leitura: o viajante continua vendo a própria submissão e não a edita mais.
 *
 * **Fechar é operação, não tela.** Como conceder perfil e como rodar carga, isso
 * acontece fora da aplicação — não existe botão que feche um período, porque um
 * botão assim precisaria de quem pode apertá-lo, de registro de quem apertou e
 * de como desfazer, e nada disso vale o preço num programa que não é fonte de
 * relatório (§0.1).
 *
 * Sem valor, nada está fechado e tudo é editável. É o estado inicial e é
 * declarado na tela.
 */
export function programaFechadoAte(): string | null {
  const bruto = opcional('PROGRAMA_FECHADO_ATE')
  if (bruto === undefined) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bruto)) {
    throw new Error(
      `PROGRAMA_FECHADO_ATE precisa estar em AAAA-MM-DD: ${bruto}`,
    )
  }
  return bruto
}

/**
 * Chave do provedor de rota usada **pela aplicação**, não pelas cargas (§11.8).
 *
 * São duas chaves de propósito, e a diferença é o destino. A das cargas roda da
 * máquina de quem opera, onde o IP é estável e a chave pode ser restrita por
 * ele. Esta sai da Vercel, cujo IP de saída não é estável: a restrição possível
 * é por API, mais teto de faturamento com alerta. Uma chave só obrigaria a
 * abandonar a restrição por IP das cargas — e chave paga sem restrição não é só
 * risco de privacidade, é conta a pagar.
 *
 * Cai de volta na chave das cargas **só fora de produção**, para o formulário
 * funcionar em desenvolvimento sem exigir duas chaves na máquina de quem
 * desenvolve.
 *
 * **Em produção o fallback não existe, e a trava está aqui e não na
 * configuração.** Sem ela, bastava alguém acrescentar `GOOGLE_ROUTES_API_KEY`
 * na Vercel — por hábito, ou copiando o `.env` inteiro — para o formulário
 * passar a queimar a chave restrita por IP: ou a chamada falha de um jeito que
 * parece problema do provedor, ou a restrição por IP foi afrouxada e a chave
 * paga ficou aberta. **Nada quebraria, nada avisaria**, e é essa a família de
 * defeito que este projeto vem catalogando. Confiar em "não configure aquela
 * variável lá" é confiar na lembrança de alguém daqui a seis meses.
 *
 * Faltando a chave em produção, a falha é explícita, no molde do §10.8: melhor
 * o envio do formulário recusar dizendo o que falta do que calcular distância
 * com uma chave que não deveria estar ali.
 */
export function chaveDeRotaDaAplicacao(): string {
  const doApp = opcional('GOOGLE_ROUTES_API_KEY_APP')
  if (doApp !== undefined) return doApp
  if (process.env.NODE_ENV !== 'production') {
    const dasCargas = opcional('GOOGLE_ROUTES_API_KEY')
    if (dasCargas !== undefined) return dasCargas
  }
  throw new Error(
    'Sem chave de rota para a aplicação. Configure GOOGLE_ROUTES_API_KEY_APP ' +
      '(restrita por API, com teto de faturamento). Em produção não há queda ' +
      'para GOOGLE_ROUTES_API_KEY, que é a chave das cargas. Veja .env.example.',
  )
}

/* ------------------------------------------------------------- marítimo */

/**
 * **A base de data do módulo marítimo é o ETD do primeiro carregamento**, e não
 * é parâmetro de ambiente (§8.3).
 *
 * A §8.3 manda escolher uma das duas bases que o relatório usa, aplicá-la em
 * todo o sistema e declará-la na tela de método. A escolha está feita, e a outra
 * **não tem caminho no código**: a base de registro aduaneiro existe só na aba
 * de resumo, que é agregada, e a §9.1 pede um documento por embarque — não há de
 * onde tirar a data por linha.
 *
 * Por isso ela é constante e não variável. `MARITIMO_BASE_DE_DATA` foi removida:
 * uma variável que só aceita um valor não configura nada, e uma que aceitasse o
 * outro valor prometeria um comportamento que o código não tem. É a mesma lição
 * do `VIAGENS_CORTE_FONTE` — variável que ninguém lê é armadilha esperando
 * alguém encontrar (§7).
 *
 * **O que muda o número, e a tela de método declara:** com o ETD, o total por
 * ano civil não bate com o total por aba do relatório. Um bloco do relatório
 * atravessa a virada do ano, e os embarques da virada pertencem ao ano em que o
 * navio partiu — não ao ano que dá nome à aba.
 */
export const MARITIMO_BASE_DE_DATA = 'etd_primeiro_carregamento' as const

/**
 * Limiares e amostra mínima do módulo marítimo — §8.1.1, §8.2.
 *
 * Os três são **parâmetro declarado, não constante no código**, e vêm sem
 * padrão embutido: a carga recusa rodar sem eles. O do impossível muda o
 * número do inventário, porque decide o que não entra — e por isso nenhum
 * deles pode ficar escondido num valor implícito que ninguém revisa.
 */
export function maritimoLimiarAtipico(): number {
  return razaoObrigatoria('MARITIMO_LIMIAR_ATIPICO')
}

export function maritimoLimiarImpossivel(): number {
  return razaoObrigatoria('MARITIMO_LIMIAR_IMPOSSIVEL')
}

export function maritimoAmostraMinimaCorredor(): number {
  const valor = numeroObrigatorio('MARITIMO_AMOSTRA_MINIMA_CORREDOR')
  if (!Number.isInteger(valor) || valor < 1) {
    throw new Error(
      `MARITIMO_AMOSTRA_MINIMA_CORREDOR precisa ser inteiro ≥ 1: ${valor}`,
    )
  }
  return valor
}

/* ------------------------------------------------------- transportadoras */

/**
 * Acima desta distância a linha não é entrega rodoviária doméstica (§9.3).
 *
 * A partir de certo ponto do relatório a distância salta para a casa dos dez mil
 * quilômetros e o cliente passa a ser do exterior: são embarques que pertencem
 * ao módulo marítimo, não a este. O limiar separa as duas populações.
 *
 * **Parâmetro sem padrão, como os dois limiares do marítimo, e pelo mesmo
 * motivo:** ele decide o que **não entra** no inventário. Um valor embutido aqui
 * mudaria o total sem ninguém rever — apertado, descartaria entrega doméstica
 * verdadeira; folgado demais, importaria uma importação como se fosse caminhão.
 * Ele se escolhe **medindo a base**: entre a maior entrega doméstica e a menor
 * internacional há um vão largo, e o limiar mora dentro dele.
 */
export function transportadorasDistanciaMaximaKm(): number {
  const valor = numeroObrigatorio('TRANSPORTADORAS_DISTANCIA_MAXIMA_KM')
  if (!(valor > 0)) {
    throw new Error(
      `TRANSPORTADORAS_DISTANCIA_MAXIMA_KM precisa ser maior que zero: ${valor}`,
    )
  }
  return valor
}

/** Razão de comparação: precisa ser maior que 1, senão marcaria tudo. */
function razaoObrigatoria(nome: string): number {
  const valor = numeroObrigatorio(nome)
  if (!(valor > 1)) {
    throw new Error(`${nome} precisa ser maior que 1: ${valor}`)
  }
  return valor
}

/**
 * **Não existe data de corte, e a ausência é deliberada** (§0.1, §7).
 *
 * `VIAGENS_CORTE_FONTE` existiu enquanto se acreditou que o relatório da agência
 * e o formulário do viajante eram a mesma série, separadas por uma data. São
 * dois sistemas: um inventário alimentado por planilha e um programa de registro
 * voluntário. Não há o que cortar, e variável de ambiente que ninguém lê é
 * armadilha esperando alguém encontrar.
 */

/**
 * Parâmetros que a tela de método declara (§10).
 *
 * Todos são lidos como opcionais: a tela de método precisa abrir mesmo com
 * ambiente incompleto, justamente para mostrar o que falta. Quem calcula é que
 * exige — e quem exige falha alto.
 */
export function parametrosDeclarados(): {
  geocodeProvedor: string | null
  rotasProvedor: string | null
  mobilidadeDistanciaModo: string | null
  mobilidadeDistanciaMaximaKm: string | null
  mobilidadeAnoBase: string | null
  viagensAnoBase: string | null
  /** A constante do consolidado: ver `ANO_BASE_INVENTARIO`. */
  inventarioAnoBase: typeof ANO_BASE_INVENTARIO
  /** A constante, não uma variável: ver `MARITIMO_BASE_DE_DATA`. */
  maritimoBaseDeData: typeof MARITIMO_BASE_DE_DATA
  maritimoLimiarAtipico: string | null
  maritimoLimiarImpossivel: string | null
  maritimoAmostraMinimaCorredor: string | null
  transportadorasDistanciaMaximaKm: string | null
} {
  return {
    geocodeProvedor: opcional('GEOCODE_PROVEDOR') ?? null,
    rotasProvedor: opcional('ROTAS_PROVEDOR') ?? null,
    mobilidadeDistanciaModo: opcional('MOBILIDADE_DISTANCIA_MODO') ?? null,
    mobilidadeDistanciaMaximaKm: opcional('MOBILIDADE_DISTANCIA_MAXIMA_KM') ?? null,
    mobilidadeAnoBase: opcional('MOBILIDADE_ANO_BASE') ?? null,
    viagensAnoBase: opcional('VIAGENS_ANO_BASE') ?? null,
    // Constante, não variável, e pelo mesmo motivo da base de data abaixo.
    inventarioAnoBase: ANO_BASE_INVENTARIO,
    // Constante, não variável: ver `MARITIMO_BASE_DE_DATA` acima.
    maritimoBaseDeData: MARITIMO_BASE_DE_DATA,
    maritimoLimiarAtipico: opcional('MARITIMO_LIMIAR_ATIPICO') ?? null,
    maritimoLimiarImpossivel: opcional('MARITIMO_LIMIAR_IMPOSSIVEL') ?? null,
    maritimoAmostraMinimaCorredor:
      opcional('MARITIMO_AMOSTRA_MINIMA_CORREDOR') ?? null,
    transportadorasDistanciaMaximaKm:
      opcional('TRANSPORTADORAS_DISTANCIA_MAXIMA_KM') ?? null,
  }
}

/** Domínio do Workspace autorizado a entrar (§11.4). */
export function dominioWorkspace(): string {
  return obrigatoria('GOOGLE_WORKSPACE_DOMINIO')
}

/**
 * O método de cada módulo — CLAUDE.md §10.
 *
 * É aqui que **cada escolha que muda o número fica registrada**. Um inventário
 * não é só o total: é o total mais as decisões que o produziram. Provedor de
 * rota, classe de cabine assumida, ocupação por veículo e base de data não são
 * detalhe de infraestrutura — trocar qualquer um deles muda o resultado, e sem
 * este registro a mudança fica invisível.
 *
 * **Não existe mais uma tela de método.** Ela saiu em 19/09, e o que ela
 * declarava não saiu junto: cada parâmetro passou a morar no painel do número
 * que ele produz, atrás do botão de informações (`src/app/informacoes.tsx`). A
 * ligação entre um parâmetro e o painel que o mostra é a `chave`, e há uma
 * guarda conferindo que nenhuma ficou sem painel — perder o endereço das
 * declarações era o risco que a §13 apontou nesta mudança.
 *
 * Duas regras valem para tudo que sai daqui:
 *
 *  - **nenhum identificador de pessoa** (§3.1) — exceção e alerta saem como
 *    motivo e contagem, nunca como quem;
 *  - **nenhuma descrição livre de alerta chega ao cliente.** A descrição
 *    gravada na carga cita valor da linha — distância, matrícula, combinação
 *    recusada — e é exatamente o tipo de coisa que atravessaria a anonimização
 *    por uma porta lateral. A tela mostra tipo, severidade e quantas vezes.
 */
import type { Firestore, Query } from 'firebase-admin/firestore'

import { MARITIMO_BASE_DE_DATA, opcional, parametrosDeclarados } from '@/lib/env'
import type {
  DocAeroporto,
  DocEmbarque,
  DocFatorEmissao,
  DocMobilidade,
  DocViagemTrecho,
  NivelDado,
  Severidade,
} from '../documentos/tipos'
import { hojeIso } from '../documentos/tipos'
import { COLECAO, firestore } from '../firestore'
import {
  exigirInventario,
  modulosVisiveis,
  podeVerModulo,
  type ContextoDeAcesso,
  type Modulo,
} from './acesso'

/**
 * Nome de cada fonte do **inventário** de viagens, para a tela.
 *
 * Uma fonte que não esteja aqui aparece pelo próprio código, em vez de ser
 * somada a outra: fonte desconhecida tem que ficar visível, não se diluir.
 *
 * O formulário do viajante não está aqui porque não é fonte deste módulo
 * (§0.1): ele alimenta o programa de viagens, que tem coleção e telas próprias.
 */
const NOME_DA_FONTE: Record<string, string> = {
  agencia: 'relatório da agência',
  cartao: 'planilha do cartão',
}

/** O que a tela escreve onde a decisão ainda não foi tomada. */
export const NAO_DEFINIDO = 'não definida'

/**
 * Os quatro degraus da cascata da §8.2, na ordem do mais específico ao mais
 * genérico — e é essa ordem que a tela mostra.
 *
 * O rótulo diz **de onde o número veio**, não quão bom ele é: "estimado por
 * média do corredor" é uma frase que alguém pode conferir contra o documento,
 * enquanto "qualidade média" seria um juízo que a tela não tem como sustentar.
 *
 * **A fórmula não cabe no rótulo, e não é dele.** A primeira versão escrevia
 * "contêineres × média do corredor", e medido a 1024px — onde este painel vive
 * numa coluna de 294px, dividida com os outros dois módulos — dois degraus
 * quebravam em duas linhas. A unidade da estimativa é decisão declarada no
 * parâmetro "Alocação do CO₂", que é onde ela se explica inteira; aqui basta
 * qual mediana produziu o número, que é o que distingue um degrau do outro.
 */
const NIVEL_DA_CASCATA: { nivel: NivelDado; rotulo: string }[] = [
  { nivel: 'medido', rotulo: 'Medido — informado pelo agente' },
  { nivel: 'estimado_corredor', rotulo: 'Estimado — média do corredor' },
  { nivel: 'estimado_media', rotulo: 'Estimado — média geral' },
  { nivel: 'estimado_peso', rotulo: 'Estimado — por peso' },
]

/**
 * O que levantou cada alerta, em uma frase — CLAUDE.md §10.
 *
 * **O motivo é a regra, nunca a linha.** A descrição gravada na carga cita valor
 * do registro — distância, matrícula, razão contra a mediana, código de porto — e
 * por isso não chega ao cliente (§3.1). O que chega é o que está escrito aqui: a
 * condição que dispara o alerta, igual para todas as ocorrências dele, escrita
 * junto do código e não junto do dado.
 *
 * Sem isto a tela mostrava só o identificador do alerta e uma contagem, o que
 * responde "quantos" e não "o quê" — e alerta que não se entende é alerta que se
 * aprende a ignorar, que é a lição que este projeto já registrou duas vezes.
 *
 * `metodo.test.ts` exige que **todo código de alerta emitido pelas cargas tenha
 * linha aqui**: um alerta novo nasce explicado ou reprova.
 */
export const MOTIVO_DO_ALERTA: Record<string, string> = {
  /* ---------------------------------------------------------- mobilidade */
  combustivel_ausente:
    'Modal que queima combustível do próprio respondente, sem combustível informado. Sem ele não há fator, e a resposta fica fora da média.',
  combustivel_em_modal_sem_combustivel:
    'Combustível preenchido em modal que não depende dele — ônibus tem fator por passageiro-km, e bicicleta e a pé não emitem. É erro de entrada, e não tira a linha da média.',
  combustivel_desconhecido:
    'A resposta de combustível não corresponde a nenhum dos valores previstos.',
  transporte_desconhecido:
    'A resposta de transporte não corresponde a nenhum modal previsto, então não há fator a aplicar.',
  geocodificacao_falhou:
    'O CEP não virou coordenada, então não houve distância a calcular. A resposta vira exceção em vez de entrar com distância inventada.',
  geocodificacao_imprecisa:
    'Esta distância é compartilhada por muitas outras respostas — sintoma de provedor que devolve o centro do município no lugar da coordenada do CEP. O módulo continua fechando por dentro, e é por isso que nenhuma conferência de coerência pega.',
  distancia_improvavel:
    'A distância passa do limite declarado nos parâmetros e não se sustenta como deslocamento diário. A resposta fica fora da média e continua no banco.',
  distancia_indisponivel:
    'O provedor de rota não respondeu depois das tentativas. É falha de infraestrutura, não de dado: uma recarga traz a resposta de volta ao cálculo.',
  fator_ausente:
    'Combinação de modal e combustível sem fator definido — a ausência é proposital e indica erro de preenchimento, não modal a estimar. A linha nunca recebe valor aproximado.',
  resposta_substituida:
    'A mesma matrícula respondeu mais de uma vez; vale a resposta mais recente, e a substituição fica registrada na linha que ficou.',
  matricula_lida_como_numero:
    'A matrícula veio como número na planilha, e nesse formato um zero à esquerda pode já ter se perdido na origem.',

  /* -------------------------------------------- viagens (planilha do cartão) */
  codigo_resolvido_por_apelido:
    'O código do aeroporto não veio escrito: foi resolvido pelo nome da cidade, por um dicionário que cobre o que esta planilha escreve, inclusive os erros de digitação dela.',
  data_herdada_do_bloco:
    'A planilha traz data só na primeira linha de cada viagem, e este trecho herdou a dela. Para o total do ano não muda nada; na série mensal, um trecho de volta pode cair no mês seguinte e ser contado no anterior.',
  sequencia_de_trechos_quebrada:
    'O destino de um trecho não é a origem do seguinte. Pode ser viagem partida em blocos, e nesse caso ela conta como mais de uma viagem.',
  segundo_nome_tratado_como_companhia:
    'Um segundo nome apareceu no bloco e foi lido como companhia aérea, que é o caso normal desta planilha. A regra é posicional: num bloco que de fato tivesse dois viajantes, ela silenciaria o segundo, e é este alerta que torna a suposição visível.',

  /* ------------------------------------------------------------- marítimo */
  co2_por_container_atipico:
    'O CO₂ por contêiner desta linha destoa da mediana do próprio corredor acima do limiar declarado nos parâmetros. Contêiner pouco carregado, carga solta e embarque partido produzem isso, e são plausíveis: a linha entra no total e fica marcada. Tirá-la seria remover emissão real por ser incomum.',
  co2_estimado_por_media:
    'O agente não informou CO₂ para este embarque, e o valor veio da cascata da §8.2. O documento guarda a média usada e o tamanho da amostra.',
  embarque_previsto:
    'CO₂ lançado para embarque que ainda não partiu — o relatório já traz número antes da viagem acontecer. Fica fora do total do módulo e contado à parte.',
  embarque_sem_data_efetiva:
    'O embarque tem itinerário com data prevista e nenhuma data de fato. Pode ter acontecido sem ter sido lançado, e por isso continua no total: descartar emissão real por falta de digitação erra mais que incluir uma previsão.',
  sem_contagem_de_container:
    'Nem a coluna numérica nem o texto de tipo trazem quantidade de contêineres, então este embarque não entra no denominador do indicador por contêiner.',
  contagem_de_container_pelo_tipo:
    'A aba não traz a coluna numérica de quantidade, e a contagem saiu do texto de tipo de contêiner, que é menos confiável.',
  embarque_sem_locode:
    'Falta código de porto em uma das pontas, então o embarque não tem como ser desenhado no mapa. Ele continua no total.',
  porto_sem_cadastro:
    'O código de porto da linha não está no cadastro, então não há coordenada para desenhar. Carregar a lista oficial resolve.',
  codigo_de_carregamento_nao_e_porto:
    'O código não é porto marítimo na lista oficial e o embarque é marítimo — costuma ser ponto interior de carregamento lançado onde se espera um porto.',
  nome_do_lugar_diverge_do_codigo:
    'O relatório chama este código por outro lugar. Em transbordo e em frete aéreo isso é esperado, porque o código é o ponto de carregamento e o nome é a origem real; o código é o que vale no mapa.',
  carga_aerea_de_fornecedor:
    'Frete aéreo de fornecedor dentro do relatório marítimo: Escopo 3 categoria 4, frete upstream — não é viagem de passageiro. Entra no total do módulo e fica fora de tudo que é por contêiner.',
  embarque_sem_data_de_referencia:
    'O embarque não tem a data que define o período, então ele conta no total e não aparece na série mensal.',

  /* -------------------------------- viagens (vindos do relatório da agência) */
  fora_do_inventario:
    'Itinerário duplicado no relatório da agência. O trecho fica gravado com a emissão calculada e não entra no total — apagá-lo esconderia que a duplicata existe na origem.',
  possivel_duplicidade:
    'O relatório da agência marcou esta reserva como possivelmente repetida. Ela continua no total: a marca é da origem, e descartar por suspeita tiraria emissão real.',
  trecho_nao_aereo:
    'Trecho que o relatório da agência não classifica como voo. O módulo cobre aéreo e carro, e um trecho sem modal reconhecido fica sinalizado para conferência.',
  troca_de_aeroporto:
    'O aeroporto de chegada de um trecho não é o de partida do seguinte — a viagem trocou de aeroporto na mesma cidade, ou o itinerário tem um vão. A distância de cada trecho continua sendo a dele.',
}

/** O que a tela diz de um alerta que chegou sem explicação declarada. */
export const MOTIVO_NAO_DECLARADO =
  'Alerta sem motivo declarado nesta tela. É defeito desta tela, não do dado.'

/**
 * O nome por extenso de cada base de data possível.
 *
 * A decisão mora na constante `MARITIMO_BASE_DE_DATA`; o que mora aqui é como
 * escrevê-la para quem lê a tela. São coisas diferentes, e é por isso que este
 * mapa não é uma segunda fonte da decisão: base nova sem rótulo não compila.
 */
const BASE_DE_DATA_POR_EXTENSO: Record<typeof MARITIMO_BASE_DE_DATA, string> = {
  etd_primeiro_carregamento: 'partida prevista do primeiro carregamento (ETD)',
}

export type EscopoDoParametro = 'geral' | Modulo

export type ParametroDeclarado = {
  /**
   * Identidade estável do parâmetro, usada pelas telas para escolher o que cada
   * botão de informações mostra.
   *
   * **Existe para a declaração não poder perder endereço.** Com a tela de Método
   * fora, cada parâmetro passou a morar num painel de módulo; sem uma chave, a
   * ligação seria por texto do rótulo, e renomear o rótulo desligaria a
   * declaração da tela **sem erro nenhum** — a §13 avisou que esse era o risco
   * desta mudança. A guarda que confere que toda chave tem lugar é
   * `informacoes.test.ts`.
   */
  chave: string
  rotulo: string
  valor: string
  /** Falso quando a decisão está pendente; a tela marca, não deixa em branco. */
  definido: boolean
  /**
   * Uma glosa curtíssima, **só onde o valor não carrega a consequência**.
   *
   * Nula na maioria: "21 dias úteis" ou "econômica, assumida" já dizem tudo, e
   * uma frase abaixo de cada linha transforma o resumo na tela de Método que ele
   * substituiu. Onde ela existe, é o que muda o número — não a justificativa da
   * decisão, que mora neste repositório.
   */
  observacao: string | null
  escopo: EscopoDoParametro
}

export type FonteDeclarada = {
  modulo: Modulo
  descricao: string
  situacao: string
}

export type ItemDeQualidade = { rotulo: string; valor: string }

export type QualidadeDoModulo = {
  modulo: Modulo
  registros: number
  itens: ItemDeQualidade[]
}

export type ExcecaoDeclarada = {
  modulo: Modulo
  motivo: string
  registros: number
}

export type AlertaDeclarado = {
  modulo: Modulo
  tipo: string
  severidade: Severidade
  ocorrencias: number
  /** A regra que levanta este alerta — nunca o valor da linha (§3.1). */
  motivo: string
}

export type FatorDeclarado = DocFatorEmissao & { vigenteHoje: boolean }

/**
 * Aeroporto cuja região foi inferida da coordenada, não lida do cadastro.
 *
 * Esta é a metade frágil da classificação que agrupa o mapa em corredor
 * (§10.3): caixas retangulares sobre um mundo que não é retangular. A lista sai
 * na tela **para poder ser revisada sem abrir código** — é curta de propósito, e
 * se deixar de ser, é sinal de que a regra precisa de outra fonte.
 */
export type RegiaoInferida = {
  iata: string
  nome: string
  regiao: string
}

export type Metodo = {
  geradoEm: string
  modulos: Modulo[]
  fontes: FonteDeclarada[]
  parametros: ParametroDeclarado[]
  fatores: FatorDeclarado[]
  qualidade: QualidadeDoModulo[]
  excecoes: ExcecaoDeclarada[]
  alertas: AlertaDeclarado[]
  /** Aeroportos cuja região foi inferida da coordenada (§10.3). */
  regioesInferidas: RegiaoInferida[]
}

function texto(valor: string | null): { valor: string; definido: boolean } {
  return valor === null || valor.trim() === ''
    ? { valor: NAO_DEFINIDO, definido: false }
    : { valor: valor.trim(), definido: true }
}

function porcentagem(parte: number, total: number): string {
  if (total === 0) return '—'
  return `${((parte / total) * 100).toFixed(1).replace('.', ',')}%`
}

/**
 * Os parâmetros que não moram em coleção nenhuma.
 *
 * Os de provedor vêm do ambiente e descrevem **a configuração atual**, não
 * necessariamente a que produziu a carga que está no banco: o documento de
 * emissão carimba o fator, não o provedor de rota. A observação diz isso, para
 * a tela não afirmar mais do que sabe.
 */
function parametros(
  visiveis: Modulo[],
  diasUteisNaCarga: number | null,
): ParametroDeclarado[] {
  const env = parametrosDeclarados()
  const lista: ParametroDeclarado[] = []

  if (visiveis.includes('mobilidade')) {
    // **A supressão é parâmetro da mobilidade, não do inventário inteiro**
    // (§3.1.1, §3.1.2). Declará-la como "geral" afirmaria que viagens e marítimo
    // também suprimem, e nenhum dos dois suprime: rota é fato da operação da
    // empresa e embarque não tem pessoa. O escopo aqui é o que impede a tela de
    // prometer uma regra que o código não aplica.
    const supressao = texto(opcional('MOBILIDADE_SUPRESSAO_MINIMA') ?? null)
    lista.push({
      chave: 'mob-supressao',
      rotulo: 'Supressão de grupos pequenos',
      valor: supressao.definido ? `${supressao.valor} pessoas` : NAO_DEFINIDO,
      definido: supressao.definido,
      observacao: null,
      escopo: 'mobilidade',
    })

    const geo = texto(env.geocodeProvedor)
    lista.push({
      chave: 'mob-geocodificacao',
      rotulo: 'Geocodificação',
      ...geo,
      observacao: 'O endereço é descartado e nunca gravado.',
      escopo: 'mobilidade',
    })

    const modo = texto(env.mobilidadeDistanciaModo)
    const rotas = texto(env.rotasProvedor)
    lista.push({
      chave: 'mob-distancia',
      rotulo: 'Distância do deslocamento',
      valor:
        modo.definido && rotas.definido ? `${modo.valor} (${rotas.valor})` : modo.valor,
      definido: modo.definido,
      observacao: null,
      escopo: 'mobilidade',
    })

    lista.push({
      chave: 'mob-deslocamentos-dia',
      rotulo: 'Deslocamentos por dia útil',
      valor: '2 (ida e volta)',
      definido: true,
      observacao: null,
      escopo: 'mobilidade',
    })

    const dias =
      diasUteisNaCarga !== null
        ? { valor: String(diasUteisNaCarga), definido: true }
        : texto(opcional('MOBILIDADE_DIAS_UTEIS_MES') ?? null)
    lista.push({
      chave: 'mob-dias-uteis',
      rotulo: 'Dias úteis por mês',
      ...dias,
      observacao: diasUteisNaCarga !== null ? null : 'Nenhum registro carregado.',
      escopo: 'mobilidade',
    })

    lista.push({
      chave: 'mob-ocupacao',
      rotulo: 'Ocupação de carro e moto',
      valor: '1 ocupante por veículo',
      definido: true,
      observacao: null,
      escopo: 'mobilidade',
    })

    lista.push({
      chave: 'mob-onibus',
      rotulo: 'Ônibus',
      valor: 'fator por passageiro-km',
      definido: true,
      observacao: null,
      escopo: 'mobilidade',
    })

    lista.push({
      chave: 'mob-zero',
      rotulo: 'Bicicleta e a pé',
      valor: 'emissão zero',
      definido: true,
      observacao: null,
      escopo: 'mobilidade',
    })

    lista.push({
      chave: 'mob-serie-mensal',
      rotulo: 'Valor anual na série mensal',
      valor: 'repetido nos doze meses',
      definido: true,
      observacao: null,
      escopo: 'mobilidade',
    })

    const limite = texto(env.mobilidadeDistanciaMaximaKm)
    lista.push({
      chave: 'mob-distancia-maxima',
      rotulo: 'Distância máxima aceita',
      valor: limite.definido ? `${limite.valor} km` : NAO_DEFINIDO,
      definido: limite.definido,
      observacao: 'Acima disso, exceção fora da média.',
      escopo: 'mobilidade',
    })
  }

  if (visiveis.includes('viagens')) {
    const anoBase = texto(env.viagensAnoBase)
    lista.push({
      chave: 'via-ano-base',
      rotulo: 'Ano-base do inventário de viagens',
      ...anoBase,
      observacao: 'Pelo ano do voo, não pelo da passagem.',
      escopo: 'viagens',
    })

    lista.push({
      chave: 'via-classe',
      rotulo: 'Classe da cabine',
      valor: 'econômica, assumida',
      definido: true,
      observacao: null,
      escopo: 'viagens',
    })

    lista.push({
      chave: 'via-unidade',
      rotulo: 'Unidade de cálculo do aéreo',
      valor: 'o trecho, não a reserva',
      definido: true,
      observacao: null,
      escopo: 'viagens',
    })

    // **Onde a distância nasce muda conforme a fonte, e as duas convivem neste
    // módulo.** A versão anterior desta declaração dizia que o acréscimo é
    // aplicado "no formulário" — herança da premissa que a §0.1 apagou. O
    // formulário não é fonte daqui; quem calcula a distância do zero é a
    // planilha do cartão, que a frase não mencionava. A tela declarava um
    // caminho que o módulo não tem e omitia o que ele tem.
    lista.push({
      chave: 'via-uplift',
      rotulo: 'Acréscimo sobre a distância ortodrômica',
      valor: '8%',
      definido: true,
      observacao: 'Já embutido na base da agência.',
      escopo: 'viagens',
    })

    // As duas declarações abaixo são da §7, que exige que o que a planilha do
    // cartão muda no número fique nesta tela. Uma delas muda a série mensal.
    lista.push({
      chave: 'via-data-cartao',
      rotulo: 'Data dos trechos da planilha do cartão',
      valor: 'a da primeira linha, herdada pelo bloco',
      definido: true,
      observacao: 'Muda a série mensal, não o total do ano.',
      escopo: 'viagens',
    })

    lista.push({
      chave: 'via-viajante-cartao',
      rotulo: 'Viajante da planilha do cartão',
      valor: 'só o primeiro nome, vinculado ao cadastro',
      definido: true,
      observacao: 'Sem correspondência, a carga para.',
      escopo: 'viagens',
    })

    lista.push({
      chave: 'via-agrupamento',
      rotulo: 'Agrupamento no tempo',
      valor: 'data do voo',
      definido: true,
      observacao: null,
      escopo: 'viagens',
    })

    lista.push({
      chave: 'via-fatores',
      rotulo: 'Fatores aéreos',
      valor: 'por faixa de distância, com forçamento radiativo',
      definido: true,
      observacao: null,
      escopo: 'viagens',
    })
  }

  if (visiveis.includes('maritimo')) {
    lista.push({
      chave: 'mar-alocacao',
      rotulo: 'Alocação do CO₂',
      valor: 'por contêiner, por corredor',
      definido: true,
      observacao: 'O valor do agente não é recalculado.',
      escopo: 'maritimo',
    })

    // **A base de data é constante no código, e a tela lê a constante.**
    // Reintroduzir a variável de ambiente daria duas fontes para a mesma
    // decisão, e é assim que uma delas envelhece sem a outra — foi o defeito
    // que esta linha tinha: perguntava ao ambiente uma variável já removida e
    // declararia "não definida" justamente a escolha que mais muda o número do
    // módulo. O rótulo legível mora aqui porque é apresentação; a decisão mora
    // na constante.
    lista.push({
      chave: 'mar-base-de-data',
      rotulo: 'Base de data do embarque',
      valor: BASE_DE_DATA_POR_EXTENSO[env.maritimoBaseDeData],
      definido: true,
      observacao: null,
      escopo: 'maritimo',
    })

    // Os dois limiares da §8.1.1 são regras opostas, e ficam em linhas
    // separadas de propósito: confundi-los erra nos dois sentidos — ou um
    // número impossível entra e domina o total, ou emissão verdadeira é apagada
    // por ser incomum.
    const atipico = texto(env.maritimoLimiarAtipico)
    const amostra = texto(env.maritimoAmostraMinimaCorredor)
    lista.push({
      chave: 'mar-atipica',
      rotulo: 'Linha atípica — entra com alerta',
      valor: atipico.definido
        ? `${atipico.valor}× a mediana do corredor` +
          (amostra.definido ? `, com amostra mínima de ${amostra.valor} linhas` : '')
        : NAO_DEFINIDO,
      definido: atipico.definido,
      observacao: null,
      escopo: 'maritimo',
    })

    const impossivel = texto(env.maritimoLimiarImpossivel)
    lista.push({
      chave: 'mar-impossivel',
      rotulo: 'Linha impossível — não é importada',
      valor: impossivel.definido ? `${impossivel.valor}× a mediana geral do módulo` : NAO_DEFINIDO,
      definido: impossivel.definido,
      observacao: null,
      escopo: 'maritimo',
    })

    lista.push({
      chave: 'mar-previsao',
      rotulo: 'Embarque previsto',
      valor: 'fora do total, contado à parte',
      definido: true,
      observacao: null,
      escopo: 'maritimo',
    })

    lista.push({
      chave: 'mar-aereo',
      rotulo: 'Frete aéreo de fornecedor',
      valor: 'no total do módulo, fora do indicador por contêiner',
      definido: true,
      observacao: null,
      escopo: 'maritimo',
    })

    lista.push({
      chave: 'mar-periodo',
      rotulo: 'Período relatado',
      valor: 'série contínua, sem ano-base',
      definido: true,
      observacao: null,
      escopo: 'maritimo',
    })
  }

  if (visiveis.includes('transportadoras')) {
    lista.push({
      chave: 'tra-alocacao',
      rotulo: 'Alocação do CO₂',
      valor: 'por tonelada-quilômetro',
      definido: true,
      observacao: 'Peso da entrega vezes a distância, com fator médio de carga.',
      escopo: 'transportadoras',
    })

    lista.push({
      chave: 'tra-distancia',
      rotulo: 'Distância',
      valor: 'trecho único filial → cliente',
      definido: true,
      observacao: 'Sem ida e volta: a origem não registra o retorno.',
      escopo: 'transportadoras',
    })

    lista.push({
      chave: 'tra-frota',
      rotulo: 'Veículo',
      valor: 'média da frota de carga, assumida',
      definido: true,
      observacao: 'O relatório não diz o veículo nem a transportadora.',
      escopo: 'transportadoras',
    })

    // **O limiar decide o que não é importado** (§9.3), como os dois do
    // marítimo — e por isso é parâmetro declarado, não constante escondida.
    const limiar = texto(env.transportadorasDistanciaMaximaKm)
    lista.push({
      chave: 'tra-internacional',
      rotulo: 'Linha internacional — não é importada',
      valor: limiar.definido ? `acima de ${limiar.valor} km` : NAO_DEFINIDO,
      definido: limiar.definido,
      observacao: 'São embarques do módulo marítimo, não entrega rodoviária.',
      escopo: 'transportadoras',
    })

    /**
     * **CIF e FOB convivem, e a origem não separa os dois** (§9.1). A parcela de
     * frete pago pela empresa é cat. 4 e a paga pelo cliente é cat. 9 — mesmo
     * escopo, categorias diferentes —, e o relatório de entregas não traz a
     * modalidade por linha. Declarar aqui é o que separa "misto, não separável na
     * fonte" de "ninguém olhou": a segunda é a que faria alguém refazer o
     * levantamento que já foi feito.
     */
    lista.push({
      chave: 'tra-regime-frete',
      rotulo: 'Regime de frete',
      valor: 'CIF e FOB, não separados na origem',
      definido: true,
      observacao:
        'A parcela CIF é cat. 4 e a FOB é cat. 9; as duas entram somadas neste total.',
      escopo: 'transportadoras',
    })

    lista.push({
      chave: 'tra-periodo',
      rotulo: 'Período relatado',
      valor: 'ano civil da entrega',
      definido: true,
      observacao: null,
      escopo: 'transportadoras',
    })
  }

  return lista
}

/**
 * Tudo que a tela de método precisa, já filtrado pelo que o perfil pode ver.
 *
 * `importacao` enxerga só o marítimo (§5): recebe o método do marítimo e os
 * parâmetros gerais, e não fica sabendo de exceção de mobilidade.
 */
export async function consultarMetodo(
  ctx: ContextoDeAcesso,
  filtros: { anoBase?: number; ano?: number; modulo?: Modulo } = {},
  db: Firestore = firestore(),
): Promise<Metodo> {
  exigirInventario(ctx)

  /**
   * **O recorte por módulo não é otimização, é o formato novo do método.**
   *
   * Cada tela de módulo pede o método do próprio módulo e o mostra nos botões
   * de informações dos painéis dela (§10). Sem o recorte, abrir a tela do
   * marítimo leria as coleções de mobilidade e de viagens para jogar fora — e
   * ler o que não se vai usar é como um recorte errado começa a existir.
   *
   * A autorização continua por cima: pedir um módulo que o perfil não vê
   * devolve o método vazio, porque `podeVerModulo` continua mandando.
   */
  const visiveis = modulosVisiveis(ctx).filter(
    (m) => filtros.modulo === undefined || m === filtros.modulo,
  )
  const pedido = (modulo: Modulo) =>
    podeVerModulo(ctx, modulo) &&
    (filtros.modulo === undefined || filtros.modulo === modulo)
  const fontes: FonteDeclarada[] = []
  const qualidade: QualidadeDoModulo[] = []
  const excecoes: ExcecaoDeclarada[] = []
  const alertas: AlertaDeclarado[] = []
  const regioesInferidas: RegiaoInferida[] = []
  let diasUteisNaCarga: number | null = null

  /**
   * Conta **documentos afetados** por tipo de alerta, não ocorrências: é a
   * pergunta que alguém realmente faz ao abrir esta tela. A descrição gravada
   * fica no banco e não sai daqui.
   */
  const contarAlertas = (
    modulo: Modulo,
    docs: { alertas: { tipo: string; severidade: Severidade }[] }[],
  ): void => {
    const contagem = new Map<string, AlertaDeclarado>()
    for (const doc of docs) {
      const jaContados = new Set<string>()
      for (const a of doc.alertas) {
        const chave = `${a.tipo}|${a.severidade}`
        if (jaContados.has(chave)) continue
        jaContados.add(chave)
        const atual = contagem.get(chave)
        if (atual) atual.ocorrencias += 1
        else
          contagem.set(chave, {
            modulo,
            tipo: a.tipo,
            severidade: a.severidade,
            ocorrencias: 1,
            // A regra, escrita no código; nunca a descrição gravada, que cita
            // valor da linha e atravessaria a anonimização por porta lateral.
            motivo: MOTIVO_DO_ALERTA[a.tipo] ?? MOTIVO_NAO_DECLARADO,
          })
      }
    }
    alertas.push(...contagem.values())
  }

  if (pedido('mobilidade')) {
    const anoBase =
      filtros.anoBase ?? Number(opcional('MOBILIDADE_ANO_BASE') ?? Number.NaN)
    const consulta = Number.isFinite(anoBase)
      ? db.collection(COLECAO.mobilidade).where('anoBase', '==', anoBase)
      : db.collection(COLECAO.mobilidade)
    const registros = (await consulta.get()).docs.map(
      (d) => d.data() as DocMobilidade,
    )

    const emExcecao = registros.filter((r) => r.excecao)
    diasUteisNaCarga = registros[0]?.diasUteisMes ?? null

    fontes.push({
      modulo: 'mobilidade',
      descricao: 'Pesquisa de mobilidade respondida pelo quadro de funcionários.',
      situacao: Number.isFinite(anoBase)
        ? `Ano-base ${anoBase}. Carga única por ano.`
        : 'Ano-base não configurado no ambiente.',
    })

    qualidade.push({
      modulo: 'mobilidade',
      registros: registros.length,
      itens: [
        { rotulo: 'Respostas carregadas', valor: String(registros.length) },
        {
          rotulo: 'Fora da média, como exceção',
          valor: `${emExcecao.length} (${porcentagem(emExcecao.length, registros.length)})`,
        },
        { rotulo: 'Na média', valor: String(registros.length - emExcecao.length) },
      ],
    })

    const porMotivo = new Map<string, number>()
    for (const r of emExcecao) {
      const motivo = r.motivoExcecao ?? 'não informado'
      porMotivo.set(motivo, (porMotivo.get(motivo) ?? 0) + 1)
    }
    for (const [motivo, quantos] of porMotivo) {
      excecoes.push({ modulo: 'mobilidade', motivo, registros: quantos })
    }

    contarAlertas('mobilidade', registros)
  }

  if (pedido('viagens')) {
    const trechos = (await db.collection(COLECAO.viagemTrecho).get()).docs.map(
      (d) => d.data() as DocViagemTrecho,
    )
    const contabilizaveis = trechos.filter((t) => t.contabilizar)
    // **Contado por fonte, não deduzido por subtração.** A versão anterior
    // calculava o formulário como "tudo menos a agência", o que embutia a
    // premissa de que só existiam duas fontes — e no dia em que entrou a
    // terceira, os trechos dela apareceram nesta tela como se fossem do
    // formulário. Premissa de fonte única se esconde bem numa subtração.
    const porFonte = new Map<string, number>()
    for (const t of contabilizaveis) {
      porFonte.set(t.fonte, (porFonte.get(t.fonte) ?? 0) + 1)
    }

    fontes.push({
      modulo: 'viagens',
      descricao:
        'Relatório da agência de viagens e planilha do cartão empresarial.',
      situacao: 'Carga única e imutável. O programa de viagens não entra aqui.',
    })

    qualidade.push({
      modulo: 'viagens',
      registros: trechos.length,
      itens: [
        { rotulo: 'Trechos carregados', valor: String(trechos.length) },
        {
          rotulo: 'Fora do total, como reserva duplicada',
          valor: String(trechos.length - contabilizaveis.length),
        },
        ...[...porFonte.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([fonte, quantos]) => ({
            rotulo: `Trechos vindos de: ${NOME_DA_FONTE[fonte] ?? fonte}`,
            valor: String(quantos),
          })),
        {
          rotulo: 'Trechos sem fator carimbado',
          valor: String(contabilizaveis.filter((t) => t.fator === null).length),
        },
      ],
    })

    contarAlertas('viagens', trechos)

    // A região do aeroporto agrupa o mapa em corredor. Onde ela veio da
    // coordenada, e não do `uf`, a classificação é inferência — e inferência
    // que muda um desenho precisa estar onde alguém possa conferir.
    for (const doc of (await db.collection(COLECAO.aeroporto).get()).docs) {
      const a = doc.data() as DocAeroporto
      if (a.regiaoCriterio !== 'coordenada' && a.regiaoCriterio !== 'indefinida') continue
      regioesInferidas.push({
        iata: a.iata,
        nome: a.nome,
        regiao: a.regiao ?? 'Região indefinida',
      })
    }
  }

  if (pedido('maritimo')) {
    // **O resumo lê o mesmo recorte que a tela desenha.** Sem o ano aqui, "o
    // que entrou" contaria embarque de período que a tela não mostra, e o
    // lastro passaria a descrever um número que não é o da tela — que é a
    // forma silenciosa de o resumo deixar de servir para conferir.
    let consulta: Query = db.collection(COLECAO.embarque)
    if (filtros.ano !== undefined) consulta = consulta.where('ano', '==', filtros.ano)
    const todos = (await consulta.get()).docs.map((d) => d.data() as DocEmbarque)
    // **A cascata é medida sobre o que está no total**, e previsão está fora
    // dele. Medir os dois juntos diria que parte do número vem de dado do
    // agente para um número que não é o número do módulo.
    const previstos = todos.filter((e) => e.previsao)
    const embarques = todos.filter((e) => !e.previsao)
    const co2Total = embarques.reduce((s, e) => s + e.co2Kg, 0)

    // **Um agente que não entrega detalhe não está aqui, nem como estimativa.**
    // A cascata da §8.2 estima o que falta *dentro* de um embarque; ela não
    // inventa o embarque. Quantos agentes o inventário tem é fato do banco;
    // quantos ficaram de fora é fato do arquivo, e quem responde isso é a
    // conferência de cobertura — a tela diz onde procurar em vez de fingir que
    // sabe.
    const agentes = new Set(embarques.map((e) => e.agente)).size
    const blocos = new Set(embarques.map((e) => e.bloco)).size

    fontes.push({
      modulo: 'maritimo',
      descricao: 'Relatório do agente de carga, um documento por embarque.',
      situacao:
        embarques.length === 0
          ? 'Módulo ainda não carregado. O painel consolidado segue parcial até ele existir.'
          : `${agentes === 1 ? 'Um agente' : `${agentes} agentes`}, ${blocos === 1 ? 'um bloco' : `${blocos} blocos`}. Agente sem detalhe por embarque não está no inventário.`,
    })

    const porNivel = new Map<NivelDado, { embarques: number; co2Kg: number }>()
    for (const e of embarques) {
      const atual = porNivel.get(e.nivelDado) ?? { embarques: 0, co2Kg: 0 }
      atual.embarques += 1
      atual.co2Kg += e.co2Kg
      porNivel.set(e.nivelDado, atual)
    }

    qualidade.push({
      modulo: 'maritimo',
      registros: embarques.length,
      itens: [
        { rotulo: 'Embarques no total', valor: String(embarques.length) },
        // **A cascata inteira, degrau a degrau** (§8.2). O rodapé do módulo diz
        // quanto do número veio do agente; aqui está de onde veio o resto —
        // "estimativa" sozinho não diz se a média era do corredor ou geral, e a
        // diferença entre as duas é a que decide se o número é específico
        // daquela rota ou uma média do módulo inteiro.
        ...NIVEL_DA_CASCATA.map(({ nivel, rotulo }) => {
          const v = porNivel.get(nivel) ?? { embarques: 0, co2Kg: 0 }
          return {
            rotulo,
            valor: `${porcentagem(v.co2Kg, co2Total)} · ${v.embarques}`,
          }
        }),
        {
          rotulo: 'Previstos, fora do total',
          valor: String(previstos.length),
        },
      ],
    })

    // Previsão sai do total e **não sai da lista de alertas**: ela existe no
    // banco, e uma tela que a contasse em lugar nenhum esconderia justamente o
    // que a decisão de excluí-la produziu.
    contarAlertas('maritimo', todos)
  }

  if (pedido('transportadoras')) {
    /**
     * **Este é o único módulo cujo "o que entrou" não sai daqui, e a razão é de
     * custo medido.**
     *
     * A coleção de entregas é uma ordem de grandeza maior que as outras três, e
     * a tela já leu a dela para desenhar o número. Lê-la de novo aqui seria
     * ler a coleção inteira duas vezes para responder à mesma
     * pergunta — e ler o que não se vai usar é como um recorte errado começa a
     * existir. A contagem do resumo vem do próprio agregado da tela, que é a
     * mesma leitura: os dois números não podem divergir porque são um só.
     *
     * **A carga deste módulo não emite alerta** — o que ela não entende, ela
     * recusa com motivo, e a recusa é contada na conferência de cobertura em vez
     * de virar aviso no documento (§9.3). É isso que permite não ler a coleção
     * aqui, e é fato preso por teste: no dia em que a carga passar a emitir
     * alerta, este bloco precisa voltar a lê-la.
     */
    fontes.push({
      modulo: 'transportadoras',
      descricao:
        'Relatório de entregas por filial, um documento por entrega, sem identificação da transportadora.',
      situacao:
        'Carga por ano civil. Linha internacional e linha sem cliente ficam fora, declaradas na conferência de cobertura.',
    })
  }

  const hoje = hojeIso()
  const fatores = (await db.collection(COLECAO.fatorEmissao).get()).docs
    .map((d) => d.data() as DocFatorEmissao)
    .map((f) => ({
      ...f,
      vigenteHoje:
        f.vigenciaInicio <= hoje && (f.vigenciaFim === null || f.vigenciaFim >= hoje),
    }))
    .sort(
      (a, b) =>
        a.categoria.localeCompare(b.categoria) ||
        a.chave.localeCompare(b.chave) ||
        a.vigenciaInicio.localeCompare(b.vigenciaInicio),
    )

  return {
    geradoEm: hoje,
    modulos: visiveis,
    fontes,
    parametros: parametros(visiveis, diasUteisNaCarga),
    fatores,
    qualidade,
    excecoes: excecoes.sort((a, b) => b.registros - a.registros),
    alertas: alertas.sort(
      (a, b) => b.ocorrencias - a.ocorrencias || a.tipo.localeCompare(b.tipo),
    ),
    regioesInferidas: regioesInferidas.sort((a, b) => a.iata.localeCompare(b.iata)),
  }
}

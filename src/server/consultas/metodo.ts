/**
 * Tela de método — CLAUDE.md §10.5 e a lista mínima da §10.
 *
 * É aqui que **cada escolha que muda o número fica registrada**. Um inventário
 * não é só o total: é o total mais as decisões que o produziram. Provedor de
 * rota, classe de cabine assumida, ocupação por veículo e base de data não são
 * detalhe de infraestrutura — trocar qualquer um deles muda o resultado, e sem
 * este registro a mudança fica invisível.
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
import type { Firestore } from 'firebase-admin/firestore'

import { opcional, parametrosDeclarados } from '@/lib/env'
import type {
  DocAeroporto,
  DocEmbarque,
  DocFatorEmissao,
  DocMobilidade,
  DocViagemTrecho,
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
 * Nome de cada fonte de viagem, para a tela.
 *
 * Uma fonte que não esteja aqui aparece pelo próprio código, em vez de ser
 * somada a outra: fonte desconhecida tem que ficar visível, não se diluir.
 */
const NOME_DA_FONTE: Record<string, string> = {
  agencia: 'relatório da agência',
  cartao: 'planilha do cartão',
  formulario: 'formulário do viajante',
}

/** O que a tela escreve onde a decisão ainda não foi tomada. */
export const NAO_DEFINIDO = 'não definida'

export type EscopoDoParametro = 'geral' | Modulo

export type ParametroDeclarado = {
  rotulo: string
  valor: string
  /** Falso quando a decisão está pendente; a tela marca, não deixa em branco. */
  definido: boolean
  observacao: string
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

  const corte = texto(env.corteFonteViagens)
  lista.push({
    rotulo: 'Data de corte entre agência e formulário',
    ...corte,
    observacao: corte.definido
      ? 'O corte é pela data do voo ou da viagem, não pela data de preenchimento. Na série mensal, a troca de fonte é marcada neste mês.'
      : 'A decisão ainda não foi tomada: depende do anúncio do programa aos colaboradores, não do código. Enquanto isso, a carga da base histórica exige o valor para rodar.',
    escopo: 'geral',
  })

  const supressao = texto(opcional('MOBILIDADE_SUPRESSAO_MINIMA') ?? null)
  lista.push({
    rotulo: 'Supressão de grupos pequenos',
    valor: supressao.definido ? `${supressao.valor} pessoas` : NAO_DEFINIDO,
    definido: supressao.definido,
    observacao:
      'Recorte com menos pessoas que isso não é exibido: vira "outros". A contagem é de pessoas, não de registros — dez viagens de uma pessoa continuam identificando essa pessoa.',
    escopo: 'geral',
  })

  if (visiveis.includes('mobilidade')) {
    const geo = texto(env.geocodeProvedor)
    lista.push({
      rotulo: 'Geocodificação',
      ...geo,
      observacao:
        'A distância é medida a partir do CEP; o endereço é descartado depois do cálculo e nunca é gravado. Provedor de precisão municipal devolve a mesma coordenada para CEPs diferentes e invalida o módulo. Este é o valor configurado hoje: o documento de emissão carimba o fator, não o provedor.',
      escopo: 'mobilidade',
    })

    const modo = texto(env.mobilidadeDistanciaModo)
    const rotas = texto(env.rotasProvedor)
    lista.push({
      rotulo: 'Distância do deslocamento',
      valor:
        modo.definido && rotas.definido ? `${modo.valor} (${rotas.valor})` : modo.valor,
      definido: modo.definido,
      observacao:
        'Distância rodoviária e distância ortodrômica dão números diferentes, e a diferença não se corrige com fator fixo. Trocar de provedor muda o número do inventário.',
      escopo: 'mobilidade',
    })

    lista.push({
      rotulo: 'Deslocamentos por dia útil',
      valor: '2 (ida e volta)',
      definido: true,
      observacao:
        'Cada dia útil conta duas vezes a distância entre residência e fábrica.',
      escopo: 'mobilidade',
    })

    const dias =
      diasUteisNaCarga !== null
        ? { valor: String(diasUteisNaCarga), definido: true }
        : texto(opcional('MOBILIDADE_DIAS_UTEIS_MES') ?? null)
    lista.push({
      rotulo: 'Dias úteis por mês',
      ...dias,
      observacao:
        diasUteisNaCarga !== null
          ? 'Valor efetivamente usado nos registros carregados, lido do próprio documento.'
          : 'Nenhum registro carregado; este é o valor configurado no ambiente.',
      escopo: 'mobilidade',
    })

    lista.push({
      rotulo: 'Ocupação de carro e moto',
      valor: '1 ocupante por veículo',
      definido: true,
      observacao:
        'A pesquisa não pergunta carona. A emissão do deslocamento é atribuída inteira a quem respondeu.',
      escopo: 'mobilidade',
    })

    lista.push({
      rotulo: 'Ônibus',
      valor: 'fator por passageiro-km',
      definido: true,
      observacao:
        'O fator do transporte público já é por passageiro e não depende do combustível. Combustível preenchido nessa resposta é erro de entrada e vira alerta, sem tirar a linha da média.',
      escopo: 'mobilidade',
    })

    lista.push({
      rotulo: 'Bicicleta e a pé',
      valor: 'emissão zero',
      definido: true,
      observacao: 'Emissão zero por definição, sem fator: não é fator faltando.',
      escopo: 'mobilidade',
    })

    lista.push({
      rotulo: 'Valor anual na série mensal',
      valor: 'repetido nos doze meses',
      definido: true,
      observacao:
        'A pesquisa é anual e o resultado é uma taxa mensal do ano-base. Por isso a mobilidade entra no total do ano e não na série mensal da visão geral: somada ali, apareceria como se tivesse acontecido doze vezes num mês só.',
      escopo: 'mobilidade',
    })

    const limite = texto(env.mobilidadeDistanciaMaximaKm)
    lista.push({
      rotulo: 'Distância máxima aceita',
      valor: limite.definido ? `${limite.valor} km` : NAO_DEFINIDO,
      definido: limite.definido,
      observacao:
        'Acima disso o deslocamento não se sustenta como diário: a resposta vira exceção, fica fora da média e aparece na lista de exceções. O limite não protege contra origem errada — ele só transforma o erro em exceção.',
      escopo: 'mobilidade',
    })
  }

  if (visiveis.includes('viagens')) {
    lista.push({
      rotulo: 'Classe da cabine',
      valor: 'econômica, assumida',
      definido: true,
      observacao:
        'O relatório da agência não informa a cabine. Econômica é assumida em todos os trechos da base histórica, e o multiplicador correspondente fica gravado em cada trecho.',
      escopo: 'viagens',
    })

    lista.push({
      rotulo: 'Unidade de cálculo do aéreo',
      valor: 'o trecho, não a reserva',
      definido: true,
      observacao:
        'Cada trecho é um passageiro. Escala conta como trecho separado e emite mais que um voo direto equivalente.',
      escopo: 'viagens',
    })

    lista.push({
      rotulo: 'Acréscimo sobre a distância ortodrômica',
      valor: '8%',
      definido: true,
      observacao:
        'Na base histórica o acréscimo já vem embutido na distância e não é reaplicado. No formulário, onde a distância é calculada do zero, ele é aplicado.',
      escopo: 'viagens',
    })

    lista.push({
      rotulo: 'Agrupamento no tempo',
      valor: 'data do voo',
      definido: true,
      observacao:
        'Nunca a data de lançamento da passagem: há passagem emitida num ano com voo no ano seguinte.',
      escopo: 'viagens',
    })

    lista.push({
      rotulo: 'Fatores aéreos',
      valor: 'por faixa de distância, com forçamento radiativo',
      definido: true,
      observacao:
        'Quem aprovou a passagem não entra na conta: para emissão vale quem viajou. Reserva marcada como duplicada fica gravada e fora do total.',
      escopo: 'viagens',
    })
  }

  if (visiveis.includes('maritimo')) {
    lista.push({
      rotulo: 'Alocação do CO₂',
      valor: 'por contêiner, por corredor',
      definido: true,
      observacao:
        'O valor informado pelo agente é o dado primário e não é recalculado por tonelada-quilômetro: na mesma rota o CO₂ por quilo varia muito, enquanto o CO₂ por contêiner é estável.',
      escopo: 'maritimo',
    })

    const baseDeData = texto(opcional('MARITIMO_BASE_DE_DATA') ?? null)
    lista.push({
      rotulo: 'Base de data do embarque',
      ...baseDeData,
      observacao:
        'A aba de detalhe e a de resumo do relatório usam bases de data diferentes; o inventário escolhe uma e aplica em todo o sistema. O módulo ainda não foi carregado.',
      escopo: 'maritimo',
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
  filtros: { anoBase?: number } = {},
  db: Firestore = firestore(),
): Promise<Metodo> {
  exigirInventario(ctx)

  const visiveis = modulosVisiveis(ctx)
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
          })
      }
    }
    alertas.push(...contagem.values())
  }

  if (podeVerModulo(ctx, 'mobilidade')) {
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
        ? `Ano-base ${anoBase}. Carga única por ano; recarregar substitui o ano inteiro.`
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

  if (podeVerModulo(ctx, 'viagens')) {
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
        'Até a data de corte, relatório da agência de viagens. A partir dela, formulário preenchido por quem viajou.',
      situacao:
        'O histórico da agência é carga única e imutável. A série mensal marca a troca de fonte no mês da data de corte.',
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

  if (podeVerModulo(ctx, 'maritimo')) {
    const embarques = (await db.collection(COLECAO.embarque).get()).docs.map(
      (d) => d.data() as DocEmbarque,
    )
    const co2Total = embarques.reduce((s, e) => s + e.co2Kg, 0)
    const co2Medido = embarques
      .filter((e) => e.nivelDado === 'medido')
      .reduce((s, e) => s + e.co2Kg, 0)

    fontes.push({
      modulo: 'maritimo',
      descricao: 'Relatório do agente de carga, por embarque.',
      situacao:
        embarques.length === 0
          ? 'Módulo ainda não carregado. O painel consolidado segue parcial até ele existir.'
          : 'Nem todo agente entrega detalhe linha a linha; o que falta é estimado por média de corredor.',
    })

    qualidade.push({
      modulo: 'maritimo',
      registros: embarques.length,
      itens: [
        { rotulo: 'Embarques carregados', valor: String(embarques.length) },
        {
          rotulo: 'Do número, vindo de dado do agente',
          valor: porcentagem(co2Medido, co2Total),
        },
        {
          rotulo: 'Embarques previstos, ainda não realizados',
          valor: String(embarques.filter((e) => e.previsao).length),
        },
      ],
    })

    contarAlertas('maritimo', embarques)
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

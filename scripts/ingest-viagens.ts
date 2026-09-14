/**
 * Carga da base histórica de viagens aéreas — CLAUDE.md §7.1 e §7.2.
 *
 * Regras seguidas aqui, todas verificáveis por scripts/verificar.ts:
 *  - a unidade de cálculo é o TRECHO, não a reserva; cada trecho é um passageiro;
 *  - `distancia_km` da base já inclui o uplift de 8%: não aplicar de novo;
 *  - reservas com `contabilizar: false` ficam gravadas mas fora do inventário;
 *  - o inventário agrupa pela data do voo, nunca pela data de lançamento;
 *  - quem conta para a emissão é quem viajou, não quem aprovou a passagem;
 *  - o fator vem da coleção `fatorEmissao`; sem fator vigente, a carga falha.
 *
 * Um documento por trecho (§9.6): os trechos da mesma reserva ficam ligados pelo
 * `reservaId`. Os alertas são fatos da reserva e são copiados para cada trecho
 * dela, porque é no trecho que a consulta por código de alerta vai procurar.
 *
 * Os nomes dos passageiros são carregados para ligar a viagem ao funcionário e
 * não aparecem em nenhuma tela do inventário (§3.1).
 *
 * Uso:
 *   npm run ingest:viagens -- [caminho/do/base_viagens.json]
 *
 * Reexecutar é seguro: a carga regrava tudo que veio da agência e depois remove
 * o que sobrou do carregamento anterior, sem encostar no que veio do formulário.
 */
import { emissaoTrechoAereo, type FaixaDistancia } from '../src/lib/calculo/aereo'
import {
  CATEGORIA_AEREO_CLASSE,
  CATEGORIA_AEREO_FAIXA,
} from '../src/lib/calculo/categorias'
import { corteFonteViagens } from '../src/lib/env'
import {
  idAeroporto,
  idFuncionario,
  idViagemTrecho,
} from '../src/server/documentos/ids'
import {
  anoDe,
  hojeIso,
  mesDe,
  montarAlertas,
  type Alerta,
  type DocAeroporto,
  type DocFuncionario,
  type DocViagemTrecho,
  type Severidade,
} from '../src/server/documentos/tipos'
import { validarViagemTrecho } from '../src/server/documentos/validacao'
import { gravarCadastro, recarregarEscopo } from '../src/server/escrita'
import { carregarFatores } from '../src/server/fatores'
import { COLECAO } from '../src/server/firestore'
import {
  caminhoDaBase,
  conectarFirestore,
  ehEntrada,
  executar,
  lerJson,
  n,
  tituloDaEtapa,
} from './_comum'

type Aeroporto = {
  iata: string
  nome: string
  cidade: string
  uf: string
  utc_offset: number
  latitude: number
  longitude: number
}

type Pessoa = { id: string; nome: string }

type Trecho = {
  ordem: number
  origem: string
  destino: string
  companhia: string | null
  voo: string | null
  data_voo: string
  distancia_km: number
  faixa_distancia: FaixaDistancia
  passageiros: number
}

type Reserva = {
  id: string
  data_lancamento: string
  pax_id: string
  contabilizar: boolean
  viagem: { data_ida: string; data_volta: string | null }
  trechos: Trecho[]
  alertas: { tipo: string; descricao: string }[]
}

type BaseViagens = {
  fatores_emissao: { classe_assumida: string }
  aeroportos: Record<string, Aeroporto>
  pessoas: Record<string, Pessoa>
  reservas: Reserva[]
}

/** Viagem aérea a negócios é Escopo 3, categoria 6. */
const ESCOPO_VIAGEM_AEREA = 3

const FONTE = 'agencia' as const

/** Gravidade por tipo de alerta; o que não estiver aqui é "atenção". */
const SEVERIDADE: Record<string, Severidade> = {
  troca_de_aeroporto: 'informativo',
  fora_do_inventario: 'informativo',
  trecho_nao_aereo: 'atencao',
  possivel_duplicidade: 'atencao',
  fora_do_periodo_da_agencia: 'atencao',
}

function severidadeDe(tipo: string): Severidade {
  return SEVERIDADE[tipo] ?? 'atencao'
}

function argumentoPosicional(): string | undefined {
  return process.argv.slice(2).find((a) => !a.startsWith('--'))
}

async function principal(): Promise<void> {
  const caminho = caminhoDaBase(
    argumentoPosicional(),
    'BASE_VIAGENS_PATH',
    'dados/base_viagens.json',
  )
  const corte = corteFonteViagens()
  const base = lerJson<BaseViagens>(caminho)
  const classeAssumida = base.fatores_emissao?.classe_assumida
  if (!classeAssumida) {
    throw new Error('A base não declara a classe assumida no bloco `fatores_emissao`.')
  }

  const { db, encerrar } = conectarFirestore()

  try {
    /* ---------------------------------------------------------- aeroportos */
    tituloDaEtapa('Aeroportos')
    const aeroportos = Object.values(base.aeroportos).map((a) => ({
      id: idAeroporto(a.iata),
      dados: {
        iata: a.iata,
        nome: a.nome,
        cidade: a.cidade ?? null,
        uf: a.uf ?? null,
        utcOffset: a.utc_offset ?? null,
        latitude: a.latitude ?? null,
        longitude: a.longitude ?? null,
      } satisfies DocAeroporto,
    }))
    await gravarCadastro(COLECAO.aeroporto, aeroportos, db)
    console.log(`  ${aeroportos.length} aeroportos gravados.`)

    /* -------------------------------------------------------- funcionários */
    tituloDaEtapa('Funcionários')
    const idPorChaveOrigem = new Map<string, string>()
    const funcionarios = Object.values(base.pessoas).map((pessoa) => {
      const id = idFuncionario({ chaveOrigem: pessoa.id })
      idPorChaveOrigem.set(pessoa.id, id)
      return {
        id,
        dados: {
          matricula: null,
          nome: pessoa.nome,
          email: null,
          departamento: null,
          ativo: true,
          chaveOrigem: pessoa.id,
        } satisfies DocFuncionario,
      }
    })
    await gravarCadastro(COLECAO.funcionario, funcionarios, db)
    console.log(
      `  ${funcionarios.length} funcionários vinculados (nomes não vão para tela de inventário).`,
    )

    /* ------------------------------------------------------------- fatores */
    const fatores = await carregarFatores(db)
    if (fatores.total === 0) {
      throw new Error(
        'A coleção fatorEmissao está vazia. Rode npm run seed:fatores antes da carga.',
      )
    }

    /* -------------------------------------------------------- cálculo */
    tituloDaEtapa('Cálculo dos trechos')
    const atualizadoEm = hojeIso()
    const documentos: { id: string; dados: DocViagemTrecho }[] = []

    let trechosContabilizaveis = 0
    let distanciaContabilizavel = 0
    let emissaoContabilizavel = 0
    const foraDoPeriodo = new Set<string>()

    for (const reserva of base.reservas) {
      // Alertas são da reserva e acompanham cada trecho dela.
      const alertasDaReserva: Alerta[] = reserva.alertas.map((a) => ({
        tipo: a.tipo,
        descricao: a.descricao,
        severidade: severidadeDe(a.tipo),
      }))
      if (!reserva.contabilizar) {
        alertasDaReserva.push({
          tipo: 'fora_do_inventario',
          descricao: 'itinerário duplicado no relatório da agência; não entra no total',
          severidade: severidadeDe('fora_do_inventario'),
        })
      }
      if (reserva.trechos.some((t) => t.data_voo >= corte)) {
        foraDoPeriodo.add(reserva.id)
        alertasDaReserva.push({
          tipo: 'fora_do_periodo_da_agencia',
          descricao: `voo em ${corte} ou depois, período em que a fonte oficial é o formulário`,
          severidade: severidadeDe('fora_do_periodo_da_agencia'),
        })
      }

      const funcionarioId = idPorChaveOrigem.get(reserva.pax_id)
      if (!funcionarioId) {
        throw new Error(
          `Reserva ${reserva.id} aponta para um passageiro que não está na lista de pessoas da base.`,
        )
      }

      for (const trecho of reserva.trechos) {
        // A distância da base já vem com o uplift; entra na conta como está.
        const faixa = fatores.vigente(
          CATEGORIA_AEREO_FAIXA,
          trecho.faixa_distancia,
          trecho.data_voo,
        )
        const classe = fatores.vigente(
          CATEGORIA_AEREO_CLASSE,
          classeAssumida,
          trecho.data_voo,
        )
        const co2Kg = emissaoTrechoAereo({
          distanciaKm: trecho.distancia_km,
          fatorKgPorPassageiroKm: faixa.valor,
          multiplicadorClasse: classe.valor,
          passageiros: trecho.passageiros,
        })

        const id = idViagemTrecho(FONTE, reserva.id, trecho.ordem)
        const dados: DocViagemTrecho = {
          modulo: 'viagens',
          modal: 'aereo',
          escopo: ESCOPO_VIAGEM_AEREA,
          periodicidade: 'evento',
          // Mês e ano saem da data do voo, nunca da data de lançamento (§7.2).
          ano: anoDe(trecho.data_voo),
          mes: mesDe(trecho.data_voo),
          empresa: null,
          fator: faixa,
          ...montarAlertas(alertasDaReserva),
          atualizadoEm,
          reservaId: reserva.id,
          ordem: trecho.ordem,
          funcionarioId,
          criadoPorUid: null,
          tipo: 'aereo',
          fonte: FONTE,
          contabilizar: reserva.contabilizar,
          dataIda: reserva.viagem.data_ida,
          dataVolta: reserva.viagem.data_volta ?? null,
          origem: trecho.origem,
          destino: trecho.destino,
          companhia: trecho.companhia ?? null,
          voo: trecho.voo ?? null,
          dataVoo: trecho.data_voo,
          distanciaKm: trecho.distancia_km,
          faixaDistancia: trecho.faixa_distancia,
          passageiros: trecho.passageiros,
          co2Kg,
          classeCabine: classeAssumida,
          multiplicadorClasse: classe.valor,
          propriedadeVeiculo: null,
          combustivel: null,
          ocupantes: null,
        }

        validarViagemTrecho(id, dados)
        documentos.push({ id, dados })

        if (reserva.contabilizar) {
          trechosContabilizaveis++
          distanciaContabilizavel += trecho.distancia_km
          emissaoContabilizavel += co2Kg
        }
      }
    }

    const contabilizaveis = base.reservas.filter((r) => r.contabilizar).length
    console.log(`  ${base.reservas.length} reservas lidas, ${contabilizaveis} contabilizáveis.`)
    console.log(
      `  ${trechosContabilizaveis} trechos contabilizáveis, ` +
        `${n(distanciaContabilizavel)} km, ${n(emissaoContabilizavel)} kg CO₂e.`,
    )
    if (foraDoPeriodo.size > 0) {
      console.log(
        `  atenção: ${foraDoPeriodo.size} reservas têm voo em ${corte} ou depois, ` +
          'período em que a fonte oficial passa a ser o formulário (§7).',
      )
    }

    /* ---------------------------------------------------------- gravação */
    tituloDaEtapa('Gravação')
    const resultado = await recarregarEscopo({
      colecao: COLECAO.viagemTrecho,
      // O escopo protege o que veio do formulário: a recarga do histórico não
      // enxerga, e portanto não apaga, documento de outra fonte.
      escopo: [{ campo: 'fonte', valor: FONTE }],
      documentos,
      db,
    })
    console.log(
      `  ${resultado.gravados} trechos gravados, ` +
        `${resultado.removidos} obsoletos removidos da carga anterior.`,
    )

    console.log(
      `\nClasse assumida em todos os trechos: ${classeAssumida} — declarar na tela de método.`,
    )
    console.log('Confira a carga com: npm run verificar')
  } finally {
    await encerrar()
  }
}

if (ehEntrada(import.meta.url)) void executar('ingest-viagens', principal)

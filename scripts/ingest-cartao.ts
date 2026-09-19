/**
 * Carga das viagens do cartão empresarial — CLAUDE.md §7.
 *
 * **Terceira fonte**, ao lado da agência e do formulário: viagem paga no cartão
 * não passa pela agência e por isso não está na base histórica. A recarga usa o
 * escopo `fonte = cartao`, então regravar esta planilha não enxerga nem apaga o
 * que veio das outras duas.
 *
 * Diferenças em relação à carga da agência, e todas mudam o número:
 *
 *  - **a distância é calculada aqui**, pela ortodrômica entre os aeroportos,
 *    com o uplift de 8% aplicado (§7.2). Na base da agência ela já vinha pronta
 *    e com o uplift embutido;
 *  - **a data vale para o bloco inteiro.** A planilha traz data só na primeira
 *    linha de cada viagem, e os demais trechos herdam. Para o total do ano não
 *    muda nada; para a série mensal, um trecho de volta pode cair no mês
 *    seguinte e ser contado no anterior;
 *  - **classe econômica é assumida**, como no histórico da agência.
 *
 * Sem `--gravar` o script **não escreve nada**: imprime o que faria. A planilha
 * é digitada à mão, e conferir a reconstrução antes de gravar é mais barato que
 * descobrir depois que uma linha virou a rota errada.
 *
 * Uso:
 *   npx tsx scripts/ingest-cartao.ts [caminho.xlsx]
 *   npx tsx scripts/ingest-cartao.ts [caminho.xlsx] --gravar
 */
import 'dotenv/config'
import { existsSync } from 'node:fs'

import ExcelJS from 'exceljs'

import { aplicarUplift, emissaoTrechoAereo, faixaPorDistancia } from '../src/lib/calculo/aereo'
import {
  CATEGORIA_AEREO_CLASSE,
  CATEGORIA_AEREO_FAIXA,
  CATEGORIA_AEREO_UPLIFT,
} from '../src/lib/calculo/categorias'
import { lerCartao, type LinhaDoCartao, type TrechoDoCartao } from '../src/lib/cartao'
import { distanciaOrtodromicaKm } from '../src/lib/geo/distancia'
import { chaveNormalizada } from '../src/lib/texto'
import { idFuncionario, idViagemTrecho } from '../src/server/documentos/ids'
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
import { anoBaseViagens } from '../src/lib/env'
import { apagarIds, recarregarEscopo } from '../src/server/escrita'
import { carregarFatores, limitesDeFaixa } from '../src/server/fatores'
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

const FONTE = 'cartao' as const
const ESCOPO_VIAGEM_AEREA = 3
const CLASSE_ASSUMIDA = 'economica'
const PASSAGEIROS_POR_TRECHO = 1

/**
 * Severidade de cada aviso da leitura.
 *
 * Nenhum deles impede o cálculo — todos são "confira", não "não dá". O que
 * impede vira linha descartada, e linha descartada não vira documento.
 */
function severidadeDe(tipo: string): Severidade {
  return tipo === 'bloco_com_mais_de_um_nome' || tipo === 'sequencia_de_trechos_quebrada'
    ? 'atencao'
    : 'informativo'
}

/** Lê a planilha para linhas, preservando a linha em branco que separa blocos. */
export async function lerPlanilha(caminho: string): Promise<LinhaDoCartao[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(caminho)
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('A planilha não tem nenhuma aba.')

  // O cabeçalho é localizado pelo conteúdo, nunca por índice fixo (§8.3).
  let cabecalho = 0
  for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
    const textos = (ws.getRow(r).values as unknown[]).filter(
      (v) => typeof v === 'string' && v.trim() !== '',
    )
    if (textos.length >= 3) {
      cabecalho = r
      break
    }
  }
  if (cabecalho === 0) {
    throw new Error('Não encontrei a linha de cabeçalho da planilha.')
  }

  const linhas: LinhaDoCartao[] = []
  for (let r = cabecalho + 1; r <= ws.rowCount; r++) {
    const linha = ws.getRow(r)
    const usuario = String(linha.getCell(1).text ?? '').trim()
    const bruto = linha.getCell(2).value
    const rota = String(linha.getCell(3).text ?? '').trim()

    const vazia = usuario === '' && rota === '' && !(bruto instanceof Date)
    linhas.push({
      usuario,
      // A data vem como `Date` do Excel; o que o sistema guarda é string
      // `AAAA-MM-DD`, sempre (§9.1). A conversão usa as partes em UTC porque é
      // assim que o Excel entrega meia-noite.
      data:
        bruto instanceof Date
          ? `${bruto.getUTCFullYear()}-${String(bruto.getUTCMonth() + 1).padStart(2, '0')}-${String(bruto.getUTCDate()).padStart(2, '0')}`
          : null,
      rota,
      vazia,
    })
  }
  return linhas
}

/**
 * Os limites das faixas moram em `src/server/fatores.ts`, e não mais aqui.
 *
 * Eles são lidos da coleção de fatores, nunca de número no código (§7.2), e o
 * formulário do programa de viagens precisa exatamente da mesma leitura: é a
 * matemática compartilhada da §7.5. Duas cópias da mesma função é uma que
 * envelhece sem a outra.
 */

async function principal(): Promise<void> {
  const argumentos = process.argv.slice(2)
  const gravar = argumentos.includes('--gravar')
  const caminho = caminhoDaBase(
    argumentos.find((a) => !a.startsWith('--')),
    'BASE_CARTAO_PATH',
    'dados/cartao-viagens.xlsx',
  )

  const caminhoDoMapa = caminhoDaBase(
    undefined,
    'BASE_CARTAO_VIAJANTES_PATH',
    'dados/cartao-viajantes.json',
  )

  tituloDaEtapa(gravar ? 'Viagens do cartão' : 'Viagens do cartão (simulação)')

  const linhas = await lerPlanilha(caminho)
  const { trechos, descartadas } = lerCartao(linhas)
  console.log(`  ${linhas.length} linhas lidas, ${trechos.length} trechos reconstruídos.`)

  if (descartadas.length > 0) {
    console.log(`  ${descartadas.length} linha(s) descartada(s):`)
    for (const d of descartadas) {
      console.log(`    linha ${d.linha}: ${d.motivo}`)
    }
  }
  if (trechos.length === 0) {
    throw new Error('Nenhum trecho reconstruído; a carga seria vazia e é recusada.')
  }

  const { db, encerrar } = conectarFirestore()
  try {
    const fatores = await carregarFatores(db)

    const aeroportos = new Map<string, DocAeroporto>()
    for (const doc of (await db.collection(COLECAO.aeroporto).get()).docs) {
      const a = doc.data() as DocAeroporto
      aeroportos.set(a.iata, a)
    }

    const faltando = new Set<string>()
    for (const t of trechos) {
      for (const iata of [t.origem, t.destino]) {
        const a = aeroportos.get(iata)
        if (!a || a.latitude === null || a.longitude === null) faltando.add(iata)
      }
    }
    if (faltando.size > 0) {
      throw new Error(
        `Sem coordenada para: ${[...faltando].sort().join(', ')}.\n` +
          '  Cadastre com: npx tsx scripts/seed-aeroportos.ts ' +
          `${[...faltando].sort().join(' ')} --gravar`,
      )
    }

    // **O viajante e vinculado ao cadastro, nunca criado por esta carga.**
    // A planilha traz so o primeiro nome, que nao identifica ninguem sozinho:
    // "Ana" casa com qualquer Ana do cadastro. A ponte e um mapa de apelido
    // para nome completo, que mora fora do repositorio porque nome real nao se
    // versiona. Sem o mapa, ou com um nome que nao exista no cadastro, a carga
    // **para e diz quem falta** - criar pessoa a partir de planilha e como uma
    // linha de companhia aerea vira funcionario.
    const mapa: Record<string, string> = existsSync(caminhoDoMapa)
      ? lerJson<Record<string, string>>(caminhoDoMapa)
      : {}
    const nomeCompleto = new Map<string, string>()
    for (const [apelido, completo] of Object.entries(mapa)) {
      nomeCompleto.set(chaveNormalizada(apelido), completo)
    }

    const porNome = new Map<string, string>()
    for (const doc of (await db.collection(COLECAO.funcionario).get()).docs) {
      porNome.set(chaveNormalizada((doc.data() as DocFuncionario).nome), doc.id)
    }

    const idPorUsuario = new Map<string, string>()
    const semVinculo: string[] = []
    for (const t of trechos) {
      const chave = chaveNormalizada(t.usuario)
      if (idPorUsuario.has(chave)) continue

      const completo = nomeCompleto.get(chave) ?? t.usuario
      const existente = porNome.get(chaveNormalizada(completo))
      if (existente === undefined) {
        semVinculo.push(t.usuario)
        continue
      }
      idPorUsuario.set(chave, existente)
    }

    if (semVinculo.length > 0) {
      throw new Error(
        `Viajante sem correspondencia no cadastro: ${semVinculo.join(', ')}.
` +
          `  Acrescente o nome completo em ${caminhoDoMapa} e confira se a pessoa ` +
          'existe na colecao de funcionarios. Esta carga nao cria pessoa.',
      )
    }

    const uplift = fatores.vigente(CATEGORIA_AEREO_UPLIFT, 'gcd', trechos[0].data)

    const anoBase = anoBaseViagens()
    const documentos: { id: string; dados: DocViagemTrecho }[] = []
    let distanciaTotal = 0
    let foraDoAnoBase = 0
    let emissaoTotal = 0

    for (const t of trechos) {
      const origem = aeroportos.get(t.origem)!
      const destino = aeroportos.get(t.destino)!

      const ortodromica = distanciaOrtodromicaKm(
        { latitude: origem.latitude!, longitude: origem.longitude! },
        { latitude: destino.latitude!, longitude: destino.longitude! },
      )
      // Mesmo recorte de ano da outra fonte administrativa (§7): o trecho entra
      // pelo ano do voo, e o de outro ano é do relatório daquele ano.
      if (anoDe(t.data) !== anoBase) {
        foraDoAnoBase += 1
        continue
      }

      // Aqui o uplift PRECISA ser aplicado: a distância foi calculada do zero.
      const distanciaKm = aplicarUplift(ortodromica, uplift.valor)

      const faixa = faixaPorDistancia(distanciaKm, limitesDeFaixa(fatores, t.data))
      const fator = fatores.vigente(CATEGORIA_AEREO_FAIXA, faixa, t.data)
      const classe = fatores.vigente(CATEGORIA_AEREO_CLASSE, CLASSE_ASSUMIDA, t.data)
      const co2Kg = emissaoTrechoAereo({
        distanciaKm,
        fatorKgPorPassageiroKm: fator.valor,
        multiplicadorClasse: classe.valor,
        passageiros: PASSAGEIROS_POR_TRECHO,
      })

      const funcionarioId = idPorUsuario.get(chaveNormalizada(t.usuario))!
      const alertas: Alerta[] = t.alertas.map((a) => ({
        tipo: a.tipo,
        descricao: a.descricao,
        severidade: severidadeDe(a.tipo),
      }))

      const reservaId = `${FONTE}-${t.data}-${t.bloco}`
      const id = idViagemTrecho(FONTE, `${t.data}_${t.bloco}`, t.ordem)

      const dados: DocViagemTrecho = {
        modulo: 'viagens',
        modal: 'aereo',
        escopo: ESCOPO_VIAGEM_AEREA,
        periodicidade: 'evento',
        ano: anoDe(t.data),
        mes: mesDe(t.data),
        empresa: null,
        fator,
        ...montarAlertas(alertas),
        atualizadoEm: hojeIso(),
        reservaId,
        ordem: t.ordem,
        funcionarioId,
        tipo: 'aereo',
        fonte: FONTE,
        contabilizar: true,
        dataIda: t.data,
        dataVolta: null,
        origem: t.origem,
        destino: t.destino,
        companhia: t.companhia,
        voo: null,
        dataVoo: t.data,
        distanciaKm,
        faixaDistancia: faixa,
        passageiros: PASSAGEIROS_POR_TRECHO,
        co2Kg,
        classeCabine: CLASSE_ASSUMIDA,
        multiplicadorClasse: classe.valor,
        propriedadeVeiculo: null,
        combustivel: null,
        ocupantes: null,
      }

      validarViagemTrecho(id, dados)
      documentos.push({ id, dados })
      distanciaTotal += distanciaKm
      emissaoTotal += co2Kg
    }

    const viagens = new Set(documentos.map((d) => d.dados.reservaId)).size
    console.log(
      `  ${viagens} viagens, ${documentos.length} trechos, ` +
        `${n(distanciaTotal)} km, ${n(emissaoTotal)} kg CO₂e.`,
    )
    console.log(`  ${idPorUsuario.size} viajante(s), todos vinculados ao cadastro.`)
    if (foraDoAnoBase > 0) {
      console.log(
        `  ${foraDoAnoBase} trecho(s) com data fora de ${anoBase} não foram carregados: ` +
          'pertencem ao relatório de outro ano (§7).',
      )
    }

    console.log('\n  reconstrução, trecho a trecho:')
    for (const { dados } of documentos) {
      const marcas = dados.alertasCodigos.length > 0 ? ` [${dados.alertasCodigos.join(', ')}]` : ''
      console.log(
        `    ${dados.mes} ${dados.origem}->${dados.destino} ` +
          `${n(dados.distanciaKm, 0).padStart(6)} km  ${n(dados.co2Kg, 0).padStart(6)} kg${marcas}`,
      )
    }

    if (!gravar) {
      console.log('\n  Simulação: nada foi gravado. Confira acima e rode de novo com --gravar.')
      return
    }

    const resultado = await recarregarEscopo({
      colecao: COLECAO.viagemTrecho,
      escopo: [
        { campo: 'fonte', valor: FONTE },
        { campo: 'ano', valor: anoBase },
      ],
      documentos,
      db,
    })
    console.log(
      `\n  Gravados ${resultado.gravados} trechos; ${resultado.removidos} obsoletos removidos.`,
    )

    // Cargas anteriores criavam pessoa a partir da planilha, e a leitura antiga
    // chegou a transformar linha de companhia aérea em funcionário. A varredura
    // acontece **depois** da gravação, e só remove o que não é mais apontado por
    // trecho nenhum — mesma ordem da recarga, pelo mesmo motivo (§9.9).
    const orfaos: string[] = []
    for (const doc of (await db.collection(COLECAO.funcionario).get()).docs) {
      const f = doc.data() as DocFuncionario
      if (!(f.chaveOrigem ?? '').startsWith(`${FONTE}:`)) continue
      const usos = (
        await db
          .collection(COLECAO.viagemTrecho)
          .where('funcionarioId', '==', doc.id)
          .select()
          .get()
      ).size
      if (usos === 0) orfaos.push(doc.id)
    }
    if (orfaos.length > 0) {
      await apagarIds(COLECAO.funcionario, orfaos, db)
      console.log(
        `  ${orfaos.length} registro(s) de pessoa criados por carga anterior desta fonte ` +
          'foram removidos: nenhum trecho aponta mais para eles.',
      )
    }
  } finally {
    await encerrar()
  }
}

if (ehEntrada(import.meta.url)) {
  void executar('ingest-cartao', principal)
}

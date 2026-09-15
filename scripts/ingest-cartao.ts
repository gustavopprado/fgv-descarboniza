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
import ExcelJS from 'exceljs'

import { aplicarUplift, emissaoTrechoAereo, faixaPorDistancia } from '../src/lib/calculo/aereo'
import type { LimiteDeFaixa } from '../src/lib/calculo/aereo'
import {
  CATEGORIA_AEREO_CLASSE,
  CATEGORIA_AEREO_FAIXA,
  CATEGORIA_AEREO_FAIXA_LIMITE,
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
import { gravarCadastro, recarregarEscopo } from '../src/server/escrita'
import { carregarFatores } from '../src/server/fatores'
import { COLECAO } from '../src/server/firestore'
import { caminhoDaBase, conectarFirestore, ehEntrada, executar, n, tituloDaEtapa } from './_comum'

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

type Resolvedor = Awaited<ReturnType<typeof carregarFatores>>

/**
 * Os limites das faixas, lidos da coleção de fatores — nunca de número no
 * código (§7.2).
 *
 * A faixa mais longa **não tem limite superior gravado**, e isso é de propósito:
 * a ausência é o que significa "daqui para cima". Por isso a leitura do máximo
 * tolera o fator ausente, enquanto a do mínimo não.
 */
function limitesDeFaixa(fatores: Resolvedor, data: string): LimiteDeFaixa[] {
  return (['curta', 'media', 'longa'] as const).map((id) => {
    const minimo = fatores.vigente(CATEGORIA_AEREO_FAIXA_LIMITE, `${id}.min_km`, data)
    let maxKm: number | null = null
    try {
      maxKm = fatores.vigente(CATEGORIA_AEREO_FAIXA_LIMITE, `${id}.max_km`, data).valor
    } catch {
      maxKm = null
    }
    return { id, minKm: minimo.valor, maxKm }
  })
}

async function principal(): Promise<void> {
  const argumentos = process.argv.slice(2)
  const gravar = argumentos.includes('--gravar')
  const caminho = caminhoDaBase(
    argumentos.find((a) => !a.startsWith('--')),
    'BASE_CARTAO_PATH',
    'dados/cartao-viagens.xlsx',
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

    // O viajante da planilha vem só com o nome. Quando ele não casa com o
    // cadastro, entra como pessoa própria desta fonte — e o trecho carrega o
    // alerta. Fundir por nome parcial juntaria gente diferente, e a contagem de
    // pessoas distintas é o que sustenta a supressão (§3.1).
    const porNome = new Map<string, string>()
    for (const doc of (await db.collection(COLECAO.funcionario).get()).docs) {
      porNome.set(chaveNormalizada((doc.data() as DocFuncionario).nome), doc.id)
    }

    const funcionariosNovos: { id: string; dados: DocFuncionario }[] = []
    const idPorUsuario = new Map<string, { id: string; vinculado: boolean }>()
    for (const t of trechos) {
      const chave = chaveNormalizada(t.usuario)
      if (idPorUsuario.has(chave)) continue

      // Nome de uma palavra só não identifica ninguém: "Ana" casa com qualquer
      // Ana do cadastro, e vincular errado atribui a viagem à pessoa errada e
      // estraga a contagem de pessoas distintas que sustenta a supressão
      // (§3.1). Vale a mesma regra da mobilidade: homônimo não é fundido.
      const tokens = chave.split(/\s+/).filter((t) => t !== '')
      const existente = tokens.length >= 2 ? porNome.get(chave) : undefined
      if (existente !== undefined) {
        idPorUsuario.set(chave, { id: existente, vinculado: true })
        continue
      }
      const id = idFuncionario({ chaveOrigem: `${FONTE}:${chave}` })
      idPorUsuario.set(chave, { id, vinculado: false })
      funcionariosNovos.push({
        id,
        dados: {
          matricula: null,
          nome: t.usuario,
          email: null,
          departamento: null,
          ativo: true,
          chaveOrigem: `${FONTE}:${chave}`,
        },
      })
    }

    // A chave do uplift é a mesma que o seed grava a partir do arquivo da base.
    const uplift = fatores.vigente(CATEGORIA_AEREO_UPLIFT, 'gcd', trechos[0].data)

    const documentos: { id: string; dados: DocViagemTrecho }[] = []
    let distanciaTotal = 0
    let emissaoTotal = 0

    for (const t of trechos) {
      const origem = aeroportos.get(t.origem)!
      const destino = aeroportos.get(t.destino)!

      const ortodromica = distanciaOrtodromicaKm(
        { latitude: origem.latitude!, longitude: origem.longitude! },
        { latitude: destino.latitude!, longitude: destino.longitude! },
      )
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

      const pessoa = idPorUsuario.get(chaveNormalizada(t.usuario))!
      const alertas: Alerta[] = t.alertas.map((a) => ({
        tipo: a.tipo,
        descricao: a.descricao,
        severidade: severidadeDe(a.tipo),
      }))
      if (!pessoa.vinculado) {
        alertas.push({
          tipo: 'viajante_fora_do_cadastro',
          descricao:
            'o nome da planilha não casa com o cadastro; a pessoa entrou como registro próprio desta fonte',
          severidade: 'atencao',
        })
      }

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
        funcionarioId: pessoa.id,
        criadoPorUid: null,
        tipo: 'aereo',
        fonte: FONTE,
        contabilizar: true,
        dataIda: t.data,
        dataVolta: null,
        origem: t.origem,
        destino: t.destino,
        companhia: null,
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
    console.log(`  ${funcionariosNovos.length} viajante(s) sem correspondência no cadastro.`)

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

    if (funcionariosNovos.length > 0) {
      await gravarCadastro(COLECAO.funcionario, funcionariosNovos, db)
    }
    const resultado = await recarregarEscopo({
      colecao: COLECAO.viagemTrecho,
      escopo: [{ campo: 'fonte', valor: FONTE }],
      documentos,
      db,
    })
    console.log(
      `\n  Gravados ${resultado.gravados} trechos; ${resultado.removidos} obsoletos removidos.`,
    )
  } finally {
    await encerrar()
  }
}

if (ehEntrada(import.meta.url)) {
  void executar('ingest-cartao', principal)
}

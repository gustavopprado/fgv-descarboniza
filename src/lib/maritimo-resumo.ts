/**
 * Tabela de contêineres por porto da aba de resumo — CLAUDE.md §8.1, §8.2, §8.4.
 *
 * **Esta aba é quase toda proibida, e uma parte dela não é.** A §8.1 manda não
 * reproduzir a metodologia do resumo, e o motivo é aritmético: lá o CO₂ de um
 * agente sai do indicador dos outros, o peso de um é resíduo de subtração dos
 * demais, e o peso total vem da contagem multiplicada por uma constante por
 * contêiner — a conta devolve o que alguém pôs nela. Nada disso entra.
 *
 * **A contagem de contêineres por porto e por mês é outra coisa: ela é
 * contada.** Não sai de divisão nenhuma, não depende de constante, e é o único
 * lugar do arquivo que diz quantos contêineres a operação de fato movimentou no
 * período — inclusive os dos agentes que não entregam detalhe linha a linha.
 * É ela, e só ela, que este módulo lê.
 *
 * **A base de data é outra, e isso não é detalhe.** O detalhe linha a linha usa
 * a partida; esta tabela usa o registro de DI, que acontece depois da chegada.
 * A consequência é que a parcela estimada cai no mês em que a carga foi
 * registrada e a medida no mês em que partiu — declarado no método do módulo,
 * nunca resolvido por um deslocamento inventado.
 *
 * O módulo é **puro** e decide tudo por forma: rótulo de coluna, presença dos
 * doze meses, fechamento da própria soma. **Nenhum nome de porto, de agente ou
 * de empresa aparece aqui** (§2.2) — quem liga o rótulo da tabela ao cadastro de
 * portos é o script de carga, por um mapa que mora fora do repositório.
 */

import { chave, numeroOuNulo, textoOuNulo, type AbaLida, type CelulaBruta } from './planilha'

/** Rótulo da coluna que abre a tabela de portos. */
const COLUNA_PORTO = 'PORTO'

/** Rótulo da coluna de total por porto, usada como conferência da própria linha. */
const COLUNA_TOTAL = 'TOTAL CNTR'

/** Rótulo do total consolidado do período, no bloco abaixo da tabela. */
const LINHA_TOTAL_DO_PERIODO = 'TOTAL CONTAINER'

/**
 * Os doze meses, na grafia do relatório.
 *
 * É rótulo de coluna, não dado: mesma natureza de `SHIPMENT ID` ou `WEIGHT` no
 * leitor de detalhe. Exigir os doze é o que impede ler meio ano como ano cheio —
 * uma tabela truncada devolveria um total menor sem nada quebrar.
 */
const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']

export type LinhaDePorto = {
  /** O rótulo como a planilha o traz. Não é LOCODE: quem resolve isso é a carga. */
  rotulo: string
  /** Contagem de cada mês, de janeiro a dezembro. Sempre doze posições. */
  meses: number[]
  total: number
}

export type TabelaDePortos = {
  aba: string
  linhaDoCabecalho: number
  ano: number
  portos: LinhaDePorto[]
  /** Soma das linhas de porto. */
  total: number
  /** O total que o próprio arquivo declara, no bloco do período. */
  totalDeclarado: number
}

export class ResumoIlegivel extends Error {}

function falhar(motivo: string): never {
  throw new ResumoIlegivel(motivo)
}

/**
 * Localiza a linha de cabeçalho da tabela **pelo conteúdo, nunca por índice
 * fixo** (§8.3) — ela divide a aba com outras tabelas montadas à mão e anda de
 * lugar a cada edição.
 *
 * Exige `PORTO` **e os doze meses na mesma linha**. Só o rótulo de porto não
 * basta, pela mesma razão que o identificador sozinho não bastava no leitor de
 * detalhe: a palavra aparece em mais de um lugar da aba.
 */
function localizar(linhas: CelulaBruta[][]): { linha: number; colunaDoRotulo: number } | null {
  for (let r = 0; r < linhas.length; r++) {
    const celulas = (linhas[r] ?? []).map(chave)
    const colunaDoRotulo = celulas.indexOf(COLUNA_PORTO)
    if (colunaDoRotulo < 0) continue
    if (MESES.every((m) => celulas.includes(m))) return { linha: r, colunaDoRotulo }
  }
  return null
}

/** Índice de cada mês na linha de cabeçalho, na ordem de janeiro a dezembro. */
function colunasDosMeses(cabecalho: CelulaBruta[]): number[] {
  const celulas = cabecalho.map(chave)
  return MESES.map((mes) => {
    const coluna = celulas.indexOf(mes)
    if (coluna < 0) falhar(`a tabela de portos não tem a coluna de ${mes}`)
    return coluna
  })
}

/**
 * O ano do período, lido do bloco consolidado que fica abaixo da tabela.
 *
 * **Ele é conferido contra o ano-base pela carga, e é essa conferência que
 * importa**: um arquivo de outro período aplicado ao ano-base carregaria a
 * contagem errada sem nada parecer quebrado — a família de defeito que este
 * projeto já pagou mais de uma vez.
 */
function lerBlocoDoPeriodo(linhas: CelulaBruta[][]): { ano: number; total: number } {
  for (let r = 0; r < linhas.length; r++) {
    const celulas = linhas[r] ?? []
    const coluna = celulas.map(chave).indexOf(LINHA_TOTAL_DO_PERIODO)
    if (coluna < 0) continue

    /**
     * **O valor é a célula imediatamente à direita do rótulo, nunca o primeiro
     * número que aparecer na linha.** O mesmo rótulo existe duas vezes na aba:
     * como cabeçalho horizontal de uma tabela, onde a célula seguinte é outro
     * rótulo, e como rótulo vertical do bloco do período, onde a célula seguinte
     * é o total. Procurar o primeiro número à direita casaria com o cabeçalho e
     * traria um número de outra tabela — plausível, e de outra coisa.
     */
    const total = numeroOuNulo(celulas[coluna + 1] ?? null)
    if (total === null) continue

    // O ano fica na linha imediatamente acima, que rotula o bloco. Procurar
    // acima, e não na aba inteira, é o que impede pegar um número de quatro
    // dígitos que por acaso caia na faixa de ano.
    for (let acima = r - 1; acima >= 0 && acima >= r - 3; acima--) {
      const ano = (linhas[acima] ?? [])
        .map(numeroOuNulo)
        .find((v): v is number => v !== null && Number.isInteger(v) && v >= 2000 && v <= 2100)
      if (ano !== undefined) return { ano, total }
    }
    falhar('o bloco do período não declara o ano acima do total')
  }
  falhar(`a aba de resumo não tem a linha de ${LINHA_TOTAL_DO_PERIODO}`)
}

/**
 * Lê a tabela de portos. Devolve `null` quando a aba de resumo não existe —
 * ausência de aba é ausência de fonte, e quem decide o que fazer com isso é a
 * carga.
 *
 * Tudo que a tabela tem e o leitor não entende **falha alto**, nomeando o que
 * encontrou: uma coluna a mais deslocando os meses, uma linha de porto que não
 * fecha com o próprio total, a soma das linhas discordando do total declarado.
 * São exatamente os erros que produziriam um número plausível e errado.
 */
export function lerTabelaDePortos(abas: AbaLida[]): TabelaDePortos | null {
  for (const aba of abas) {
    const cabecalho = localizar(aba.linhas)
    if (cabecalho === null) continue

    const meses = colunasDosMeses(aba.linhas[cabecalho.linha] ?? [])
    const colunaDoTotal = (aba.linhas[cabecalho.linha] ?? []).map(chave).indexOf(COLUNA_TOTAL)

    const portos: LinhaDePorto[] = []
    for (let r = cabecalho.linha + 1; r < aba.linhas.length; r++) {
      const linha = aba.linhas[r] ?? []
      const rotulo = textoOuNulo(linha[cabecalho.colunaDoRotulo] ?? null)

      // A tabela termina na linha de totais, que é a única sem rótulo de porto.
      // Parar aqui, e não no fim da aba, é o que impede engolir o bloco seguinte.
      if (rotulo === null) break

      const contagens = meses.map((c) => numeroOuNulo(linha[c] ?? null) ?? 0)
      if (contagens.some((v) => v < 0 || !Number.isInteger(v))) {
        falhar(`a linha ${r + 1} da tabela de portos tem contagem que não é inteiro não negativo`)
      }
      const soma = contagens.reduce((a, b) => a + b, 0)

      // A coluna de total é redundante com a soma dos meses — e é por ser
      // redundante que ela confere: as duas só discordam se a leitura pegou a
      // coluna errada.
      if (colunaDoTotal >= 0) {
        const declarado = numeroOuNulo(linha[colunaDoTotal] ?? null)
        if (declarado !== null && declarado !== soma) {
          falhar(
            `a linha ${r + 1} da tabela de portos soma ${soma} nos doze meses e ` +
              `declara ${declarado} no total — a leitura pegou a coluna errada`,
          )
        }
      }

      portos.push({ rotulo, meses: contagens, total: soma })
    }

    if (portos.length === 0) falhar('a tabela de portos não tem nenhuma linha de porto')

    const total = portos.reduce((s, p) => s + p.total, 0)
    const periodo = lerBlocoDoPeriodo(aba.linhas)
    if (periodo.total !== total) {
      falhar(
        `a tabela de portos soma ${total} contêineres e o arquivo declara ` +
          `${periodo.total} no total do período`,
      )
    }

    return {
      aba: aba.nome.trim(),
      linhaDoCabecalho: cabecalho.linha + 1,
      ano: periodo.ano,
      portos,
      total,
      totalDeclarado: periodo.total,
    }
  }
  return null
}

/* ------------------------------------------------------------------ resíduo */

export type ResiduoDePorto = {
  rotulo: string
  /** Contêineres que o detalhe linha a linha não cobre, por mês. */
  meses: number[]
  total: number
}

/**
 * Reparte o resíduo de um porto pelos doze meses, **em inteiro**.
 *
 * O resíduo é anual de propósito: subtrair mês a mês seria subtrair duas bases
 * de data diferentes célula a célula, e o resultado fica negativo em alguns
 * meses só pela defasagem entre partida e registro. Anual, a defasagem se fecha
 * dentro do próprio ano.
 *
 * A repartição segue a forma mensal que a tabela tem para aquele porto — é
 * informação de verdade sobre quando a carga chegou, e distribuir por igual
 * jogaria fora. O sobra-e-resto garante que a soma das doze parcelas seja
 * exatamente o resíduo: contêiner é unidade inteira, e arredondar cada mês
 * separado faria o ano não fechar.
 */
export function repartirPorMes(residuo: number, forma: number[]): number[] {
  if (residuo <= 0) return forma.map(() => 0)
  const base = forma.reduce((a, b) => a + b, 0)
  if (base <= 0) return forma.map(() => 0)

  const exatos = forma.map((v) => (residuo * v) / base)
  const parcelas = exatos.map(Math.floor)
  let restante = residuo - parcelas.reduce((a, b) => a + b, 0)

  const ordem = exatos
    .map((v, i) => ({ i, fracao: v - Math.floor(v) }))
    .sort((a, b) => b.fracao - a.fracao || a.i - b.i)
  for (const { i } of ordem) {
    if (restante <= 0) break
    parcelas[i] += 1
    restante -= 1
  }
  return parcelas
}

/**
 * O que a tabela tem e o detalhe não cobre, porto a porto.
 *
 * `medidoPorRotulo` é a contagem que o detalhe linha a linha já traz para aquele
 * porto, no mesmo período. **Resíduo negativo é recusado, nomeando o porto**: o
 * detalhe trazendo mais contêineres do que a tabela inteira não é defasagem de
 * data, é a tabela descrevendo outro período — e estimar em cima disso produziria
 * um número que fecha e não significa nada.
 */
export function calcularResiduo(
  tabela: TabelaDePortos,
  medidoPorRotulo: Map<string, number>,
): ResiduoDePorto[] {
  return tabela.portos.map((porto) => {
    const medido = medidoPorRotulo.get(porto.rotulo) ?? 0
    const total = porto.total - medido
    if (total < 0) {
      falhar(
        `o detalhe traz ${medido} contêiner(es) para um porto que a tabela de ` +
          `resumo declara com ${porto.total} no ano — a tabela não cobre o mesmo período`,
      )
    }
    return { rotulo: porto.rotulo, meses: repartirPorMes(total, porto.meses), total }
  })
}

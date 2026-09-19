/**
 * Leitura da lista oficial UN/LOCODE — CLAUDE.md §8, §10.4.
 *
 * **Por que a base oficial e não geocodificação.** O relatório do agente traz o
 * nome do lugar como texto livre — há nome de aeroporto, nome composto com
 * barra e nome entre parênteses —, e geocodificar texto assim põe um porto no
 * lugar errado sem nenhum erro aparecer. O mesmo relatório traz, ao lado, o
 * **código UN/LOCODE** de embarque e de desembarque, que é identificador e não
 * texto. A lista oficial resolve esse código em coordenada.
 *
 * E resolve mais uma coisa, que a geocodificação não daria: o **classificador
 * de função**, que diz se aquele código é porto marítimo, aeroporto, ponto
 * rodoviário ou ferroviário. É ele que permite sinalizar embarque marítimo cujo
 * código de carregamento não é porto — erro de preenchimento na origem que, sem
 * isso, viraria uma linha no mapa saindo de um lugar onde navio não atraca.
 *
 * **Origem:** UN/LOCODE, publicado pela UNECE, que o declara de uso livre e sem
 * responsabilidade do Secretariado das Nações Unidas pelo uso. O arquivo usado é
 * a consolidação em CSV mantida em `datasets/un-locode`, sob ODC PDDL.
 *
 * **O arquivo não é versionado.** Ele é genérico — cobre o mundo inteiro e nada
 * tem da FGV —, mas filtrá-lo para os códigos desta base produziria justamente a
 * lista de onde a empresa importa, que é dado real e não entra em repositório
 * público (§2.2). Fica em `dados/`, como as demais bases, e o seed o lê de lá.
 *
 * O módulo é puro: recebe o texto do arquivo e devolve registros. Quem abre
 * arquivo e quem grava no banco são o script de seed.
 */

/** Um registro da lista, já com o que este sistema usa. */
export type RegistroUnlocode = {
  /** Cinco letras, país + local, sem espaço: `BRPNG`. */
  locode: string
  /** Duas letras do país. */
  pais: string
  nome: string
  /** Subdivisão do país, quando a lista traz. */
  subdivisao: string | null
  latitude: number | null
  longitude: number | null
  /** O classificador cru, oito posições, como a lista publica. */
  funcao: string | null
  /** Verdadeiro quando a primeira posição do classificador é porto marítimo. */
  ehPorto: boolean
}

/**
 * Divide uma linha de CSV respeitando aspas.
 *
 * A lista tem campo com vírgula dentro de aspas — a coluna de observações traz
 * listas de códigos relacionados separadas por vírgula. Dividir por vírgula
 * simples desloca todas as colunas seguintes daquela linha, e o efeito seria uma
 * coordenada lida da coluna errada: número plausível, lugar errado.
 */
export function dividirLinhaCsv(linha: string): string[] {
  const campos: string[] = []
  let atual = ''
  let entreAspas = false

  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]
    if (entreAspas) {
      if (c === '"') {
        // Aspas dobradas dentro de campo entre aspas representam uma aspa.
        if (linha[i + 1] === '"') {
          atual += '"'
          i++
        } else {
          entreAspas = false
        }
      } else {
        atual += c
      }
      continue
    }
    if (c === '"') entreAspas = true
    else if (c === ',') {
      campos.push(atual)
      atual = ''
    } else atual += c
  }
  campos.push(atual)
  return campos
}

/**
 * Converte a coordenada da lista para grau decimal.
 *
 * O formato é grau e minuto colados, com o hemisfério na última letra:
 * `2245N 11335E`. A latitude tem dois dígitos de grau e a longitude tem três —
 * é isso que separa os dois, e é por isso que o minuto se lê **do fim para o
 * começo**, nunca por posição fixa contada do início.
 *
 * Devolve nulo quando a lista não traz coordenada, que é o caso de parte dos
 * registros. Nulo aqui é ausência declarada: o porto existe e entra no cadastro,
 * só não pode ser desenhado.
 */
export function coordenadaUnlocode(
  bruto: string | null | undefined,
): { latitude: number; longitude: number } | null {
  const texto = (bruto ?? '').trim()
  if (texto === '') return null

  const partes = texto.split(/\s+/)
  if (partes.length !== 2) return null

  const grau = (p: string, hemisferios: string): number | null => {
    const casa = p.slice(-1).toUpperCase()
    if (!hemisferios.includes(casa)) return null
    const digitos = p.slice(0, -1)
    if (!/^\d{4,5}$/.test(digitos)) return null
    const minuto = Number(digitos.slice(-2))
    const grauInteiro = Number(digitos.slice(0, -2))
    if (minuto >= 60) return null
    const valor = grauInteiro + minuto / 60
    return casa === 'S' || casa === 'W' ? -valor : valor
  }

  const latitude = grau(partes[0], 'NS')
  const longitude = grau(partes[1], 'EW')
  if (latitude === null || longitude === null) return null
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
  return { latitude, longitude }
}

/** Primeira posição do classificador: porto marítimo. */
export function ehPortoMaritimo(funcao: string | null | undefined): boolean {
  return (funcao ?? '').charAt(0) === '1'
}

/**
 * Lê a lista inteira, ficando só com os códigos pedidos.
 *
 * O filtro é por código, e a lista dos códigos vem do relatório do agente — não
 * há lista de portos escrita neste repositório, e não pode haver (§2.2).
 *
 * A lista oficial tem registro repetido para o mesmo código quando o lugar mudou
 * de nome ou de estado; vence **o primeiro que traz coordenada**, e na falta
 * dele o primeiro de todos. Sem essa regra, um registro histórico sem
 * coordenada apagaria o bom.
 */
export function lerUnlocode(
  conteudo: string,
  codigosDesejados: Iterable<string>,
): Map<string, RegistroUnlocode> {
  const querido = new Set([...codigosDesejados].map((c) => c.trim().toUpperCase()))
  const achados = new Map<string, RegistroUnlocode>()
  if (querido.size === 0) return achados

  const linhas = conteudo.split(/\r?\n/)
  if (linhas.length === 0) return achados

  const cabecalho = dividirLinhaCsv(linhas[0]).map((c) => c.trim())
  const indice = (nome: string): number => cabecalho.indexOf(nome)
  const iPais = indice('Country')
  const iLocal = indice('Location')
  const iNome = indice('Name')
  const iSub = indice('Subdivision')
  const iFuncao = indice('Function')
  const iCoord = indice('Coordinates')

  if (iPais < 0 || iLocal < 0 || iNome < 0 || iCoord < 0) {
    throw new Error(
      'O arquivo não tem as colunas da lista UN/LOCODE (Country, Location, ' +
        'Name, Coordinates). Confira se é mesmo o code-list.csv.',
    )
  }

  for (let i = 1; i < linhas.length; i++) {
    if (linhas[i].trim() === '') continue
    const campos = dividirLinhaCsv(linhas[i])
    const pais = (campos[iPais] ?? '').trim().toUpperCase()
    const local = (campos[iLocal] ?? '').trim().toUpperCase()
    if (pais === '' || local === '') continue

    const locode = `${pais}${local}`
    if (!querido.has(locode)) continue

    const funcao = (campos[iFuncao] ?? '').trim() || null
    const coordenada = coordenadaUnlocode(campos[iCoord])
    const registro: RegistroUnlocode = {
      locode,
      pais,
      nome: (campos[iNome] ?? '').trim(),
      subdivisao: (campos[iSub] ?? '').trim() || null,
      latitude: coordenada?.latitude ?? null,
      longitude: coordenada?.longitude ?? null,
      funcao,
      ehPorto: ehPortoMaritimo(funcao),
    }

    const anterior = achados.get(locode)
    if (anterior === undefined || (anterior.latitude === null && coordenada !== null)) {
      achados.set(locode, registro)
    }
  }

  return achados
}

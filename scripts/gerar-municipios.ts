/**
 * Gera a lista de municípios usada no formulário de carro do programa (§7.4).
 *
 * **Por que um gerador, e não uma lista colada no repositório.** É a mesma
 * razão do `gerar-contorno.ts`: dado público tem procedência, e cinco mil e
 * quinhentas linhas coladas num arquivo entram sem ninguém olhar de onde
 * vieram. Aqui a origem está declarada e o resultado é reprodutível — quem
 * duvidar roda de novo e compara.
 *
 * **Origem:** IBGE, API de localidades, recurso de municípios. Dado público
 * (Lei 12.527/2011), reutilizável com atribuição à fonte, que fica no cabeçalho
 * do arquivo gerado.
 *
 * **A coordenada existe para desenhar, e não para rotear.** A distinção é a
 * lição de 15/09 lida no sentido certo: lá se pedia precisão de CEP e o
 * provedor devolvia o centro do município, o que arruinava a distância. Aqui o
 * uso é outro — **um ponto num mapa do país**, onde o centro do município é
 * exatamente a precisão desejada. O roteamento continua resolvendo o lugar pelo
 * nome com a UF, porque é ele quem sabe onde a estrada entra na cidade; mandar
 * a ele um ponto nosso seria escolher um lugar dentro do município e roteá-lo
 * como se fosse o município.
 *
 * O centroide vem das **malhas territoriais do IBGE**, na qualidade mínima —
 * a mesma origem e a mesma licença das divisas de região que o mapa já usa.
 *
 * **O que a lista resolve é ambiguidade de grafia**, que é o que a §7.4 pede: o
 * município é escolhido de uma lista fechada, nunca digitado livre, e a chave do
 * cache de rota é a sequência de códigos IBGE. Sem isso, "Sao Jose dos Pinhais"
 * e "São José dos Pinhais" seriam duas rotas diferentes no cache e duas
 * chamadas pagas ao provedor.
 *
 * Uso:
 *   npx tsx scripts/gerar-municipios.ts
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

import { ehEntrada } from './_comum'

const ORIGEM =
  'https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome'

const DESTINO = 'src/lib/municipios.ts'

/** Quantos municípios o Brasil tem hoje; a conferência abaixo usa como piso. */
const MINIMO_ESPERADO = 5000

type MunicipioDaApi = {
  id: number
  nome: string
  microrregiao?: { mesorregiao?: { UF?: { sigla?: string } } }
  'regiao-imediata'?: { 'regiao-intermediaria'?: { UF?: { sigla?: string } } }
}

/**
 * Por `curl`, e não por `fetch`, pelo mesmo motivo do gerador de contorno: é o
 * que já funciona contra este servidor, e a mensagem de erro diz o que fazer em
 * vez de devolver falha de rede solta.
 */
function baixar(url: string): string {
  try {
    return execFileSync('curl', ['-sS', '--compressed', '--fail', url], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch {
    throw new Error(
      `Não foi possível baixar ${url}. ` +
        'É preciso rede e o comando curl disponível no PATH.',
    )
  }
}

/* ----------------------------------------------------- centroide por malha */

/**
 * Malha territorial de uma UF, com um polígono por município.
 *
 * **Uma requisição por UF, e não uma por município.** São 27 em vez de mais de
 * cinco mil — a diferença entre um gerador que roda e um que ninguém roda duas
 * vezes. A qualidade mínima é a mais grosseira que a API publica, e é a certa
 * aqui: o que se extrai é um ponto, não um contorno.
 */
const MALHA_DA_UF = (idUf: string): string =>
  `https://servicodados.ibge.gov.br/api/v3/malhas/estados/${idUf}` +
  '?formato=application/vnd.geo+json&intrarregiao=municipio&qualidade=minima'

type Anel = [number, number][]

type FeicaoDaMalha = {
  properties?: { codarea?: string }
  geometry?: { type: string; coordinates: unknown }
}

/**
 * Centroide de um anel pela fórmula do polígono (shoelace), **não a média dos
 * vértices**.
 *
 * A média dos vértices puxa o ponto para onde o contorno tem mais detalhe — um
 * litoral recortado deslocaria a cidade para o mar. A fórmula do polígono pesa
 * por área e devolve o centro da figura, que é o que se quer marcar no mapa.
 *
 * Anel degenerado, de área zero, cai na média dos vértices: é o único valor
 * defensável quando não há área.
 */
export function centroideDoAnel(anel: Anel): { lat: number; lon: number } {
  let area = 0
  let x = 0
  let y = 0
  for (let i = 0; i < anel.length; i++) {
    const [x1, y1] = anel[i]
    const [x2, y2] = anel[(i + 1) % anel.length]
    const cruzado = x1 * y2 - x2 * y1
    area += cruzado
    x += (x1 + x2) * cruzado
    y += (y1 + y2) * cruzado
  }
  area /= 2

  if (area === 0) {
    const soma = anel.reduce((s, [lo, la]) => [s[0] + lo, s[1] + la], [0, 0])
    return { lon: soma[0] / anel.length, lat: soma[1] / anel.length }
  }
  return { lon: x / (6 * area), lat: y / (6 * area) }
}

/** O maior anel externo da feição: é ele que carrega a sede do município. */
function maiorAnel(geometria: FeicaoDaMalha['geometry']): Anel {
  if (geometria === undefined) throw new Error('Feição sem geometria.')

  const aneis: Anel[] =
    geometria.type === 'Polygon'
      ? [(geometria.coordinates as Anel[])[0]]
      : (geometria.coordinates as Anel[][]).map((poligono) => poligono[0])

  let escolhido: Anel | null = null
  let maior = -1
  for (const anel of aneis) {
    if (!Array.isArray(anel) || anel.length < 3) continue
    let area = 0
    for (let i = 0; i < anel.length; i++) {
      const [x1, y1] = anel[i]
      const [x2, y2] = anel[(i + 1) % anel.length]
      area += x1 * y2 - x2 * y1
    }
    const absoluta = Math.abs(area / 2)
    if (absoluta > maior) {
      maior = absoluta
      escolhido = anel
    }
  }

  if (escolhido === null) throw new Error('Feição sem anel utilizável.')
  return escolhido
}

/**
 * Três casas decimais: cerca de cem metros.
 *
 * O ponto é a marca de um município num mapa do país, onde cem metros não
 * chegam a um pixel. Guardar mais casas seria carregar precisão que o desenho
 * não usa, num arquivo que viaja inteiro.
 */
function arredondar(valor: number): number {
  return Math.round(valor * 1000) / 1000
}

/**
 * Caixa do território brasileiro, com folga. Ponto fora dela é erro de leitura.
 *
 * **O limite leste inclui as ilhas oceânicas**, e não o continente: Fernando de
 * Noronha e o arquipélago de Trindade são território brasileiro, com município,
 * e ficam bem a leste da costa. Uma caixa colada no continente reprovaria dado
 * correto — foi o que ela fez na primeira execução, e a caixa é que estava
 * errada.
 */
const BRASIL = { oeste: -74, leste: -28, sul: -34, norte: 6 }

export function centroidesDaUf(malha: {
  features?: FeicaoDaMalha[]
}): Map<string, { lat: number; lon: number }> {
  const pontos = new Map<string, { lat: number; lon: number }>()
  for (const feicao of malha.features ?? []) {
    const codigo = feicao.properties?.codarea
    if (codigo === undefined || !/^[0-9]{7}$/.test(codigo)) {
      throw new Error(
        'Feição da malha sem código de município reconhecível: ' +
          JSON.stringify(feicao.properties),
      )
    }
    const { lat, lon } = centroideDoAnel(maiorAnel(feicao.geometry))
    // **O ponto tem que cair no Brasil.** A troca de ordem entre latitude e
    // longitude é o erro clássico de leitura de GeoJSON, e ele não produz falha:
    // produz um município no meio do oceano Índico, que só aparece no desenho.
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lon < BRASIL.oeste ||
      lon > BRASIL.leste ||
      lat < BRASIL.sul ||
      lat > BRASIL.norte
    ) {
      throw new Error(
        `Centroide fora do território brasileiro no município ${codigo}: ` +
          `${lat}, ${lon}. A malha veio em outro formato ou noutra ordem de eixos.`,
      )
    }
    pontos.set(codigo, { lat: arredondar(lat), lon: arredondar(lon) })
  }
  return pontos
}

/**
 * A sigla da UF aparece em dois caminhos diferentes da resposta, e nem todo
 * município traz os dois. Ler os dois evita descartar linha por causa da forma
 * da resposta — e município sem UF é erro, não linha a ignorar: o nome sozinho
 * não identifica o lugar.
 */
function ufDe(municipio: MunicipioDaApi): string {
  const sigla =
    municipio.microrregiao?.mesorregiao?.UF?.sigla ??
    municipio['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla
  if (sigla === undefined || !/^[A-Z]{2}$/.test(sigla)) {
    throw new Error(
      `Município ${municipio.id} (${municipio.nome}) veio sem sigla de UF reconhecível.`,
    )
  }
  return sigla
}

export function montarLinhas(
  bruto: MunicipioDaApi[],
  centroides: Map<string, { lat: number; lon: number }>,
): string[] {
  if (bruto.length < MINIMO_ESPERADO) {
    throw new Error(
      `A API devolveu ${bruto.length} municípios, abaixo do mínimo esperado ` +
        `(${MINIMO_ESPERADO}). Resposta truncada ou recurso trocado.`,
    )
  }

  const codigos = new Set<string>()
  const semCentroide: string[] = []
  const linhas = bruto
    .map((m) => {
      const codigo = String(m.id)
      if (!/^[0-9]{7}$/.test(codigo)) {
        throw new Error(`Código IBGE fora do formato de sete dígitos: ${codigo}`)
      }
      if (codigos.has(codigo)) {
        throw new Error(`Código IBGE repetido na resposta: ${codigo}`)
      }
      codigos.add(codigo)

      const nome = m.nome.replace(/\s+/g, ' ').trim()
      if (nome === '') throw new Error(`Município ${codigo} veio sem nome.`)
      if (nome.includes('|')) {
        throw new Error(`Nome com o separador do formato compacto: ${nome}`)
      }

      const ponto = centroides.get(codigo)
      if (ponto === undefined) semCentroide.push(`${codigo} (${nome})`)

      // **Coordenada ausente vira campo vazio, não linha ausente.** O município
      // continua na lista, continua podendo ser escolhido e continua roteando,
      // porque a rota é resolvida por nome e UF. O que ele não tem é ponto no
      // mapa — e isso é fato a declarar na tela, como a ausência de coordenada
      // de porto e de aeroporto já é. Tirá-lo da lista seria pior: some do
      // formulário um lugar que existe.
      return ponto === undefined
        ? `${codigo}|${nome}|${ufDe(m)}||`
        : `${codigo}|${nome}|${ufDe(m)}|${ponto.lat}|${ponto.lon}`
    })
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))

  // **Um punhado sem ponto é município novo; muitos é malha trocada.** O IBGE
  // publica a criação de município no cadastro de localidades antes de refazer a
  // malha, então a diferença de alguns é esperada e informativa. Uma fração
  // grande significa que as duas pontas deixaram de casar — e aí o arquivo
  // inteiro está errado, não alguns municípios.
  const LIMITE_SEM_PONTO = 0.01
  if (semCentroide.length > bruto.length * LIMITE_SEM_PONTO) {
    throw new Error(
      `${semCentroide.length} municípios sem centroide na malha, acima do ` +
        'esperado para criação recente. A malha e o cadastro de localidades ' +
        'deixaram de casar; confira a edição de cada um.',
    )
  }
  if (semCentroide.length > 0) {
    console.log(
      `  ${semCentroide.length} município(s) sem centroide na malha, provavelmente ` +
        `de criação recente: ${semCentroide.join(', ')}.`,
    )
    console.log(
      '  Eles ficam na lista, podem ser escolhidos e roteiam normalmente; o que ' +
        'não têm é ponto no mapa, e a tela declara isso.',
    )
  }

  return linhas
}

function montarArquivo(linhas: string[]): string {
  const cabecalho = `/**
 * Municípios do IBGE — lista embarcada na aplicação (CLAUDE.md §7.4).
 *
 * **ARQUIVO GERADO. Não edite à mão.** Refaça com:
 *   npx tsx scripts/gerar-municipios.ts
 *
 * **Origem:** IBGE — API de localidades para nome e UF, malhas territoriais na
 * qualidade mínima para o centroide. Dado público (Lei 12.527/2011),
 * reutilizável com atribuição à fonte.
 *
 * ${linhas.length} municípios, cada um com o centroide do próprio território.
 *
 * **A coordenada serve para desenhar, não para rotear.** Ela marca o município
 * no mapa do programa de viagens; quem calcula distância continua mandando nome
 * e UF ao provedor, que é quem sabe por onde a estrada entra na cidade. São dois
 * usos com precisões diferentes, e confundi-los foi o erro de 15/09 ao contrário.
 *
 * **A coleção \`municipio\` da §9.2 não existe, e não deve ser criada enquanto
 * este arquivo for a fonte.** Duas cópias do mesmo dado é uma que diverge da
 * outra em silêncio, e a que a tela lê não seria a que alguém corrigiu.
 */
import { chaveNormalizada } from './texto'

export type Municipio = {
  /** Código IBGE de sete dígitos: é a chave do cache de rota (§7.4). */
  codigoIbge: string
  nome: string
  uf: string
  /**
   * Centroide do território, para o ponto no mapa. Três casas ≈ cem metros.
   *
   * **Pode ser nulo**, e a ausência é fato, não falha: o IBGE cria o município
   * no cadastro de localidades antes de refazer a malha. O lugar continua
   * escolhível e continua roteando — o que falta é o ponto, e quem desenha
   * declara o que não pôde desenhar.
   */
  latitude: number | null
  longitude: number | null
}

/**
 * Formato compacto \`codigo|nome|uf|lat|lon\`, desdobrado uma vez na primeira
 * leitura.
 *
 * Um objeto por linha custaria mais que o dobro do arquivo em chaves repetidas,
 * e o arquivo viaja no repositório e no bundle do servidor.
 */
const BRUTO: readonly string[] = [
`

  const corpo = linhas.map((l) => `  ${JSON.stringify(l)},`).join('\n')

  const rodape = `
]

export const MUNICIPIOS: readonly Municipio[] = BRUTO.map((linha) => {
  const [codigoIbge, nome, uf, lat, lon] = linha.split('|')
  return {
    codigoIbge,
    nome,
    uf,
    latitude: lat === '' ? null : Number(lat),
    longitude: lon === '' ? null : Number(lon),
  }
})

const POR_CODIGO = new Map(MUNICIPIOS.map((m) => [m.codigoIbge, m]))

/** Chave de busca por município, sem acento e sem caixa, com a UF junto. */
const CHAVES = MUNICIPIOS.map((m) => ({
  municipio: m,
  chave: chaveNormalizada(\`\${m.nome} \${m.uf}\`),
  chaveNome: chaveNormalizada(m.nome),
}))

export function municipioPorCodigo(codigoIbge: string): Municipio | null {
  return POR_CODIGO.get(codigoIbge) ?? null
}

/**
 * Busca por prefixo, depois por trecho no meio do nome.
 *
 * Prefixo primeiro porque é o que quem digita espera: "cur" tem que trazer
 * Curitiba antes de Cruz das Almas. **E cada grupo sai em ordem alfabética, não
 * na ordem da lista**, que é geográfica — sem isso, "cur" devolvia doze
 * municípios do Norte e do Nordeste e Curitiba ficava fora do corte, que é o
 * tipo de coisa que faz quem preenche desistir da lista e achar que o lugar não
 * existe. A ordem alfabética também é o que põe Curitiba antes de Curitibanos.
 *
 * O limite existe para a resposta caber numa lista que alguém lê, não para
 * esconder resultado: a busca varre a lista inteira antes de cortar.
 */
export function buscarMunicipios(termo: string, limite = 12): Municipio[] {
  const busca = chaveNormalizada(termo)
  if (busca.length < 2) return []

  const comecam: Municipio[] = []
  const contem: Municipio[] = []
  for (const { municipio, chave, chaveNome } of CHAVES) {
    if (chaveNome.startsWith(busca) || chave.startsWith(busca)) comecam.push(municipio)
    else if (chave.includes(busca)) contem.push(municipio)
  }

  const porNome = (a: Municipio, b: Municipio): number =>
    a.nome.localeCompare(b.nome, 'pt-BR') || a.uf.localeCompare(b.uf)

  return [...comecam.sort(porNome), ...contem.sort(porNome)].slice(0, limite)
}

/**
 * O lugar como o provedor de rota o recebe.
 *
 * **Nome, UF e país — nunca a coordenada guardada aqui.** Ela é o centro do
 * território, e rotear a partir dela mandaria o trajeto para um ponto qualquer
 * dentro do município em vez de para a cidade. A UF é o que torna "Bom Jesus",
 * que existe em sete estados, um lugar só.
 */
export function enderecoDoMunicipio(municipio: Municipio): string {
  return \`\${municipio.nome}, \${municipio.uf}, Brasil\`
}
`

  return cabecalho + corpo + rodape
}

/** Os 27 códigos de UF, deduzidos dos dois primeiros dígitos dos municípios. */
function ufsDe(bruto: MunicipioDaApi[]): string[] {
  return [...new Set(bruto.map((m) => String(m.id).slice(0, 2)))].sort()
}

async function principal(): Promise<void> {
  console.log(`Baixando a lista de municípios de ${ORIGEM} …`)
  const bruto = JSON.parse(baixar(ORIGEM)) as MunicipioDaApi[]

  const ufs = ufsDe(bruto)
  console.log(`Baixando a malha de ${ufs.length} unidades da federação …`)
  const centroides = new Map<string, { lat: number; lon: number }>()
  for (const idUf of ufs) {
    const malha = JSON.parse(baixar(MALHA_DA_UF(idUf))) as {
      features?: FeicaoDaMalha[]
    }
    const daUf = centroidesDaUf(malha)
    for (const [codigo, ponto] of daUf) centroides.set(codigo, ponto)
    process.stdout.write(`  ${idUf}: ${daUf.size}\n`)
  }

  const linhas = montarLinhas(bruto, centroides)

  writeFileSync(DESTINO, montarArquivo(linhas), 'utf8')
  console.log(`  ${linhas.length} municípios gravados em ${DESTINO}.`)
}

if (ehEntrada(import.meta.url)) {
  void principal().catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
}

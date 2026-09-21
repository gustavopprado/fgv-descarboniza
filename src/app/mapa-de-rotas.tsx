/**
 * O mapa de ligações — CLAUDE.md §10.3.
 *
 * **Peça compartilhada entre o inventário e o programa de viagens**, e é por
 * isso que ela mora aqui, e não dentro de uma das duas telas. A §7.5 diz a regra
 * que governa isto: o que se compartilha é a matemática — e o desenho —, nunca o
 * dado. O componente não conhece coleção, consulta nem módulo: recebe lugares e
 * ligações já prontos, e desenha.
 *
 * Quem chama decide o que é um lugar. No inventário de viagens é a região, que
 * agrega centenas de trechos num punhado de linhas legíveis; no programa é o
 * lugar de verdade — a cidade do aeroporto e o município —, porque ali não há
 * volume que peça agregação nem supressão a satisfazer.
 *
 * **Ligação não tem sentido**: ida e volta são a mesma, e por isso não há seta.
 * Ligação entre um lugar e ele mesmo vira anel, porque um ponto não tem direção
 * para desenhar.
 *
 * **O enquadramento sai do dado, e é por isso que existe o inserto.** Com um
 * extremo intercontinental, a moldura passa a cobrir quase meio planeta e o
 * conjunto doméstico — que costuma concentrar a maior parte — vira um borrão de
 * poucos pixels. O quadro grande mostra o alcance; o inserto mostra o que o
 * alcance esmaga. Nenhum dos dois esconde o outro: o doméstico é desenhado nos
 * dois.
 */
import {
  projetar,
  rotulosQueCabem,
  type Coordenada,
  type LigacaoDoMapa,
  type PontoDoMapa,
  type Projecao,
} from '@/lib/mapa'
import {
  CONTORNO_DAS_REGIOES,
  CONTORNO_DO_BRASIL,
  CONTORNO_DO_MUNDO,
} from '@/lib/mundo'
import { recortarAnel } from '@/lib/recorte'
import { Rolavel } from './componentes'

const MOLDURA = { largura: 640, altura: 420, margem: 40 }
const INSERTO = { largura: 212, altura: 152, margem: 18 }

/**
 * Teto de largura do desenho, em pixels de tela.
 *
 * **`viewBox` é escala, não tamanho.** Com a casca crescendo com a tela (ver
 * `casca.tsx`), um painel de largura inteira chega a 2172px num monitor de
 * 2560 — e o mapa, que guarda a proporção 640×420, sairia com 1426px de altura.
 * A tela inteira viraria o mapa, com todo o resto abaixo da dobra.
 *
 * O valor é o tamanho em que ele é desenhado hoje, e é por isso que é este
 * número e não um redondo: **o inserto, o recuo do rótulo e o limiar de colisão
 * medido em 16/09 e 18/09 foram calibrados nesta escala.** Mudá-la reabriria
 * aquela validação por causa de largura de monitor.
 *
 * **O teto é do bloco inteiro — desenho e legenda —, e o bloco fica à esquerda.**
 * A primeira tentativa centrava só o desenho, e o resultado tinha três
 * alinhamentos no mesmo painel: título na borda, desenho duzentos pixels adentro,
 * legenda de volta na borda. Figura deslocada em relação ao texto dela não é
 * branco simétrico, é desalinho. Com o teto no bloco, a legenda nasce sob o
 * desenho e tudo compartilha a borda esquerda do painel.
 */
const LARGURA_MAXIMA = 1056

/**
 * E o piso, que é o mesmo raciocínio pelo outro lado.
 *
 * Num celular de 360px o painel tem 280px úteis: o mapa saía com 280×184, o
 * rótulo de região a 4,2px e o inserto virava uma miniatura de 93×66 com
 * rótulos de 3,3px. Abaixo deste piso ele rola — arrastar um mapa é natural,
 * ler um rótulo de 3px não é.
 */
const LARGURA_MINIMA = Math.round(MOLDURA.largura * 0.9)

/** Atraso entre o começo de um corredor e o do seguinte. */
const PASSO_MS = 140
const DURACAO_MS = 1600

/** Quanto o arco se afasta da reta, em fração do próprio comprimento. */
const CURVATURA = 0.17

/**
 * O inserto só aparece quando o quadro principal não dá conta do doméstico.
 *
 * A regra é geométrica e se ajusta sozinha: se o conjunto brasileiro já ocupa
 * mais que esta fração da moldura, ele está legível e o inserto seria o mesmo
 * desenho repetido do lado. Num recorte só doméstico, a moldura **é** o
 * doméstico e o inserto não existe.
 */
const LIMITE_DO_INSERTO = 0.3

/* ------------------------------------------------------------- desenho */

/** Contorno de terra recortado no enquadramento, para não levar o mundo no HTML. */
export function Terra({ projecao, chave }: { projecao: Projecao; chave: string }) {
  const { oeste, leste, sul, norte } = projecao.limites
  const aneis = CONTORNO_DO_MUNDO.filter(
    (anel) =>
      anel.caixa[0] <= leste &&
      anel.caixa[2] >= oeste &&
      anel.caixa[1] <= norte &&
      anel.caixa[3] >= sul,
  )
    .map((anel) => recortarAnel(anel.pontos, { oeste, leste, sul, norte }))
    .filter((anel) => anel.length > 0)

  return (
    <>
      {aneis.map((anel, i) => (
        <path
          key={`${chave}-${i}`}
          d={
            anel
              .map((ponto, j) => {
                const { x, y } = projecao.projetar({
                  longitude: ponto[0],
                  latitude: ponto[1],
                })
                return `${j === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
              })
              .join('') + 'Z'
          }
          fill="#3C5C39"
          stroke="#4E7049"
          strokeWidth={0.5}
        />
      ))}
    </>
  )
}

/**
 * A fronteira do Brasil, para o país se situar no desenho.
 *
 * **É linha, não área**, e por isso não passa pelo recorte de polígono como a
 * terra: recortar um traço faz aparecerem as arestas da moldura, e o desenho
 * ganharia uma caixa que ninguém pediu. O `svg` — o de fora e o do inserto —
 * já corta sozinho o que passa da borda.
 *
 * O preenchimento é um tom acima do continente, o suficiente para separar o país
 * do vizinho sem virar outra camada de informação: o mapa continua sendo sobre
 * corredores.
 */
export function Brasil({ projecao, chave }: { projecao: Projecao; chave: string }) {
  return (
    <>
      {CONTORNO_DO_BRASIL.map((anel, i) => (
        <path
          key={`${chave}-br-${i}`}
          d={
            anel.pontos
              .map((ponto, j) => {
                const { x, y } = projecao.projetar({
                  longitude: ponto[0],
                  latitude: ponto[1],
                })
                return `${j === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
              })
              .join('') + 'Z'
          }
          fill="#456B41"
          stroke="#7FA278"
          strokeWidth={0.8}
          strokeLinejoin="round"
        />
      ))}
    </>
  )
}

/**
 * As divisas das cinco regiões, no quadro que mostra o Brasil de perto.
 *
 * **Região, e não estado, porque é a unidade que o mapa mede.** Vinte e sete
 * divisas num quadro deste tamanho convidariam a procurar um estado que não
 * existe como recorte aqui: o corredor é entre regiões, e a divisa desenhada é a
 * mesma que o cadastro do aeroporto usa para classificar.
 *
 * A região aberta é pintada, e é isso que liga o clique no ponto ao desenho —
 * sem a pintura, o painel abre embaixo e o mapa não responde.
 */
function DivisasDasRegioes({
  projecao,
  aberta,
  chave,
}: {
  projecao: Projecao
  aberta: string | null
  chave: string
}) {
  return (
    <>
      {CONTORNO_DAS_REGIOES.map((anel, i) => (
        <path
          key={`${chave}-rg-${i}`}
          d={
            anel.pontos
              .map((ponto, j) => {
                const { x, y } = projecao.projetar({
                  longitude: ponto[0],
                  latitude: ponto[1],
                })
                return `${j === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
              })
              .join('') + 'Z'
          }
          fill={anel.regiao === aberta ? '#5A8453' : 'none'}
          stroke={anel.regiao === aberta ? '#9CC094' : '#6B8F64'}
          strokeWidth={anel.regiao === aberta ? 1 : 0.6}
          strokeLinejoin="round"
        />
      ))}
    </>
  )
}

/**
 * As ligações.
 *
 * Ligação entre um lugar e ele mesmo é um ponto, não uma linha: vira anel em
 * volta dele, com a espessura carregando o peso. Ida e volta são a mesma
 * ligação, então não há seta nem sentido a desenhar.
 */
function Ligacoes({
  ligacoes,
  projecao,
  maior,
  espessuraMaxima,
  chave,
  sentido = false,
}: {
  ligacoes: LigacaoDoMapa[]
  projecao: Projecao
  maior: number
  espessuraMaxima: number
  chave: string
  /**
   * A ligação tem sentido, e o desenho pode encená-lo.
   *
   * **Só liga onde o sentido é dado, não onde é acaso do desenho.** No
   * inventário de viagens e no programa, ida e volta são a mesma ligação — não
   * há de onde para onde, e um ponto percorrendo a linha inventaria uma direção
   * que o recorte não tem. Na importação marítima a carga sai de um porto e
   * chega no outro, e isso está no documento.
   */
  sentido?: boolean
}) {
  return (
    <>
      {ligacoes.map((l, i) => {
        const de = projecao.projetar(l.origem)
        const para = projecao.projetar(l.destino)
        const espessura =
          maior > 0 ? 0.9 + (l.co2Kg / maior) * (espessuraMaxima - 0.9) : 0.9

        if (l.origem.chave === l.destino.chave) {
          return (
            <circle
              key={`${chave}-${l.chave}`}
              className="surgir"
              style={{ animationDelay: `${i * PASSO_MS}ms` }}
              cx={de.x}
              cy={de.y}
              r={espessuraMaxima * 1.9}
              fill="none"
              stroke="#B0D9B1"
              strokeOpacity={0.85}
              strokeWidth={espessura}
            />
          )
        }

        const dx = para.x - de.x
        const dy = para.y - de.y
        const comprimento = Math.hypot(dx, dy)
        const meioX = (de.x + para.x) / 2
        const meioY = (de.y + para.y) / 2
        const controleX = meioX - (dy / (comprimento || 1)) * comprimento * CURVATURA
        const controleY = meioY + (dx / (comprimento || 1)) * comprimento * CURVATURA

        const traçado = `M${de.x.toFixed(1)},${de.y.toFixed(1)} Q${controleX.toFixed(1)},${controleY.toFixed(1)} ${para.x.toFixed(1)},${para.y.toFixed(1)}`

        return (
          <g key={`${chave}-${l.chave}`}>
            <path
              className="desenhar"
              pathLength={1}
              style={
                {
                  '--traco': '1',
                  animationDelay: `${i * PASSO_MS}ms`,
                } as React.CSSProperties
              }
              d={traçado}
              fill="none"
              stroke="#B0D9B1"
              strokeOpacity={0.85}
              strokeWidth={espessura}
              strokeLinecap="round"
            />
            {sentido && (
              // Percorre o arco uma vez, no ritmo em que a linha é desenhada:
              // o movimento é o traçado acontecendo, do porto de origem para o
              // de destino. Ver `.navegar` em globals.css.
              <circle
                className="navegar"
                r={espessuraMaxima * 0.5}
                fill="var(--color-fgv)"
                style={
                  {
                    '--rota': `path('${traçado}')`,
                    animationDelay: `${i * PASSO_MS}ms`,
                  } as React.CSSProperties
                }
              />
            )}
          </g>
        )
      })}
    </>
  )
}

/**
 * Ponto e rótulo de cada lugar; um lugar aparece em várias ligações.
 *
 * `rotular` existe por um defeito real do quadro global: com o inserto no ar, os
 * rótulos domésticos caem num quadrado de poucos pixels e viram um borrão
 * ilegível. O quadro grande desenha os pontos e deixa os nomes para o inserto —
 * **o ponto continua desenhado**, então nada some do alcance; o que sai é o
 * rótulo que não cabia.
 */
export function Pontos({
  lugares,
  projecao,
  atraso,
  escala = 1,
  rotular = () => true,
  href,
  aberto,
  chave,
}: {
  lugares: PontoDoMapa[]
  projecao: Projecao
  atraso: number
  escala?: number
  rotular?: (ponto: PontoDoMapa) => boolean
  /** Endereço que abre (ou fecha) o lugar. Sem ele, o ponto não é clicável. */
  href?: (chaveDoPonto: string) => string
  aberto?: string | null
  chave: string
}) {
  return (
    <>
      {lugares.map((lugar, i) => {
        const ponto = projecao.projetar(lugar)
        const selecionado = aberto === lugar.chave
        const marca = (
          <>
            <circle
              cx={ponto.x}
              cy={ponto.y}
              r={(selecionado ? 4 : 3) * escala}
              fill="#EAF4E8"
            />
            <circle
              cx={ponto.x}
              cy={ponto.y}
              r={(selecionado ? 10 : 7) * escala}
              fill="none"
              stroke="var(--color-fgv)"
              strokeWidth={(selecionado ? 2 : 1.2) * escala}
              strokeOpacity={selecionado ? 1 : 0.55}
            />
            {rotular(lugar) && (
              <text
                /* No celular o desenho cabe na largura inteira, e nessa escala
                   o rótulo sai com pouco mais de quatro pixels — sujeira, não
                   texto. Ele some, e a legenda declara que sumiu. */
                className="max-sm:hidden"
                x={ponto.x + (selecionado ? 13 : 9) * escala}
                y={ponto.y - 6 * escala}
                fill={selecionado ? '#EAF4E8' : '#C6DCC2'}
                fontSize={9.5 * escala}
                fontWeight={selecionado ? 600 : 400}
              >
                {lugar.rotulo}
              </text>
            )}
          </>
        )

        return (
          <g
            key={`${chave}-${lugar.chave}`}
            className="surgir"
            style={{ animationDelay: `${Math.round(atraso + i * 40)}ms` }}
          >
            {href === undefined ? (
              marca
            ) : (
              // **Âncora de SVG, não componente de cliente.** O recorte fica no
              // endereço, como o seletor de ano: recarregar mantém o lugar
              // aberto e o endereço pode ser enviado a outra pessoa. E o ponto
              // continua clicável com JavaScript bloqueado.
              <a href={href(lugar.chave)} className="cursor-pointer">
                <title>
                  {selecionado
                    ? `Fechar ${lugar.rotulo}`
                    : `Ver o que aconteceu em ${lugar.rotulo}`}
                </title>
                {/* Alvo generoso: o ponto tem poucos pixels. */}
                <circle
                  cx={ponto.x}
                  cy={ponto.y}
                  r={13 * escala}
                  fill="transparent"
                />
                {marca}
              </a>
            )}
          </g>
        )
      })}
    </>
  )
}

/** Os lugares de um conjunto de ligações, na ordem em que aparecem. */
function lugaresDe(ligacoes: LigacaoDoMapa[]): PontoDoMapa[] {
  const lugares = new Map<string, PontoDoMapa>()
  for (const l of ligacoes) {
    lugares.set(l.origem.chave, l.origem)
    lugares.set(l.destino.chave, l.destino)
  }
  return [...lugares.values()]
}

/* ----------------------------------------------------------------- mapa */

/**
 * **Três peças do desenho são públicas, e a razão é a da §7.5.**
 *
 * `Terra`, `Brasil` e `Pontos` não sabem o que é uma ligação: sabem projetar
 * contorno e marcar lugar. O mapa das filiais, que não tem ligação nenhuma para
 * desenhar, usa as três — compartilhar o desenho é legítimo, e duplicá-las seria
 * ter dois traçados do mesmo país envelhecendo separados.
 */

function coordenadasDe(ligacoes: LigacaoDoMapa[]): Coordenada[] {
  return ligacoes.flatMap((l) => [l.origem, l.destino])
}

export type TextosDoMapa = {
  /** O que uma linha é, na legenda do canto: "corredor aéreo", "trajeto". */
  unidade: string
  /** A frase que impede a primeira leitura errada possível. Vem antes de tudo. */
  aviso: React.ReactNode
  /** Recorte e procedência, em corpo menor. */
  ressalva?: React.ReactNode
}

export function MapaDeRotasSvg({
  ligacoes,
  textos,
  href,
  aberto = null,
  sentido = false,
  divisas = true,
}: {
  ligacoes: LigacaoDoMapa[]
  textos: TextosDoMapa
  href?: (chaveDoPonto: string) => string
  aberto?: string | null
  /** A ligação tem sentido e o desenho o encena. Ver `Ligacoes`. */
  sentido?: boolean
  /**
   * As divisas das cinco regiões, no quadro que mostra o Brasil de perto.
   *
   * **Elas só fazem sentido onde a região é a unidade do mapa.** No inventário
   * de viagens o corredor é entre regiões, e a divisa é a mesma que classifica o
   * aeroporto — clicar num ponto acende a região. No marítimo o ponto é um porto
   * e não há recorte por região nenhum: desenhar as divisas convidaria a
   * procurar um agrupamento que a tela não tem.
   */
  divisas?: boolean
}) {
  if (ligacoes.length === 0) return null

  const projecao = projetar(coordenadasDe(ligacoes), MOLDURA)
  const maior = ligacoes.reduce((m, l) => Math.max(m, l.co2Kg), 0)

  // **O conjunto doméstico vem declarado em cada ponto, não deduzido do rótulo.**
  // Quem monta o dado sabe se o lugar é do Brasil — pela classificação gravada
  // no cadastro do aeroporto, ou por ser município do IBGE. Reconhecer isso pelo
  // texto seria uma lista de nomes escrita dentro do desenho.
  //
  // **O inserto é dos LUGARES domésticos, não das ligações domésticas**, e a
  // diferença decide se ele existe: numa importação nenhuma ligação tem as duas
  // pontas no Brasil, e o inserto nunca apareceria — justamente no mapa em que
  // os portos de desembarque ficam a poucos pixels uns dos outros. As ligações
  // domésticas continuam sendo o que ele desenha como linha; onde não houver
  // nenhuma, ele amplia os pontos, que é o que estava ilegível.
  const lugares = lugaresDe(ligacoes)
  const domesticos = lugares.filter((l) => l.domestico)
  const domesticas = ligacoes.filter((l) => l.origem.domestico && l.destino.domestico)
  const pontosDomesticos = domesticos.map((c) => projecao.projetar(c))
  const caixa =
    pontosDomesticos.length === 0
      ? null
      : {
          x1: Math.min(...pontosDomesticos.map((p) => p.x)),
          x2: Math.max(...pontosDomesticos.map((p) => p.x)),
          y1: Math.min(...pontosDomesticos.map((p) => p.y)),
          y2: Math.max(...pontosDomesticos.map((p) => p.y)),
        }

  // Duas condições, e as duas são necessárias: um lugar só não tem o que
  // ampliar, e conjunto que já ocupa boa parte da moldura seria o mesmo desenho
  // repetido do lado.
  const ampliar =
    caixa !== null &&
    domesticos.length >= 2 &&
    (caixa.x2 - caixa.x1) / MOLDURA.largura < LIMITE_DO_INSERTO &&
    (caixa.y2 - caixa.y1) / MOLDURA.altura < LIMITE_DO_INSERTO

  const projecaoDoInserto = ampliar ? projetar(domesticos, INSERTO) : null

  /**
   * Quais nomes cabem em cada quadro, e quantos ficaram sem nenhum.
   *
   * O quadro grande deixa os nomes domésticos para o inserto quando ele existe
   * — é o defeito de 16/09, em que os rótulos do conjunto brasileiro
   * empilhavam num quadrado de poucos pixels. O que sobra passa pela regra de
   * caixa, e **o que não couber em lugar nenhum é declarado na legenda**: nome
   * que some sem aviso vira pergunta sobre dado faltando.
   */
  const noQuadroGrande = lugares.filter((l) => !ampliar || !l.domestico)
  const cabemNoQuadroGrande = rotulosQueCabem(noQuadroGrande, projecao, 1)
  const cabemNoInserto =
    projecaoDoInserto === null
      ? new Set<string>()
      : rotulosQueCabem(domesticos, projecaoDoInserto, 0.8)
  const semNome = lugares.filter(
    (l) => !cabemNoQuadroGrande.has(l.chave) && !cabemNoInserto.has(l.chave),
  ).length

  const atrasoDosPontos = ligacoes.length * PASSO_MS + DURACAO_MS * 0.4
  const insertoX = MOLDURA.largura - INSERTO.largura - 10
  const insertoY = MOLDURA.altura - INSERTO.altura - 10

  return (
    <figure className="m-0" style={{ maxWidth: LARGURA_MAXIMA }}>
      <Rolavel minimo={LARGURA_MINIMA}>
        <div className="relative overflow-hidden rounded-xl bg-[var(--color-escuro-2)] p-1.5">
          <svg
            viewBox={`0 0 ${MOLDURA.largura} ${MOLDURA.altura}`}
            className="block h-auto w-full"
            role="img"
            aria-label={`Mapa com ${ligacoes.length} ${textos.unidade}${
              ligacoes.length === 1 ? '' : 's'
            }.`}
          >
            <Terra projecao={projecao} chave="mundo" />
            <Brasil projecao={projecao} chave="mundo" />
            {/* Sem inserto, o quadro grande é que mostra o Brasil de perto. */}
            {divisas && !ampliar && domesticas.length > 0 && (
              <DivisasDasRegioes projecao={projecao} aberta={aberto} chave="mundo" />
            )}
            <Ligacoes
              ligacoes={ligacoes}
              projecao={projecao}
              maior={maior}
              espessuraMaxima={5.4}
              chave="mundo"
              sentido={sentido}
            />
            <Pontos
              lugares={lugares}
              projecao={projecao}
              atraso={atrasoDosPontos}
              rotular={(ponto) => cabemNoQuadroGrande.has(ponto.chave)}
              href={href}
              aberto={aberto}
              chave="mundo"
            />

            {ampliar && caixa !== null && projecaoDoInserto !== null && (
              <>
                {/* O que o inserto amplia, marcado no quadro grande. */}
                <rect
                  className="max-sm:hidden"
                  x={caixa.x1 - 7}
                  y={caixa.y1 - 7}
                  width={caixa.x2 - caixa.x1 + 14}
                  height={caixa.y2 - caixa.y1 + 14}
                  fill="none"
                  stroke="#EAF4E8"
                  strokeOpacity={0.5}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                {/* `svg` aninhado recorta sozinho o que passar da borda. */}
                {/* O inserto sai no celular: nessa largura ele vira uma
                    miniatura de 93×66 com rótulos de três pixels. */}
                <svg
                  className="max-sm:hidden"
                  x={insertoX}
                  y={insertoY}
                  width={INSERTO.largura}
                  height={INSERTO.altura}
                  viewBox={`0 0 ${INSERTO.largura} ${INSERTO.altura}`}
                >
                  <rect
                    x={0.5}
                    y={0.5}
                    width={INSERTO.largura - 1}
                    height={INSERTO.altura - 1}
                    fill="var(--color-escuro-2)"
                    stroke="#EAF4E8"
                    strokeOpacity={0.5}
                    strokeWidth={1}
                  />
                  <Terra projecao={projecaoDoInserto} chave="inserto" />
                  <Brasil projecao={projecaoDoInserto} chave="inserto" />
                  {divisas && (
                    <DivisasDasRegioes
                      projecao={projecaoDoInserto}
                      aberta={aberto}
                      chave="inserto"
                    />
                  )}
                  <Ligacoes
                    ligacoes={domesticas}
                    projecao={projecaoDoInserto}
                    maior={maior}
                    espessuraMaxima={3.4}
                    chave="inserto"
                    sentido={sentido}
                  />
                  <Pontos
                    lugares={domesticos}
                    projecao={projecaoDoInserto}
                    atraso={atrasoDosPontos}
                    escala={0.8}
                    rotular={(ponto) => cabemNoInserto.has(ponto.chave)}
                    href={href}
                    aberto={aberto}
                    chave="inserto"
                  />
                  {/* No rodapé, não no topo: lá em cima ele cobria o ponto mais ao
                      norte, que a margem deixa colado na borda. */}
                  <text x={8} y={INSERTO.altura - 8} fill="#C6DCC2" fontSize={9.5}>
                    Brasil, ampliado
                  </text>
                </svg>
              </>
            )}
          </svg>

          <p className="absolute right-3 bottom-2.5 flex items-center gap-1.5 text-[11px] text-[#A9C6A5]">
            <span className="inline-block h-0.5 w-3.5 rounded-sm bg-[#B0D9B1]" />
            {textos.unidade}
          </p>
        </div>
      </Rolavel>

      {/* **Duas linhas, e a ordem é a leitura.** A primeira é a única coisa que
          alguém precisa saber para não ler o mapa errado; a segunda é recorte e
          procedência, que importam e não competem. A legenda antes disto tinha
          crescido até virar parágrafo, e parágrafo embaixo de desenho não se lê.

          O texto vem de quem chama porque cada tela erra de um jeito diferente:
          o ponto do inventário é uma média de aeroportos, o do programa é um
          lugar de verdade, e prometer um pelo outro é o tipo de coisa que esta
          legenda existe para impedir. */}
      <figcaption className="mt-3 max-w-[70ch] text-[12px] text-[var(--color-apoio)]">
        {textos.aviso}
        {href === undefined ? '' : ' Clique num ponto para ver o que aconteceu ali.'}
        {/* **A tela declara o que o celular não mostra.** Nessa largura o nome
            de cada ponto sairia com quatro pixels e o inserto com três: em vez
            de desenhar o que não se lê, o desenho fica com a forma e a frase
            assume o resto. Some no desktop, onde nada disso foi retirado. */}
        {/* **O nome que não coube é declarado, não some calado.** Onde os
            pontos se aglomeram — dois portos vizinhos, uma região inteira num
            quadrado de poucos pixels —, escrever todos os nomes produz sujeira
            em vez de texto. Fica o do traço mais pesado, e os outros estão nas
            tabelas da tela. */}
{/* **O que não coube é declarado, nunca some calado** — mas em uma
            linha: quem lê a legenda precisa saber que faltam nomes, não por quê. */}
        {semNome > 0 && (
          <>
            {' '}
            {semNome === 1
              ? 'Um ponto ficou sem nome'
              : `${semNome} pontos ficaram sem nome`}{' '}
            por sobreposição; os nomes estão nas tabelas desta tela.
          </>
        )}
        <span className="sm:hidden">
          {' '}Nesta largura os nomes e o quadro ampliado do Brasil não são
          desenhados.
        </span>
        {textos.ressalva !== undefined && (
          <span className="mt-1.5 block text-[11.5px] text-[var(--color-apoio)]/80">
            {textos.ressalva}
          </span>
        )}
      </figcaption>
    </figure>
  )
}

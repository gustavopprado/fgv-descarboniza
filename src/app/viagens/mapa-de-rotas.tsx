/**
 * Mapa de corredores — CLAUDE.md §10.3.
 *
 * **A unidade aqui é o corredor entre regiões, não a rota par-a-par**, e isso é
 * escolha de leitura: uma linha por par de aeroportos vira um emaranhado sobre o
 * Sudeste e responde pior a pergunta da tela, que é para onde a empresa voa.
 *
 * **Nenhum corredor é suprimido por contagem de pessoas** (§3.1.2). Enquanto
 * havia supressão, o mapa calava justamente os corredores mais pesados — a
 * emissão deles já estava no total, e o que ficava escondido era de onde ela
 * vinha. Nada nesta tela diz quem voou; o que mudou é que a rota aparece.
 *
 * **O enquadramento sai do dado, e é por isso que existe o inserto.** Com o
 * intercontinental desenhado, a moldura passa a cobrir quase meio planeta, e o
 * conjunto doméstico — que concentra a maior parte dos trechos — vira um borrão
 * de poucos pixels. O quadro grande mostra o alcance; o inserto mostra o que o
 * alcance esmaga. Nenhum dos dois esconde o outro: o doméstico é desenhado nos
 * dois.
 */
import { inteiro, numero } from '@/lib/formato'
import { projetar, type Coordenada, type Projecao } from '@/lib/mapa'
import {
  CONTORNO_DAS_REGIOES,
  CONTORNO_DO_BRASIL,
  CONTORNO_DO_MUNDO,
} from '@/lib/mundo'
import { recortarAnel } from '@/lib/recorte'
import { ehDoBrasil } from '@/lib/regiao'
import type { CorredorNoMapa, MapaDeCorredores } from '@/server/consultas/inventario'

const MOLDURA = { largura: 640, altura: 420, margem: 40 }
const INSERTO = { largura: 212, altura: 152, margem: 18 }

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

/**
 * O que existe e não pôde ser desenhado.
 *
 * Restou um motivo só — aeroporto sem região ou sem coordenada —, e ele é dado
 * faltando de verdade. A supressão que antes morava nesta frase saiu (§3.1.2):
 * ela escondia dado que existia, e é coisa diferente.
 *
 * Continua num componente só porque aparece com mapa e sem mapa, e texto
 * duplicado é garantia de que um dos dois envelhece.
 */
export function NaoDesenhado({ mapa }: { mapa: MapaDeCorredores }) {
  if (mapa.semGeografia === 0) return null

  return (
    <>
      {inteiro(mapa.semGeografia)}{' '}
      {mapa.semGeografia === 1
        ? 'trecho ficou fora do desenho'
        : 'trechos ficaram fora do desenho'}{' '}
      por aeroporto sem região ou sem coordenada no cadastro — é dado faltando, e o
      valor continua somando em todos os totais desta tela.
    </>
  )
}

/* ------------------------------------------------------------- desenho */

/** Contorno de terra recortado no enquadramento, para não levar o mundo no HTML. */
function Terra({ projecao, chave }: { projecao: Projecao; chave: string }) {
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
function Brasil({ projecao, chave }: { projecao: Projecao; chave: string }) {
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
 * Os corredores.
 *
 * Corredor dentro da mesma região é um ponto, não uma linha: vira anel em volta
 * dela, com a espessura carregando o peso. Ida e volta são o mesmo recorte
 * (§10.3), então não há seta nem sentido a desenhar.
 */
function Corredores({
  corredores,
  projecao,
  maior,
  espessuraMaxima,
  chave,
}: {
  corredores: CorredorNoMapa[]
  projecao: Projecao
  maior: number
  espessuraMaxima: number
  chave: string
}) {
  return (
    <>
      {corredores.map((c, i) => {
        const de = projecao.projetar({
          latitude: c.origemLatitude,
          longitude: c.origemLongitude,
        })
        const para = projecao.projetar({
          latitude: c.destinoLatitude,
          longitude: c.destinoLongitude,
        })
        const espessura =
          maior > 0 ? 0.9 + (c.co2Kg / maior) * (espessuraMaxima - 0.9) : 0.9

        if (c.origemRegiao === c.destinoRegiao) {
          return (
            <circle
              key={`${chave}-${c.corredor}`}
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

        return (
          <path
            key={`${chave}-${c.corredor}`}
            className="desenhar"
            pathLength={1}
            style={
              {
                '--traco': '1',
                animationDelay: `${i * PASSO_MS}ms`,
              } as React.CSSProperties
            }
            d={`M${de.x.toFixed(1)},${de.y.toFixed(1)} Q${controleX.toFixed(1)},${controleY.toFixed(1)} ${para.x.toFixed(1)},${para.y.toFixed(1)}`}
            fill="none"
            stroke="#B0D9B1"
            strokeOpacity={0.85}
            strokeWidth={espessura}
            strokeLinecap="round"
          />
        )
      })}
    </>
  )
}

/**
 * Ponto e rótulo de cada região; uma região aparece em vários corredores.
 *
 * `rotular` existe por um defeito real do quadro global: os cinco rótulos
 * brasileiros caem num quadrado de poucos pixels e viram um borrão ilegível.
 * Com o inserto no ar, o quadro grande desenha os pontos domésticos e deixa os
 * nomes para lá — **o ponto continua desenhado**, então nada some do alcance; o
 * que sai é o rótulo que não cabia.
 */
function Regioes({
  corredores,
  projecao,
  atraso,
  escala = 1,
  rotular = () => true,
  href,
  aberta,
  chave,
}: {
  corredores: CorredorNoMapa[]
  projecao: Projecao
  atraso: number
  escala?: number
  rotular?: (regiao: string) => boolean
  /** Endereço que abre (ou fecha) a região. Sem ele, o ponto não é clicável. */
  href?: (regiao: string) => string
  aberta?: string | null
  chave: string
}) {
  const regioes = new Map<string, { x: number; y: number }>()
  for (const c of corredores) {
    regioes.set(
      c.origemRegiao,
      projecao.projetar({ latitude: c.origemLatitude, longitude: c.origemLongitude }),
    )
    regioes.set(
      c.destinoRegiao,
      projecao.projetar({ latitude: c.destinoLatitude, longitude: c.destinoLongitude }),
    )
  }

  return (
    <>
      {[...regioes.entries()].map(([regiao, ponto], i) => {
        const selecionada = aberta === regiao
        const marca = (
          <>
            <circle
              cx={ponto.x}
              cy={ponto.y}
              r={(selecionada ? 4 : 3) * escala}
              fill="#EAF4E8"
            />
            <circle
              cx={ponto.x}
              cy={ponto.y}
              r={(selecionada ? 10 : 7) * escala}
              fill="none"
              stroke="var(--color-fgv)"
              strokeWidth={(selecionada ? 2 : 1.2) * escala}
              strokeOpacity={selecionada ? 1 : 0.55}
            />
            {rotular(regiao) && (
              <text
                x={ponto.x + (selecionada ? 13 : 9) * escala}
                y={ponto.y - 6 * escala}
                fill={selecionada ? '#EAF4E8' : '#C6DCC2'}
                fontSize={9.5 * escala}
                fontWeight={selecionada ? 600 : 400}
              >
                {regiao}
              </text>
            )}
          </>
        )

        return (
          <g
            key={`${chave}-${regiao}`}
            className="surgir"
            style={{ animationDelay: `${Math.round(atraso + i * 40)}ms` }}
          >
            {href === undefined ? (
              marca
            ) : (
              // **Âncora de SVG, não componente de cliente.** O recorte fica no
              // endereço, como o seletor de ano: recarregar mantém a região
              // aberta e o endereço pode ser enviado a outra pessoa. E o ponto
              // continua clicável com JavaScript bloqueado.
              <a href={href(regiao)} className="cursor-pointer">
                <title>
                  {selecionada
                    ? `Fechar ${regiao}`
                    : `Ver o que aconteceu em ${regiao}`}
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

/* ----------------------------------------------------------------- mapa */

function coordenadasDe(corredores: CorredorNoMapa[]): Coordenada[] {
  return corredores.flatMap((c) => [
    { latitude: c.origemLatitude, longitude: c.origemLongitude },
    { latitude: c.destinoLatitude, longitude: c.destinoLongitude },
  ])
}

export function MapaDeRotasSvg({
  mapa,
  href,
  aberta = null,
}: {
  mapa: MapaDeCorredores
  href?: (regiao: string) => string
  aberta?: string | null
}) {
  const { corredores } = mapa
  if (corredores.length === 0) return null

  const projecao = projetar(coordenadasDe(corredores), MOLDURA)
  const maior = corredores.reduce((m, c) => Math.max(m, c.co2Kg), 0)

  // O conjunto doméstico é o das regiões do Brasil — a mesma classificação que o
  // cadastro do aeroporto já grava e que a tela de Método declara (§10.3). Não é
  // uma lista nova de lugares escrita aqui.
  const domesticos = corredores.filter(
    (c) => ehDoBrasil(c.origemRegiao) && ehDoBrasil(c.destinoRegiao),
  )
  const pontosDomesticos = coordenadasDe(domesticos).map((c) => projecao.projetar(c))
  const caixa =
    pontosDomesticos.length === 0
      ? null
      : {
          x1: Math.min(...pontosDomesticos.map((p) => p.x)),
          x2: Math.max(...pontosDomesticos.map((p) => p.x)),
          y1: Math.min(...pontosDomesticos.map((p) => p.y)),
          y2: Math.max(...pontosDomesticos.map((p) => p.y)),
        }

  // Duas condições, e as duas são necessárias: uma região só não tem o que
  // ampliar, e conjunto que já ocupa boa parte da moldura seria o mesmo desenho
  // repetido do lado.
  const regioesDomesticas = new Set(
    domesticos.flatMap((c) => [c.origemRegiao, c.destinoRegiao]),
  )
  const ampliar =
    caixa !== null &&
    regioesDomesticas.size >= 2 &&
    (caixa.x2 - caixa.x1) / MOLDURA.largura < LIMITE_DO_INSERTO &&
    (caixa.y2 - caixa.y1) / MOLDURA.altura < LIMITE_DO_INSERTO

  const projecaoDoInserto = ampliar ? projetar(coordenadasDe(domesticos), INSERTO) : null

  const atrasoDasRegioes = corredores.length * PASSO_MS + DURACAO_MS * 0.4
  const insertoX = MOLDURA.largura - INSERTO.largura - 10
  const insertoY = MOLDURA.altura - INSERTO.altura - 10

  return (
    <figure className="m-0">
      <div className="relative overflow-hidden rounded-xl bg-[var(--color-escuro-2)] p-1.5">
        <svg
          viewBox={`0 0 ${MOLDURA.largura} ${MOLDURA.altura}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`Mapa com ${corredores.length} corredores aéreos entre regiões.`}
        >
          <Terra projecao={projecao} chave="mundo" />
          <Brasil projecao={projecao} chave="mundo" />
          {/* Sem inserto, o quadro grande é que mostra o Brasil de perto. */}
          {!ampliar && domesticos.length > 0 && (
            <DivisasDasRegioes projecao={projecao} aberta={aberta} chave="mundo" />
          )}
          <Corredores
            corredores={corredores}
            projecao={projecao}
            maior={maior}
            espessuraMaxima={5.4}
            chave="mundo"
          />
          <Regioes
            corredores={corredores}
            projecao={projecao}
            atraso={atrasoDasRegioes}
            rotular={(regiao) => !ampliar || !ehDoBrasil(regiao)}
            href={href}
            aberta={aberta}
            chave="mundo"
          />

          {ampliar && caixa !== null && projecaoDoInserto !== null && (
            <>
              {/* O que o inserto amplia, marcado no quadro grande. */}
              <rect
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
              <svg
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
                <DivisasDasRegioes
                  projecao={projecaoDoInserto}
                  aberta={aberta}
                  chave="inserto"
                />
                <Corredores
                  corredores={domesticos}
                  projecao={projecaoDoInserto}
                  maior={maior}
                  espessuraMaxima={3.4}
                  chave="inserto"
                />
                <Regioes
                  corredores={domesticos}
                  projecao={projecaoDoInserto}
                  atraso={atrasoDasRegioes}
                  escala={0.8}
                  href={href}
                  aberta={aberta}
                  chave="inserto"
                />
                {/* No rodapé, não no topo: lá em cima ele cobria o ponto da
                    região mais ao norte, que a margem deixa colada na borda. */}
                <text
                  x={8}
                  y={INSERTO.altura - 8}
                  fill="#C6DCC2"
                  fontSize={9.5}
                >
                  Brasil, ampliado
                </text>
              </svg>
            </>
          )}
        </svg>

        <p className="absolute right-3 bottom-2.5 flex items-center gap-1.5 text-[11px] text-[#A9C6A5]">
          <span className="inline-block h-0.5 w-3.5 rounded-sm bg-[#B0D9B1]" />
          corredor aéreo
        </p>
      </div>

      {/* **Duas linhas, e a ordem é a leitura.** A primeira é a única coisa que
          alguém precisa saber para não ler o mapa errado; a segunda é recorte e
          procedência, que importam e não competem. A legenda antes disto tinha
          crescido até virar parágrafo, e parágrafo embaixo de desenho não se lê. */}
      <figcaption className="mt-3 max-w-[70ch] text-[12px] text-[var(--color-apoio)]">
        <strong className="font-medium text-[var(--color-tinta)]">
          O ponto não marca a posição exata de nada
        </strong>{' '}
        — é a média dos aeroportos que a empresa usa na região. Cada linha é um
        corredor, e a espessura acompanha a emissão.
        {href === undefined ? '' : ' Clique num ponto para ver o que aconteceu ali.'}
        <span className="mt-1.5 block text-[11.5px] text-[var(--color-apoio)]/80">
          Somente trechos aéreos; corredor dentro da mesma região vira anel.
          Contorno pelo Natural Earth, divisas das regiões pelo IBGE.{' '}
          <NaoDesenhado mapa={mapa} />
        </span>
      </figcaption>
    </figure>
  )
}

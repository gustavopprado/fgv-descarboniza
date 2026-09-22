/**
 * Radar de mobilidade — CLAUDE.md §3.1 e §11.2.
 *
 * Um ponto por funcionário, **sem nenhum dado associado**: sem tooltip, sem
 * clique, sem `title`, sem atributo de dado. O SVG recebe apenas coordenadas já
 * calculadas, e o que produz as coordenadas (`src/lib/radar.ts`) só conhece
 * distâncias.
 *
 * **O que é clicável é a faixa entre dois anéis, e essa distinção é a regra.**
 * Clicar num ponto mostraria o modal e a distância de uma pessoa — que é
 * exatamente "isolar um indivíduo", e é o que a §3.1.1 proíbe: com as distâncias
 * quase todas distintas, o par (distância, modal) identifica tão bem quanto um
 * nome. A faixa responde à mesma pergunta sem isso — **quem mora nesta distância
 * vai de quê?** —, em agregado e com a supressão de grupo pequeno por cima. Os
 * pontos continuam mudos e recebem `pointer-events: none`: o clique atravessa
 * até o anel embaixo.
 *
 * A aparência segue o protótipo — anéis rotulados, raios, varredura e pontos
 * maiores e mais claros perto do centro. **A decisão de seguir o protótipo
 * também nos raios e na varredura é do Gustavo**, depois de eu ter argumentado
 * contra os dois: eles sugerem que o ângulo significa alguma coisa, e aqui ele
 * não significa (§3.1). A contrapartida combinada é a legenda: ela diz, em duas
 * frases separadas, que a direção não quer dizer nada e que a varredura só
 * escolhe a ordem em que os pontos acendem.
 *
 * Tudo em CSS. O atraso de cada ponto vem do ângulo dele, calculado no
 * servidor: sem script, o radar aparece pronto em vez de vazio — e a faixa
 * continua clicável, porque quem a abre é um endereço, não um manipulador.
 */
import { numero } from '@/lib/formato'
import { ANEIS_DO_RADAR, montarRadar } from '@/lib/radar'
import type { FaixaDoRadar } from '@/server/consultas/inventario'

const RAIO = 150
const MARGEM = 22
const LADO = (RAIO + MARGEM) * 2

/** Uma volta da varredura. O mesmo valor está em `.varrer`, no globals.css. */
const VOLTA_MS = 2200

/** Abertura da cunha, em radianos. */
const ABERTURA = 0.6

/** Até aqui o ponto é desenhado maior e mais claro, como no protótipo. */
const FAIXA_PROXIMA = 0.4

const RAIOS_DA_GRADE = 8

/**
 * Teto de largura do desenho, em pixels de tela.
 *
 * **`viewBox` é escala, não tamanho** — e num desenho quadrado isso quer dizer
 * que cada pixel de largura é também um de altura. Com a casca crescendo com a
 * tela (ver `casca.tsx`), a coluna da esquerda chega a 1293px num monitor de
 * 2560, e o radar viraria um quadrado de 1293px: mais alto que a tela.
 *
 * O valor é o tamanho em que ele é desenhado hoje, e essa é a razão de ser
 * exatamente este número: os anéis, o corpo do ponto, a faixa próxima e a
 * legenda foram calibrados nessa escala. Pixel a mais aqui não acrescenta
 * informação, só empurra o resto da página para baixo. O desenho fica centrado
 * no painel, com branco simétrico em volta — decisão aceita.
 */
const LARGURA_MAXIMA = 615

export function Radar({
  distanciasKm,
  faixas,
  aberta,
  enderecoDaFaixa,
}: {
  distanciasKm: number[]
  faixas: FaixaDoRadar[]
  /** Índice da faixa aberta, ou `null`. Já conferido contra o que existe. */
  aberta: number | null
  /** Endereço que abre uma faixa; `null` fecha o recorte. */
  enderecoDaFaixa: (indice: number | null) => string
}) {
  const { pontos, aneis, distanciaMaximaKm } = montarRadar(distanciasKm, {
    raio: RAIO,
    aneis: ANEIS_DO_RADAR,
  })

  // A cunha varre no sentido horário a partir do eixo x positivo, que é de onde
  // o ângulo dos pontos também é medido.
  const cunha = [
    'M 0 0',
    `L ${RAIO} 0`,
    `A ${RAIO} ${RAIO} 0 0 0 ${(Math.cos(-ABERTURA) * RAIO).toFixed(2)} ${(Math.sin(-ABERTURA) * RAIO).toFixed(2)}`,
    'Z',
  ].join(' ')

  // O raio de cada faixa sai do anel que a fecha: a faixa `i` vai do anel
  // anterior até o anel `i`. É a mesma correspondência que a camada usou para
  // agregar, e ela só se sustenta porque os dois lados leem `limitesDeAnel`.
  const raioDoAnel = (i: number): number => aneis[i]?.raio ?? RAIO

  return (
    <figure className="m-0" style={{ maxWidth: LARGURA_MAXIMA }}>
      <div className="overflow-hidden rounded-xl bg-[var(--color-escuro-2)] p-1.5">
        <svg
          viewBox={`0 0 ${LADO} ${LADO}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`Radar de distância: ${pontos.length} pontos, um por pessoa, do centro até ${numero(distanciaMaximaKm)} quilômetros.`}
        >
          <defs>
            <linearGradient id="cunha-do-radar" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#7BC258" stopOpacity="0" />
              <stop offset="1" stopColor="#7BC258" stopOpacity="0.38" />
            </linearGradient>
          </defs>

          <g transform={`translate(${LADO / 2} ${LADO / 2})`}>
            <g pointerEvents="none">
              {Array.from({ length: RAIOS_DA_GRADE }, (_, i) => {
                const angulo = (i * Math.PI * 2) / RAIOS_DA_GRADE
                return (
                  <line
                    key={angulo}
                    x1={0}
                    y1={0}
                    x2={Math.cos(angulo) * RAIO}
                    y2={Math.sin(angulo) * RAIO}
                    stroke="#40603C"
                    strokeWidth={0.7}
                  />
                )
              })}

              {aneis.map((anel, i) => (
                <circle
                  key={anel.raio}
                  r={anel.raio}
                  fill="none"
                  stroke={aberta === i ? '#7BC258' : '#4E7049'}
                  strokeWidth={anel.naBorda || aberta === i ? 1 : 0.8}
                />
              ))}

              <path className="varrer" d={cunha} fill="url(#cunha-do-radar)" />
            </g>

            {/* As faixas clicáveis, entre dois anéis. Vêm antes dos rótulos e
                dos pontos para ficarem por baixo deles no desenho — e o clique
                chega aqui porque o que está por cima não recebe ponteiro. */}
            {faixas.map((faixa) => {
              const externo = raioDoAnel(faixa.indice)
              const interno = faixa.indice === 0 ? 0 : raioDoAnel(faixa.indice - 1)
              const espessura = externo - interno
              if (!(espessura > 0)) return null
              const estaAberta = aberta === faixa.indice
              return (
                <a
                  key={faixa.indice}
                  href={enderecoDaFaixa(estaAberta ? null : faixa.indice)}
                  aria-label={`De ${numero(faixa.deKm, 0)} a ${numero(faixa.ateKm, 0)} quilômetros: ${faixa.pessoas} ${faixa.pessoas === 1 ? 'pessoa' : 'pessoas'}.`}
                >
                  <circle
                    className="faixa-do-radar"
                    data-aberta={estaAberta ? 'sim' : 'nao'}
                    r={interno + espessura / 2}
                    fill="none"
                    strokeWidth={espessura}
                  />
                </a>
              )
            })}

            <g pointerEvents="none">
              {aneis.map((anel) => (
                <text
                  key={anel.raio}
                  x={4}
                  y={-anel.raio + 11}
                  fill={anel.naBorda ? '#C6DCC2' : '#9FBB9B'}
                  fontSize={9}
                  /* O rótulo cai sobre a nuvem de pontos e sobre os raios da
                     grade. Um contorno na cor do fundo o descola sem precisar
                     de um retângulo atrás, que apagaria pontos do desenho. */
                  stroke="var(--color-escuro-2)"
                  strokeWidth={2.6}
                  paintOrder="stroke"
                >
                  {numero(anel.distanciaKm, 0)} km
                </text>
              ))}

              {pontos.map((ponto, i) => {
                const perto = Math.hypot(ponto.x, ponto.y) < RAIO * FAIXA_PROXIMA
                return (
                  <circle
                    key={i}
                    className="surgir"
                    style={{
                      // O ponto acende quando a cunha passa por ele.
                      animationDelay: `${Math.round((ponto.angulo / (Math.PI * 2)) * VOLTA_MS)}ms`,
                    }}
                    cx={ponto.x}
                    cy={ponto.y}
                    r={perto ? 2.6 : 2.1}
                    fill={perto ? '#D0E7D2' : '#79AC78'}
                  />
                )
              })}

              {/* A fábrica, origem de toda distância. */}
              <circle r={5} fill="var(--color-fgv)" />
              <text x={11} y={4} fill="#9FBB9B" fontSize={10}>
                Fábrica
              </text>
            </g>
          </g>
        </svg>
      </div>

      <figcaption className="mt-3 max-w-[70ch] text-[12px] text-[var(--color-apoio)]">
        {/* **As duas frases que ficam são as que impedem ler errado** (§3.1.1),
            e é por isso que elas não foram para o botão de informações: quem
            precisa delas é justamente quem não vai clicar. O resto — o que o
            ponto carrega, a varredura, a supressão — está lá. */}
        A distância se lê no anel, não no raio: a escala é comprimida para a nuvem
        não empilhar no centro.{' '}
        <strong className="font-medium text-[var(--color-tinta)]">
          A direção não significa nada
        </strong>
        : o ângulo serve só para os pontos não se empilharem.{' '}
        <span className="text-[var(--color-apoio)]/85">
          Clique numa faixa entre dois anéis para ver quem mora ali e como se
          desloca — o ponto em si não abre nada.
        </span>
      </figcaption>
    </figure>
  )
}

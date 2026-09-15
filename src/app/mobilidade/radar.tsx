/**
 * Radar de mobilidade — CLAUDE.md §3.1 e §10.2.
 *
 * Um ponto por funcionário, **sem nenhum dado associado**: sem tooltip, sem
 * clique, sem `title`, sem atributo de dado. O SVG recebe apenas coordenadas já
 * calculadas, e o que produz as coordenadas (`src/lib/radar.ts`) só conhece
 * distâncias.
 *
 * Três diferenças em relação ao protótipo, e as três são a mesma decisão — o
 * ângulo aqui não significa nada (§3.1), e nada no desenho pode sugerir que
 * significa:
 *
 *  - **sem os raios partindo do centro.** Eles desenham uma rosa dos ventos, e
 *    rosa dos ventos convida à leitura de direção;
 *  - **sem a varredura giratória.** A varredura do protótipo revela os pontos
 *    conforme gira, ou seja, **anima a dimensão angular** — justamente a que não
 *    carrega informação. É a animação mais bonita do protótipo e a que mais
 *    reforça a leitura errada;
 *  - **os pontos aparecem do centro para fora**, na ordem da distância. A
 *    animação continua existindo, e passa a encenar a única dimensão que o
 *    desenho de fato tem.
 *
 * Os anéis ficam: eles medem distância.
 */
import { numero } from '@/lib/formato'
import { montarRadar } from '@/lib/radar'

const RAIO = 150
const MARGEM = 22
const LADO = (RAIO + MARGEM) * 2

/** Duração total da revelação; cada ponto entra na sua fatia dela. */
const REVELACAO_MS = 1400

export function Radar({ distanciasKm }: { distanciasKm: number[] }) {
  const { pontos, aneis, distanciaMaximaKm } = montarRadar(distanciasKm, {
    raio: RAIO,
    aneis: 4,
  })

  // `radarDistanciasKm` chega ordenada por distância, então a ordem do ponto na
  // lista é a ordem em que ele deve aparecer: do mais perto ao mais longe.
  const passo = pontos.length > 1 ? REVELACAO_MS / pontos.length : 0

  return (
    <figure className="m-0">
      <div className="overflow-hidden rounded-xl bg-[var(--color-escuro-2)] p-1.5">
        <svg
          viewBox={`0 0 ${LADO} ${LADO}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`Radar de distância: ${pontos.length} pontos, um por pessoa, do centro até ${numero(distanciaMaximaKm)} quilômetros.`}
        >
          <g transform={`translate(${LADO / 2} ${LADO / 2})`}>
            {aneis.map((anel) => (
              <g key={anel.raio}>
                <circle r={anel.raio} fill="none" stroke="#4E7049" strokeWidth={0.8} />
                <text x={4} y={-anel.raio + 11} fill="#9FBB9B" fontSize={9}>
                  {numero(anel.distanciaKm, 0)} km
                </text>
              </g>
            ))}

            {pontos.map((ponto, i) => (
              <circle
                key={i}
                className="surgir"
                style={{ animationDelay: `${Math.round(i * passo)}ms` }}
                cx={ponto.x}
                cy={ponto.y}
                r={2.4}
                fill="#B0D9B1"
                fillOpacity={0.85}
              />
            ))}

            {/* A fábrica, origem de toda distância. */}
            <circle r={5} fill="var(--color-fgv)" />
            <text x={11} y={4} fill="#9FBB9B" fontSize={10}>
              Fábrica
            </text>
          </g>
        </svg>
      </div>

      <figcaption className="mt-3 text-[12px] text-[var(--color-apoio)]">
        Cada ponto é uma pessoa e a distância até o centro é o deslocamento até a
        fábrica.{' '}
        <strong className="font-medium text-[var(--color-tinta)]">
          A direção não significa nada
        </strong>
        : a pesquisa não coleta o sentido do trajeto, e o ângulo serve só para os
        pontos não se empilharem. Nenhum ponto carrega informação de quem é.
      </figcaption>
    </figure>
  )
}

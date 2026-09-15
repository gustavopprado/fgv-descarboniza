/**
 * Radar de mobilidade — CLAUDE.md §3.1 e §10.2.
 *
 * Um ponto por funcionário, **sem nenhum dado associado**: sem tooltip, sem
 * clique, sem `title`, sem atributo de dado. O SVG recebe apenas coordenadas já
 * calculadas, e o que produz as coordenadas (`src/lib/radar.ts`) só conhece
 * distâncias.
 *
 * O ângulo não significa nada e a legenda diz isso. Sem esse aviso, um radar
 * convida a leitura de mapa — e a pesquisa não coleta direção nenhuma.
 */
import { numero } from '@/lib/formato'
import { montarRadar } from '@/lib/radar'

const RAIO = 120
const MARGEM = 16
const LADO = (RAIO + MARGEM) * 2

export function Radar({ distanciasKm }: { distanciasKm: number[] }) {
  const { pontos, aneis, distanciaMaximaKm } = montarRadar(distanciasKm, {
    raio: RAIO,
    aneis: 3,
  })

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${LADO} ${LADO}`}
        className="h-auto w-full max-w-sm"
        role="img"
        aria-label={`Radar de distância: ${pontos.length} pontos, um por pessoa, do centro até ${numero(distanciaMaximaKm)} quilômetros.`}
      >
        <g transform={`translate(${LADO / 2} ${LADO / 2})`}>
          {aneis.map((anel) => (
            <g key={anel.raio}>
              <circle
                r={anel.raio}
                fill="none"
                stroke="var(--color-folha-300)"
                strokeWidth={1}
              />
              <text
                x={4}
                y={-anel.raio + 12}
                className="fill-[var(--color-folha-900)] text-[9px] opacity-45"
              >
                {numero(anel.distanciaKm, 0)} km
              </text>
            </g>
          ))}

          {/* A fábrica, origem de toda distância. */}
          <circle r={3.5} fill="var(--color-fgv)" />

          {pontos.map((ponto, i) => (
            <circle
              key={i}
              cx={ponto.x}
              cy={ponto.y}
              r={3}
              fill="var(--color-folha-700)"
              fillOpacity={0.75}
            />
          ))}
        </g>
      </svg>

      <figcaption className="mt-3 max-w-sm text-xs text-[var(--color-folha-900)]/55">
        Cada ponto é uma pessoa e a distância até o centro é o deslocamento até a
        fábrica. <strong className="font-medium">A direção não significa nada</strong>
        : a pesquisa não coleta o sentido do trajeto, e o ângulo serve só para os
        pontos não se empilharem. Nenhum ponto carrega informação de quem é.
      </figcaption>
    </figure>
  )
}

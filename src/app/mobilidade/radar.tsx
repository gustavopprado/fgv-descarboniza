/**
 * Radar de mobilidade — CLAUDE.md §3.1 e §10.2.
 *
 * Um ponto por funcionário, **sem nenhum dado associado**: sem tooltip, sem
 * clique, sem `title`, sem atributo de dado. O SVG recebe apenas coordenadas já
 * calculadas, e o que produz as coordenadas (`src/lib/radar.ts`) só conhece
 * distâncias.
 *
 * Duas diferenças em relação ao protótipo, e as duas são a mesma decisão:
 *
 *  - o ângulo não significa nada, e a legenda diz isso (§3.1);
 *  - **não há raios partindo do centro.** O protótipo desenha oito, e eles são
 *    enfeite — mas enfeite que sugere rosa dos ventos, e uma rosa dos ventos
 *    convida exatamente a leitura de direção que esta tela não pode oferecer.
 *    Os anéis ficam, porque eles medem distância, que é o que há.
 */
import { numero } from '@/lib/formato'
import { montarRadar } from '@/lib/radar'

const RAIO = 150
const MARGEM = 22
const LADO = (RAIO + MARGEM) * 2

export function Radar({ distanciasKm }: { distanciasKm: number[] }) {
  const { pontos, aneis, distanciaMaximaKm } = montarRadar(distanciasKm, {
    raio: RAIO,
    aneis: 4,
  })

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

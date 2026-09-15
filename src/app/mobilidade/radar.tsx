/**
 * Radar de mobilidade — CLAUDE.md §3.1 e §10.2.
 *
 * Um ponto por funcionário, **sem nenhum dado associado**: sem tooltip, sem
 * clique, sem `title`, sem atributo de dado. O SVG recebe apenas coordenadas já
 * calculadas, e o que produz as coordenadas (`src/lib/radar.ts`) só conhece
 * distâncias.
 *
 * **A varredura é do protótipo, e a decisão de mantê-la é do Gustavo.** Eu havia
 * argumentado contra: ela revela os pontos conforme gira, ou seja, anima a
 * dimensão angular — que aqui não carrega informação (§3.1) —, e animar uma
 * dimensão vazia convida a leitura de direção que este desenho não pode
 * oferecer. Ficou, e a contrapartida combinada é a legenda trabalhar mais: ela
 * diz, em duas frases separadas, que o ângulo não significa nada e que a
 * varredura é enfeite.
 *
 * Os raios partindo do centro continuam fora: eles desenham uma rosa dos ventos
 * permanente, enquanto a varredura passa e some.
 *
 * Tudo em CSS. O atraso de cada ponto vem do ângulo dele, calculado no
 * servidor: sem script, o radar aparece pronto em vez de vazio.
 */
import { numero } from '@/lib/formato'
import { montarRadar } from '@/lib/radar'

const RAIO = 150
const MARGEM = 22
const LADO = (RAIO + MARGEM) * 2

/** Uma volta da varredura. O mesmo valor está em `.varrer`, no globals.css. */
const VOLTA_MS = 2200

/** Abertura da cunha, em radianos. */
const ABERTURA = 0.6

export function Radar({ distanciasKm }: { distanciasKm: number[] }) {
  const { pontos, aneis, distanciaMaximaKm } = montarRadar(distanciasKm, {
    raio: RAIO,
    aneis: 4,
  })

  // A cunha varre no sentido horário a partir do eixo x positivo, que é de onde
  // o ângulo dos pontos também é medido.
  const cunha = [
    `M 0 0`,
    `L ${RAIO} 0`,
    `A ${RAIO} ${RAIO} 0 0 0 ${(Math.cos(-ABERTURA) * RAIO).toFixed(2)} ${(Math.sin(-ABERTURA) * RAIO).toFixed(2)}`,
    'Z',
  ].join(' ')

  return (
    <figure className="m-0">
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
            {aneis.map((anel) => (
              <g key={anel.raio}>
                <circle r={anel.raio} fill="none" stroke="#4E7049" strokeWidth={0.8} />
                <text x={4} y={-anel.raio + 11} fill="#9FBB9B" fontSize={9}>
                  {numero(anel.distanciaKm, 0)} km
                </text>
              </g>
            ))}

            <path className="varrer" d={cunha} fill="url(#cunha-do-radar)" />

            {pontos.map((ponto, i) => (
              <circle
                key={i}
                className="surgir"
                style={{
                  // O ponto acende quando a cunha passa por ele.
                  animationDelay: `${Math.round((ponto.angulo / (Math.PI * 2)) * VOLTA_MS)}ms`,
                }}
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
        Cada ponto é uma pessoa, e a distância até o centro é o deslocamento até a
        fábrica.{' '}
        <strong className="font-medium text-[var(--color-tinta)]">
          A direção não significa nada
        </strong>
        : a pesquisa não pergunta para que lado a pessoa mora, e o ângulo serve só
        para os pontos não se empilharem — dois pontos lado a lado podem ser
        vizinhos ou morar em extremos opostos da cidade.{' '}
        <strong className="font-medium text-[var(--color-tinta)]">
          A varredura é enfeite
        </strong>
        : ela só escolhe a ordem em que os pontos acendem. Nenhum ponto carrega
        informação de quem é.
      </figcaption>
    </figure>
  )
}

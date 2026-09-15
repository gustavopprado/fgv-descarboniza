/**
 * Mapa de rotas — CLAUDE.md §10.3.
 *
 * Linhas entre aeroportos, em posição real de latitude e longitude, **sem base
 * cartográfica**: o que a tela mostra é a geometria das rotas, não um mapa de
 * navegação, e a legenda diz isso.
 *
 * O que chega aqui já passou pela supressão da §3.1 — rota voada por pouca
 * gente não vira linha, porque a linha apontaria para essa gente. Nenhuma rota
 * carrega quem voou.
 *
 * Como no protótipo, as rotas se desenham uma a uma e os aeroportos aparecem
 * depois. É animação de CSS, com o atraso calculado no servidor: se o script
 * não rodar, o mapa aparece pronto em vez de vazio.
 */
import { numero } from '@/lib/formato'
import { projetar } from '@/lib/mapa'
import type { MapaDeRotas } from '@/server/consultas/inventario'

const MOLDURA = { largura: 640, altura: 420, margem: 28 }

/** Atraso entre o começo de uma rota e o da seguinte. */
const PASSO_DA_ROTA_MS = 140
const DURACAO_DA_ROTA_MS = 1600

export function MapaDeRotasSvg({ mapa }: { mapa: MapaDeRotas }) {
  const { rotas } = mapa

  if (rotas.length === 0) {
    return null
  }

  const coordenadas = rotas.flatMap((r) => [
    { latitude: r.origemLatitude, longitude: r.origemLongitude },
    { latitude: r.destinoLatitude, longitude: r.destinoLongitude },
  ])
  const projecao = projetar(coordenadas, MOLDURA)
  const maior = rotas.reduce((m, r) => Math.max(m, r.co2Kg), 0)

  // Um aeroporto aparece em várias rotas; o ponto e o rótulo saem uma vez só.
  const aeroportos = new Map<string, { x: number; y: number }>()
  for (const rota of rotas) {
    aeroportos.set(
      rota.origem,
      projecao.projetar({
        latitude: rota.origemLatitude,
        longitude: rota.origemLongitude,
      }),
    )
    aeroportos.set(
      rota.destino,
      projecao.projetar({
        latitude: rota.destinoLatitude,
        longitude: rota.destinoLongitude,
      }),
    )
  }

  // Os aeroportos entram depois da última rota começar a ser desenhada.
  const atrasoDosAeroportos =
    rotas.length * PASSO_DA_ROTA_MS + DURACAO_DA_ROTA_MS * 0.4

  return (
    <figure className="m-0">
      <div className="overflow-hidden rounded-xl bg-[var(--color-escuro-2)] p-1.5">
        <svg
          viewBox={`0 0 ${MOLDURA.largura} ${MOLDURA.altura}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`Mapa com ${rotas.length} rotas aéreas entre ${aeroportos.size} aeroportos.`}
        >
          {rotas.map((rota, i) => {
            const de = projecao.projetar({
              latitude: rota.origemLatitude,
              longitude: rota.origemLongitude,
            })
            const para = projecao.projetar({
              latitude: rota.destinoLatitude,
              longitude: rota.destinoLongitude,
            })
            // A espessura carrega a emissão da rota; é a única variável visual
            // que codifica número, e ela está na legenda.
            const espessura = maior > 0 ? 0.8 + (rota.co2Kg / maior) * 4 : 1
            // O tracejado precisa ter o tamanho exato da linha, senão o desenho
            // progressivo repete o padrão ou deixa sobra.
            const comprimento = Math.hypot(para.x - de.x, para.y - de.y)

            return (
              <line
                key={`${rota.origem}-${rota.destino}`}
                className="desenhar"
                style={
                  {
                    // Como texto: propriedade personalizada não recebe
                    // unidade automática, e o valor entra no CSS como veio.
                    '--traco': `${comprimento}`,
                    animationDelay: `${i * PASSO_DA_ROTA_MS}ms`,
                  } as React.CSSProperties
                }
                x1={de.x}
                y1={de.y}
                x2={para.x}
                y2={para.y}
                stroke="#B0D9B1"
                strokeOpacity={0.8}
                strokeWidth={espessura}
                strokeLinecap="round"
              />
            )
          })}

          {[...aeroportos.entries()].map(([iata, ponto], i) => (
            <g
              key={iata}
              className="surgir"
              style={{ animationDelay: `${Math.round(atrasoDosAeroportos + i * 40)}ms` }}
            >
              <circle cx={ponto.x} cy={ponto.y} r={2.6} fill="#EAF4E8" />
              <circle
                cx={ponto.x}
                cy={ponto.y}
                r={6}
                fill="none"
                stroke="var(--color-fgv)"
                strokeWidth={1.2}
                strokeOpacity={0.55}
              />
              <text x={ponto.x + 8} y={ponto.y - 6} fill="#C6DCC2" fontSize={9}>
                {iata}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <figcaption className="mt-3 text-[12px] text-[var(--color-apoio)]">
        Posições reais de latitude e longitude, sem base cartográfica: o desenho
        mostra a geometria das rotas, não um mapa de navegação. A espessura da
        linha acompanha a emissão da rota — a mais grossa soma {numero(maior)} kg
        CO₂. Somente trechos aéreos.
      </figcaption>
    </figure>
  )
}

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
 */
import { numero } from '@/lib/formato'
import { projetar } from '@/lib/mapa'
import type { MapaDeRotas } from '@/server/consultas/inventario'

const MOLDURA = { largura: 640, altura: 420, margem: 28 }

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
    aeroportos.set(rota.origem, projecao.projetar({
      latitude: rota.origemLatitude,
      longitude: rota.origemLongitude,
    }))
    aeroportos.set(rota.destino, projecao.projetar({
      latitude: rota.destinoLatitude,
      longitude: rota.destinoLongitude,
    }))
  }

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${MOLDURA.largura} ${MOLDURA.altura}`}
        className="h-auto w-full rounded-md border border-[var(--color-folha-300)] bg-[var(--color-folha-300)]/15"
        role="img"
        aria-label={`Mapa com ${rotas.length} rotas aéreas entre ${aeroportos.size} aeroportos.`}
      >
        {rotas.map((rota) => {
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
          return (
            <line
              key={`${rota.origem}-${rota.destino}`}
              x1={de.x}
              y1={de.y}
              x2={para.x}
              y2={para.y}
              stroke="var(--color-folha-700)"
              strokeOpacity={0.55}
              strokeWidth={espessura}
              strokeLinecap="round"
            />
          )
        })}

        {[...aeroportos.entries()].map(([iata, ponto]) => (
          <g key={iata}>
            <circle cx={ponto.x} cy={ponto.y} r={3} fill="var(--color-folha-900)" />
            <text
              x={ponto.x + 5}
              y={ponto.y - 5}
              className="fill-[var(--color-folha-900)] text-[9px] opacity-70"
            >
              {iata}
            </text>
          </g>
        ))}
      </svg>

      <figcaption className="mt-3 text-xs text-[var(--color-folha-900)]/55">
        Posições reais de latitude e longitude, sem base cartográfica: o desenho
        mostra a geometria das rotas, não um mapa de navegação. A espessura da
        linha acompanha a emissão da rota — a mais grossa soma {numero(maior)} kg
        CO₂. Somente trechos aéreos.
      </figcaption>
    </figure>
  )
}

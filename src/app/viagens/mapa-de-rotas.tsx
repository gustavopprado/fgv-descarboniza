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
 *
 * **O contorno dos continentes** vem de `src/lib/mundo.ts`, gerado por script a
 * partir de dado de domínio público — a procedência está lá. Só os anéis que
 * encostam no enquadramento são desenhados: num mapa de rotas domésticas, levar
 * o mundo inteiro no HTML para o navegador recortar seria desperdício puro.
 */
import { numero } from '@/lib/formato'
import { projetar } from '@/lib/mapa'
import { CONTORNO_DO_MUNDO } from '@/lib/mundo'
import { recortarAnel } from '@/lib/recorte'
import type { MapaDeRotas } from '@/server/consultas/inventario'

const MOLDURA = { largura: 640, altura: 420, margem: 28 }

/** Atraso entre o começo de uma rota e o da seguinte. */
const PASSO_DA_ROTA_MS = 140
const DURACAO_DA_ROTA_MS = 1600

/** Quanto o arco se afasta da reta, em fração do próprio comprimento. */
const CURVATURA = 0.17

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

  // O contorno só precisa do que cabe no enquadramento, e **recortado**: a
  // América do Sul inteira são milhares de vértices, quase todos fora da
  // moldura, e sem o recorte eles viajariam no HTML para o navegador descartar.
  // A folga evita costa rente à borda sumindo por um décimo de grau.
  const { oeste, leste, sul, norte } = projecao.limites
  const folga = Math.max(leste - oeste, norte - sul) * 0.15
  const enquadramento = {
    oeste: oeste - folga,
    leste: leste + folga,
    sul: sul - folga,
    norte: norte + folga,
  }
  const terra = CONTORNO_DO_MUNDO.filter(
    (anel) =>
      anel.caixa[0] <= enquadramento.leste &&
      anel.caixa[2] >= enquadramento.oeste &&
      anel.caixa[1] <= enquadramento.norte &&
      anel.caixa[3] >= enquadramento.sul,
  )
    .map((anel) => recortarAnel(anel.pontos, enquadramento))
    .filter((anel) => anel.length > 0)

  // Os aeroportos entram depois da última rota começar a ser desenhada.
  const atrasoDosAeroportos =
    rotas.length * PASSO_DA_ROTA_MS + DURACAO_DA_ROTA_MS * 0.4

  return (
    <figure className="m-0">
      <div className="relative overflow-hidden rounded-xl bg-[var(--color-escuro-2)] p-1.5">
        <svg
          viewBox={`0 0 ${MOLDURA.largura} ${MOLDURA.altura}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`Mapa com ${rotas.length} rotas aéreas entre ${aeroportos.size} aeroportos.`}
        >
          {terra.map((anel, i) => (
            <path
              key={i}
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

            // Arco, não reta, como no protótipo: duas rotas entre os mesmos
            // pontos deixam de se sobrepor, e o traço fica legível sobre o
            // contorno da terra. A curvatura é perpendicular ao trecho e
            // proporcional a ele, então rota curta encurva pouco.
            const dx = para.x - de.x
            const dy = para.y - de.y
            const comprimento = Math.hypot(dx, dy)
            const meioX = (de.x + para.x) / 2
            const meioY = (de.y + para.y) / 2
            const controleX = meioX - (dy / (comprimento || 1)) * comprimento * CURVATURA
            const controleY = meioY + (dx / (comprimento || 1)) * comprimento * CURVATURA

            return (
              <path
                key={`${rota.origem}-${rota.destino}`}
                className="desenhar"
                // `pathLength` normaliza o comprimento do traço para 1, então o
                // tracejado do desenho progressivo não precisa do comprimento
                // real do arco — que só se obtém por integração numérica.
                pathLength={1}
                style={
                  {
                    '--traco': '1',
                    animationDelay: `${i * PASSO_DA_ROTA_MS}ms`,
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

        <p className="absolute right-3 bottom-2.5 flex items-center gap-1.5 text-[11px] text-[#A9C6A5]">
          <span className="inline-block h-0.5 w-3.5 rounded-sm bg-[#B0D9B1]" />
          rota aérea
        </p>
      </div>

      <figcaption className="mt-3 text-[12px] text-[var(--color-apoio)]">
        Projeção equirretangular, enquadrada nas rotas do período. A espessura da
        linha acompanha a emissão da rota — a mais grossa soma {numero(maior)} kg
        CO₂. Somente trechos aéreos. O contorno da terra é de base cartográfica
        de domínio público, em escala grosseira: ele situa as rotas, não serve
        para medir nada.
      </figcaption>
    </figure>
  )
}

/**
 * Mapa de corredores — CLAUDE.md §10.3.
 *
 * **A unidade aqui é o corredor entre regiões, não a rota par-a-par**, e a
 * diferença é de restrição, não de gosto. No mapa, uma linha precisa de dois
 * lugares: o balde de recortes suprimidos não tem lugar nenhum e por isso
 * simplesmente sumiria do desenho, levando junto o peso que ele carrega. Com o
 * corredor, recortes que sozinhos não chegavam ao limite somam população
 * suficiente para serem desenhados — **sem afrouxar a supressão**, que continua
 * contando pessoas.
 *
 * O que ainda não cabe no desenho vira número na legenda, nunca silêncio: mapa
 * com poucas linhas e sem explicação é lido como falha de carga.
 *
 * Nenhum corredor carrega quem voou.
 */
import { numero, proporcao } from '@/lib/formato'
import { projetar } from '@/lib/mapa'
import { CONTORNO_DO_MUNDO } from '@/lib/mundo'
import { recortarAnel } from '@/lib/recorte'
import type { MapaDeCorredores } from '@/server/consultas/inventario'

const MOLDURA = { largura: 640, altura: 420, margem: 40 }

/** Atraso entre o começo de um corredor e o do seguinte. */
const PASSO_MS = 140
const DURACAO_MS = 1600

/** Quanto o arco se afasta da reta, em fração do próprio comprimento. */
const CURVATURA = 0.17

export function MapaDeRotasSvg({ mapa }: { mapa: MapaDeCorredores }) {
  const { corredores } = mapa

  if (corredores.length === 0) {
    return null
  }

  const coordenadas = corredores.flatMap((c) => [
    { latitude: c.origemLatitude, longitude: c.origemLongitude },
    { latitude: c.destinoLatitude, longitude: c.destinoLongitude },
  ])
  const projecao = projetar(coordenadas, MOLDURA)
  const maior = corredores.reduce((m, c) => Math.max(m, c.co2Kg), 0)

  // Uma região aparece em vários corredores; o ponto e o rótulo saem uma vez só.
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

  const atrasoDasRegioes = corredores.length * PASSO_MS + DURACAO_MS * 0.4

  return (
    <figure className="m-0">
      <div className="relative overflow-hidden rounded-xl bg-[var(--color-escuro-2)] p-1.5">
        <svg
          viewBox={`0 0 ${MOLDURA.largura} ${MOLDURA.altura}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`Mapa com ${corredores.length} corredores entre ${regioes.size} regiões.`}
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

          {corredores.map((c, i) => {
            const de = projecao.projetar({
              latitude: c.origemLatitude,
              longitude: c.origemLongitude,
            })
            const para = projecao.projetar({
              latitude: c.destinoLatitude,
              longitude: c.destinoLongitude,
            })
            const espessura = maior > 0 ? 1 + (c.co2Kg / maior) * 4.5 : 1

            // Corredor dentro da mesma região é um ponto, não uma linha: vira um
            // anel em volta dela, com a espessura carregando o peso.
            if (c.origemRegiao === c.destinoRegiao) {
              return (
                <circle
                  key={c.corredor}
                  className="surgir"
                  style={{ animationDelay: `${i * PASSO_MS}ms` }}
                  cx={de.x}
                  cy={de.y}
                  r={9}
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
                key={c.corredor}
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

          {[...regioes.entries()].map(([regiao, ponto], i) => (
            <g
              key={regiao}
              className="surgir"
              style={{ animationDelay: `${Math.round(atrasoDasRegioes + i * 40)}ms` }}
            >
              <circle cx={ponto.x} cy={ponto.y} r={3} fill="#EAF4E8" />
              <circle
                cx={ponto.x}
                cy={ponto.y}
                r={7}
                fill="none"
                stroke="var(--color-fgv)"
                strokeWidth={1.2}
                strokeOpacity={0.55}
              />
              <text x={ponto.x + 9} y={ponto.y - 6} fill="#C6DCC2" fontSize={9.5}>
                {regiao}
              </text>
            </g>
          ))}
        </svg>

        <p className="absolute right-3 bottom-2.5 flex items-center gap-1.5 text-[11px] text-[#A9C6A5]">
          <span className="inline-block h-0.5 w-3.5 rounded-sm bg-[#B0D9B1]" />
          corredor aéreo
        </p>
      </div>

      <figcaption className="mt-3 max-w-[80ch] text-[12px] text-[var(--color-apoio)]">
        Cada linha liga duas regiões, e o ponto de cada uma é a posição média dos
        aeroportos que a empresa de fato usa ali. A espessura acompanha a emissão
        do corredor — o mais pesado soma {numero(maior)} kg CO₂. Somente trechos
        aéreos; projeção equirretangular, com contorno de terra em escala
        grosseira, que situa mas não serve para medir.
        {mapa.suprimidos > 0 && (
          <>
            {' '}
            <strong className="font-medium text-[var(--color-tinta)]">
              {proporcao(mapa.proporcaoSuprimida, 0)} da emissão aérea não está
              desenhada
            </strong>
            , em {mapa.suprimidos}{' '}
            {mapa.suprimidos === 1 ? 'corredor' : 'corredores'} percorridos por
            pouca gente. <strong className="font-medium">Não é dado faltando</strong>
            : é deslocamento de poucas pessoas, que não pode virar linha sem apontar
            para elas. O valor continua somando em todos os totais desta tela.
          </>
        )}
        {mapa.semGeografia > 0 && (
          <> {mapa.semGeografia} trecho(s) ficaram fora por aeroporto sem região.</>
        )}
      </figcaption>
    </figure>
  )
}

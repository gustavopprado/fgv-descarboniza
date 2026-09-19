/**
 * A série mensal do consolidado, **empilhada** — CLAUDE.md §10.0.
 *
 * **Empilhada, nunca somada numa linha só**, e o motivo é a mobilidade: ela é
 * taxa repetida nos doze meses (§9.5), e numa curva única de total o mesmo dado
 * viraria um piso invisível que achata tudo — a variação de viagens e marítimo,
 * que é o que a tela tem a dizer, ficaria ilegível. Empilhada, a banda plana se
 * declara sozinha: quem olha vê que ela não varia e entende por quê ao ler o
 * cartão dela.
 *
 * **A peça não conhece consulta nenhuma**: recebe meses, partes e a chave de
 * cor. É a lição de 19/09 aplicada de novo — compartilha-se o desenho, nunca a
 * declaração. O que a série significa neste consolidado vem de quem chama, em
 * `nota`, porque cada módulo agrupa por uma data diferente e só a tela sabe quais.
 *
 * A geometria mora em `src/lib/barras.ts`, testada; aqui só se desenha.
 */
import { montarBarrasEmpilhadas } from '@/lib/barras'
import { numero } from '@/lib/formato'
import { Rolavel } from '../componentes'
import { COR_DO_MODULO, NOME_CURTO, ORDEM_DA_PILHA } from './paleta'

/**
 * Ver `grafico-de-barras.tsx`: `viewBox` é escala, e escala erra para os dois
 * lados. O teto é o mesmo de lá, pela mesma medida.
 *
 * **O piso é mais baixo que o da barra simples, e o motivo foi medido.** Na
 * coluna larga desta tela, a 1024px, o desenho fica a 0,88 da escala — com o
 * piso de 0,9 o painel passaria a rolar por dentro **oito pixels**, que é a pior
 * rolagem possível: ninguém percebe que ela existe e ela leva embora o último
 * mês. A 0,85 o desenho encolhe esses 12% e o rótulo do mês sai a 8,8px, acima
 * do que a série simples já entrega no celular.
 */
const AMPLIACAO_MAXIMA = 1.25
const REDUCAO_MAXIMA = 0.85

const NOME_DO_MES = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
]

/**
 * **Só o nome do mês, sem o ano — e aqui isso é correto, não economia.**
 *
 * A série compartilhada escreve `jan/25` porque a dela pode atravessar anos. Esta
 * cobre sempre os doze meses de um ano só, declarado no título da tela e no
 * rótulo do indicador; repetir o ano doze vezes não acrescenta nada e **custa a
 * legibilidade no celular**. Medido num aparelho de 360px, pela caixa do texto e
 * não pelo passo da coluna: com o ano, a folga entre rótulos vizinhos chega a
 * **−0,2px** — eles se tocam; sem ele, a menor folga é **9,8px**.
 *
 * Rarear o rótulo — um mês a cada dois — resolveria a colisão escondendo metade
 * dos meses. Encurtar resolve mostrando todos.
 */
function rotuloDoMes(mes: string): string {
  return NOME_DO_MES[Number(mes.slice(5, 7)) - 1]
}

export type MesEmpilhado = {
  mes: string
  mobilidade: number
  viagens: number
  maritimo: number
  total: number
}

export function SerieEmpilhada({
  serie,
  nota,
}: {
  serie: MesEmpilhado[]
  /** O que a série significa **neste** consolidado: que datas, que recortes. */
  nota?: React.ReactNode
}) {
  if (serie.length === 0) return null

  const largura = Math.max(420, serie.length * 34)
  const altura = 300

  const desenho = montarBarrasEmpilhadas(
    serie.map((m) => ({
      rotulo: rotuloDoMes(m.mes),
      partes: ORDEM_DA_PILHA.map((modulo) => m[modulo]),
    })),
    { largura, altura },
  )

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {/* **A mesma ordem da faixa do indicador, e isso é decisão.** A legenda
            começou invertida, para ler de cima para baixo como a pilha é vista —
            e o resultado foi a mesma chave de cor aparecendo em duas ordens na
            mesma tela, a três centímetros de distância. Duas ordens para um
            assunto só é o leitor conferindo a legenda duas vezes. */}
        {ORDEM_DA_PILHA.map((modulo) => (
          <li key={modulo} className="flex items-center gap-2 text-[12px]">
            <span
              aria-hidden
              className="inline-block size-2.5 shrink-0 rounded-[3px]"
              style={{ background: COR_DO_MODULO[modulo] }}
            />
            <span className="text-[var(--color-apoio)]">{NOME_CURTO[modulo]}</span>
          </li>
        ))}
      </ul>

      <Rolavel minimo={largura * REDUCAO_MAXIMA} maximo={largura * AMPLIACAO_MAXIMA}>
        <svg
          viewBox={`0 0 ${largura} ${altura}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`Emissão mês a mês, empilhada por módulo, em ${serie.length} meses.`}
        >
          <line
            x1={15}
            y1={desenho.base}
            x2={largura - 6}
            y2={desenho.base}
            stroke="var(--color-linha)"
            strokeWidth={1}
          />

          {desenho.barras.map((barra, i) => {
            const meio = barra.x + barra.largura / 2
            const topo = barra.segmentos.reduce((m, s) => Math.min(m, s.y), desenho.base)

            return (
              <g key={`${barra.rotulo}-${i}`}>
                {/* A coluna inteira cresce como uma peça só: cada banda animada
                    por conta própria subiria em velocidades diferentes e a pilha
                    se abriria no meio do caminho. */}
                <g className="crescer" style={{ animationDelay: `${i * 60}ms` }}>
                  {barra.segmentos.map((segmento) => (
                    <rect
                      key={segmento.parte}
                      x={barra.x}
                      y={segmento.y}
                      width={barra.largura}
                      height={segmento.altura}
                      fill={COR_DO_MODULO[ORDEM_DA_PILHA[segmento.parte]]}
                    >
                      {/* Um filho só, e já montado: vários filhos viram
                          marcadores de comentário no meio do texto cru de
                          `title` e a hidratação falha. */}
                      <title>
                        {`${barra.rotulo} · ${NOME_CURTO[ORDEM_DA_PILHA[segmento.parte]]}: ${numero(segmento.valor, 0)} kg CO₂`}
                      </title>
                    </rect>
                  ))}
                </g>

                {desenho.mostrarValores && (
                  <text
                    /* No celular doze valores dividem poucos pixels cada e
                       sairiam encavalados. O total exato de cada banda continua
                       no rótulo de cada segmento. */
                    className="max-sm:hidden"
                    x={meio}
                    y={topo - 6}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={600}
                    fill="var(--color-tinta)"
                  >
                    {numero(barra.total / 1000, 1)}
                  </text>
                )}

                {i % desenho.saltoDoRotulo === 0 && (
                  <text
                    x={meio}
                    y={desenho.base + 15}
                    textAnchor="middle"
                    fontSize={10}
                    fill="var(--color-apoio)"
                  >
                    {barra.rotulo}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </Rolavel>

      <p className="mt-3 max-w-[80ch] border-t border-[var(--color-linha)] pt-3 text-[12px] text-[var(--color-apoio)]">
        O valor no topo de cada coluna é o total do mês, em toneladas; cada banda
        traz o próprio número ao ser apontada. {nota}
      </p>
    </div>
  )
}

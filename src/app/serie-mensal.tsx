/**
 * Série mensal, compartilhada pelas telas do inventário — CLAUDE.md §10.
 *
 * **A única ressalva que o desenho tem é do desenho**, e é esta: mês sem
 * emissão aparece com barra zerada, não sumido — mês ausente encostaria o mês
 * seguinte no anterior e esconderia a queda que houve.
 *
 * **O resto da nota vem de quem chama**, e isso é correção de um defeito real:
 * a peça trazia escrito, dentro dela, que a série cobria as duas fontes
 * administrativas de viagens — o relatório da agência e a planilha do cartão.
 * A tela do marítimo reusou a peça e passou a declarar, embaixo do próprio
 * gráfico, uma composição de fontes que não é a dela. É a mesma família de
 * defeito que este projeto vem pegando: tela afirmando um arranjo que ela não
 * tem. Cada módulo agrupa por uma data diferente e soma fontes diferentes, e
 * **isso é sempre do módulo, nunca do gráfico**.
 *
 * **Não há marca de troca de fonte, e a ausência é a §0.1.** Enquanto se
 * acreditou que o relatório da agência e o formulário do viajante eram a mesma
 * série, a tela de viagens destacava o mês da data de corte para avisar que a
 * emissão ia parecer cair sem ter caído. A premissa estava errada, e o que
 * dependia dela saiu.
 */
import { escalaDeMassa, numero } from '@/lib/formato'
import { GraficoDeBarras } from './grafico-de-barras'

const NOME_DO_MES = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
]

/**
 * **O ano sai do rótulo quando a série inteira cabe num ano só**, e volta
 * quando ela atravessa a virada.
 *
 * Medido com a casca, na coluna de painel em que esta série vive: com doze
 * meses, o passo é de pouco mais de trinta e seis pixels e `jan/25` ocupa
 * trinta e quatro — a folga entre vizinhos ficava entre 0,1 e 3,5px, **com um
 * par se sobrepondo**, e a linha de meses se lia como uma palavra só. Sem o
 * ano, o mesmo rótulo ocupa menos da metade.
 *
 * **O que sai é repetição, não declaração** (§13): o ano estava escrito doze
 * vezes na mesma linha, e passa a estar escrito uma vez na nota do gráfico.
 * Onde ele de fato informa — série que cobre mais de um ano civil —, ele
 * continua em cada rótulo, porque ali é ele que separa dois janeiros.
 */
function anoUnico(serie: { mes: string }[]): string | null {
  const anos = new Set(serie.map((ponto) => ponto.mes.slice(0, 4)))
  return anos.size === 1 ? [...anos][0] : null
}

function rotuloDoMes(mes: string, comAno: boolean): string {
  const [ano, numeroDoMes] = mes.split('-')
  const nome = NOME_DO_MES[Number(numeroDoMes) - 1]
  return comAno ? `${nome}/${ano.slice(2)}` : nome
}

export function SerieMensal({
  serie,
  nota,
}: {
  serie: { mes: string; co2Kg: number; documentos: number }[]
  /** O que a série significa **neste** módulo: que datas, que fontes. */
  nota?: React.ReactNode
}) {
  if (serie.length === 0) return null

  const ano = anoUnico(serie)

  /**
   * **O topo da barra vira tonelada quando a série é grande o bastante**, e a
   * escala sai do maior mês — nunca de constante. Em quilos, doze rótulos de
   * seis dígitos não cabem na coluna e se sobrepõem; a escala é o que preserva o
   * número na tela em vez de apagá-lo. O `title` de cada barra continua em quilo,
   * exato.
   */
  const escala = escalaDeMassa(serie.reduce((m, p) => Math.max(m, p.co2Kg), 0))

  return (
    <div>
      <GraficoDeBarras
        barras={serie.map((ponto) => ({
          rotulo: rotuloDoMes(ponto.mes, ano === null),
          valor: ponto.co2Kg,
          valorEscrito: numero(ponto.co2Kg / escala.divisor, escala.casas),
        }))}
        unidade="kg CO₂"
        casas={0}
        // **A proporção é escolhida para a coluna, não para a tela inteira.**
        // O `viewBox` não é tamanho, é escala: quanto mais largo, mais o
        // navegador encolhe tudo para caber na coluna — e era isso que deixava
        // rótulo e valor ilegíveis aqui do lado da tabela. Mais estreito e mais
        // alto, o mesmo gráfico chega maior à tela.
        //
        // Um ano cabe na largura fixa; séries mais longas alargam devagar, e a
        // geometria rareia o rótulo sozinha quando ele deixa de caber.
        largura={Math.max(420, serie.length * 34)}
        altura={300}
      />

      <p className="mt-3 max-w-[80ch] border-t border-[var(--color-linha)] pt-3 text-[12px] text-[var(--color-apoio)]">
        {ano !== null ? (
          <>
            Meses de {ano}, em {escala.unidade}.{' '}
          </>
        ) : (
          <>Valores em {escala.unidade}. </>
        )}
        Mês sem emissão aparece com barra zerada, não sumido: mês ausente
        esconderia a queda que houve. {nota}
      </p>
    </div>
  )
}

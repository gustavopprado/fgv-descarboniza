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
import { GraficoDeBarras } from './grafico-de-barras'

const NOME_DO_MES = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
]

function rotuloDoMes(mes: string): string {
  const [ano, numeroDoMes] = mes.split('-')
  return `${NOME_DO_MES[Number(numeroDoMes) - 1]}/${ano.slice(2)}`
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

  return (
    <div>
      <GraficoDeBarras
        barras={serie.map((ponto) => ({
          rotulo: rotuloDoMes(ponto.mes),
          valor: ponto.co2Kg,
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
        Mês sem emissão aparece com barra zerada, não sumido: mês ausente
        esconderia a queda que houve. {nota}
      </p>
    </div>
  )
}

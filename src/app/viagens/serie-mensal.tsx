/**
 * Série mensal do inventário de viagens — CLAUDE.md §10.3.
 *
 * **Não há marca de troca de fonte, e a ausência é a §0.1.** Enquanto se
 * acreditou que o relatório da agência e o formulário do viajante eram a mesma
 * série, esta tela destacava o mês da data de corte para avisar que a emissão
 * ia parecer cair sem ter caído. A premissa estava errada: as duas fontes deste
 * módulo são administrativas, cobrem o mesmo tipo de registro e convivem sem
 * ressalva. O formulário alimenta o programa de viagens, que tem coleção e
 * telas próprias.
 *
 * O que sobra é a única ressalva que a série de fato tem, e que é de outra
 * regra: mês sem viagem aparece com barra zerada, não sumido.
 */
import { GraficoDeBarras } from '../grafico-de-barras'

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
}: {
  serie: { mes: string; co2Kg: number; documentos: number }[]
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
        largura={Math.max(420, serie.length * 54)}
        altura={240}
      />

      <p className="mt-3 max-w-[80ch] border-t border-[var(--color-linha)] pt-3 text-[12px] text-[var(--color-apoio)]">
        Mês sem viagem aparece com barra zerada, não sumido: mês ausente
        esconderia a queda que houve. A série cobre as duas fontes
        administrativas do módulo — o relatório da agência e a planilha do cartão
        empresarial —, somadas sem distinção, porque as duas cobrem o mesmo tipo
        de registro. O que os colaboradores registram no programa de viagens não
        entra aqui.
      </p>
    </div>
  )
}

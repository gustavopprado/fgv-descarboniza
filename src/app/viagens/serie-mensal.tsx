/**
 * Série mensal com a marca da troca de fonte — CLAUDE.md §7 e §10.3.
 *
 * A marca existe porque, nos primeiros meses do programa, a adesão vai ser
 * parcial e **a emissão vai parecer cair sem ter caído**. Sem a marca, o gráfico
 * conta uma história de redução que não aconteceu.
 *
 * A marca vem da data de corte, não da série: enquanto ninguém tiver registrado
 * viagem pelo formulário, a série sozinha não teria como mostrar a virada — que
 * é justamente quando ela mais importa.
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
  corteFonte,
}: {
  serie: { mes: string; co2Kg: number; documentos: number }[]
  corteFonte: string | null
}) {
  if (serie.length === 0) return null

  const mesDoCorte = corteFonte === null ? null : corteFonte.slice(0, 7)
  const corteNaSerie = mesDoCorte !== null && serie.some((p) => p.mes === mesDoCorte)

  return (
    <div>
      <GraficoDeBarras
        barras={serie.map((ponto) => ({
          rotulo: rotuloDoMes(ponto.mes),
          valor: ponto.co2Kg,
          destaque: ponto.mes === mesDoCorte,
        }))}
        unidade="kg CO₂"
        casas={0}
        largura={Math.max(420, serie.length * 54)}
        altura={240}
      />

      <p className="mt-3 max-w-[80ch] border-t border-[var(--color-linha)] pt-3 text-[12px] text-[var(--color-apoio)]">
        Mês sem viagem aparece com barra zerada, não sumido: mês ausente esconderia
        a queda que houve.{' '}
        {corteFonte === null ? (
          <>
            A data em que a fonte passa da agência para o formulário do viajante
            ainda não foi definida, então a série não marca a virada. Enquanto
            isso, tudo que está aqui vem do relatório da agência.
          </>
        ) : corteNaSerie ? (
          <>
            O mês em destaque é o da troca de fonte, em {corteFonte}: antes dele o
            dado vem do relatório da agência, a partir dele do formulário de quem
            viajou. Nos primeiros meses a adesão é parcial, e a emissão vai
            parecer cair sem ter caído.
          </>
        ) : (
          <>
            A troca de fonte está marcada para {corteFonte}, fora do período
            exibido.
          </>
        )}
      </p>
    </div>
  )
}

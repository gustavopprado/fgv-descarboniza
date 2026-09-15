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
import { numero } from '@/lib/formato'

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

  const maior = serie.reduce((m, p) => Math.max(m, p.co2Kg), 0)
  const mesDoCorte = corteFonte === null ? null : corteFonte.slice(0, 7)
  const corteNaSerie = mesDoCorte !== null && serie.some((p) => p.mes === mesDoCorte)

  return (
    <div>
      <div className="flex items-end gap-1 overflow-x-auto pb-2">
        {serie.map((ponto) => {
          const daVirada = ponto.mes === mesDoCorte
          return (
            <div key={ponto.mes} className="flex w-10 shrink-0 flex-col items-center">
              <div className="flex h-40 w-full items-end">
                <div
                  className={
                    daVirada
                      ? 'w-full rounded-t bg-[var(--color-fgv)]'
                      : 'w-full rounded-t bg-[var(--color-folha-700)]'
                  }
                  style={{
                    height: `${maior > 0 ? Math.max((ponto.co2Kg / maior) * 100, ponto.co2Kg > 0 ? 2 : 0) : 0}%`,
                  }}
                  title={`${rotuloDoMes(ponto.mes)}: ${numero(ponto.co2Kg)} kg CO₂`}
                />
              </div>
              <span
                className={
                  daVirada
                    ? 'mt-1 text-[10px] font-semibold text-[var(--color-folha-900)]'
                    : 'mt-1 text-[10px] text-[var(--color-folha-900)]/55'
                }
              >
                {rotuloDoMes(ponto.mes)}
              </span>
            </div>
          )
        })}
      </div>

      <p className="mt-2 max-w-3xl text-xs text-[var(--color-folha-900)]/55">
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

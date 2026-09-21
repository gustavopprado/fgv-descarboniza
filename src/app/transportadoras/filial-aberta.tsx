/**
 * Os números de uma filial — CLAUDE.md §9.4 e §9.5.
 *
 * Abre ao clicar num ponto do mapa e responde o que a §9.5 pede: **total,
 * número de entregas e peso movimentado**. Nada por cliente: o agregado deste
 * módulo é por filial, e nome de cliente não aparece em tela nenhuma dele.
 *
 * **O peso aparece aqui, e a §1 mantém peso fora da interface.** A §9.5 é mais
 * específica e o pede neste painel — é a mesma resolução que deixa a distância
 * média na tela de Mobilidade. O que continua fora é a distância por entrega e a
 * intensidade por quilo, que são insumo de cálculo e não resultado.
 */
import { inteiro, numero, proporcao } from '@/lib/formato'
import type { FilialDoModulo } from '@/server/consultas/inventario'
import { Vazio } from '../componentes'

export function FilialAberta({
  filiais,
  filial,
  co2KgDoModulo,
  fechar,
}: {
  filiais: FilialDoModulo[]
  filial: string
  /** Total do recorte, para a proporção desta filial. */
  co2KgDoModulo: number
  /** Endereço que fecha o recorte — a mesma tela, sem filial. */
  fechar: string
}) {
  const f = filiais.find((x) => x.filial === filial)
  if (f === undefined) {
    return (
      <Vazio>
        Não há filial com o código {filial} neste recorte.{' '}
        <a href={fechar} className="underline">
          Voltar ao mapa
        </a>
        .
      </Vazio>
    )
  }

  const itens = [
    { rotulo: 'Emissão', valor: `${numero(f.co2Kg)} kg CO₂e` },
    { rotulo: 'Entregas', valor: inteiro(f.entregas) },
    { rotulo: 'Peso movimentado', valor: `${numero(f.pesoKg / 1000)} t` },
  ]

  return (
    <div className="revelar mt-4 rounded-[11px] border border-[var(--color-linha)] bg-[var(--color-fundo)] px-4 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-[13.5px] font-semibold text-[var(--color-tinta)]">
          {f.rotulo}
          {f.cidade !== null && (
            <span className="ml-2 font-normal text-[var(--color-apoio)]">{f.cidade}</span>
          )}
        </h3>
        <a
          href={fechar}
          className="text-[12px] text-[var(--color-apoio)] underline underline-offset-2"
        >
          fechar
        </a>
      </div>

      {f.entregas === 0 ? (
        <p className="mt-1.5 max-w-[80ch] text-[12.5px] text-[var(--color-apoio)]">
          Nenhuma entrega desta filial neste recorte. Ela continua no mapa porque
          existe — zero é medição, não ausência de filial.
        </p>
      ) : (
        <>
          <dl className="mt-2.5 flex flex-wrap gap-x-10 gap-y-3">
            {itens.map((i) => (
              <div key={i.rotulo}>
                <dt className="text-[11.5px] text-[var(--color-apoio)]">{i.rotulo}</dt>
                <dd className="text-[15px] font-semibold text-[var(--color-tinta)] tabular-nums">
                  {i.valor}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2.5 max-w-[80ch] text-[12px] text-[var(--color-apoio)]">
            {proporcao(co2KgDoModulo === 0 ? 0 : f.co2Kg / co2KgDoModulo)} da emissão do
            módulo neste recorte. O número não se divide por transportadora: o relatório
            não diz qual delas fez cada entrega.
          </p>
        </>
      )}
    </div>
  )
}

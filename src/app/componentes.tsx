/**
 * Peças compartilhadas das telas — CLAUDE.md §4.
 *
 * Nenhuma delas conhece Firestore, papel ou consulta: recebem o que já saiu da
 * camada de consulta e desenham. O verde da FGV fica reservado para marca, item
 * ativo de menu e elementos vivos; o corpo das telas usa a paleta de folha.
 */
import { inteiro, numero, proporcao } from '@/lib/formato'
import type { Grupo } from '@/server/consultas/agregacao'

export function Secao({
  titulo,
  descricao,
  children,
}: {
  titulo: string
  descricao?: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-[var(--color-folha-900)]">{titulo}</h2>
      {descricao !== undefined && (
        <p className="mt-1 max-w-3xl text-sm text-[var(--color-folha-900)]/65">
          {descricao}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-[var(--color-folha-500)] px-4 py-6 text-sm text-[var(--color-folha-900)]/60">
      {children}
    </p>
  )
}

/** Cartão de indicador. A unidade vive ao lado do número, nunca implícita. */
export function Cartao({
  rotulo,
  valor,
  unidade,
  nota,
}: {
  rotulo: string
  valor: string
  unidade: string
  nota?: string
}) {
  return (
    <article className="rounded-md border border-[var(--color-folha-300)] bg-[var(--color-folha-300)]/20 p-5">
      <p className="text-xs font-semibold tracking-wide text-[var(--color-folha-900)]/55 uppercase">
        {rotulo}
      </p>
      <p className="mt-2 text-3xl font-semibold text-[var(--color-folha-900)] tabular-nums">
        {valor}
        <span className="ml-1 text-sm font-normal text-[var(--color-folha-900)]/60">
          {unidade}
        </span>
      </p>
      {nota !== undefined && (
        <p className="mt-2 text-xs text-[var(--color-folha-900)]/55">{nota}</p>
      )}
    </article>
  )
}

/**
 * Lista de grupos com barra proporcional.
 *
 * O grupo que veio da supressão de recortes pequenos (§3.1) é marcado: sem a
 * marca, "outros" parece uma categoria da pesquisa em vez do que é — um balde
 * que existe para não identificar ninguém.
 */
export function ListaDeGrupos({
  grupos,
  unidade = 'kg CO₂',
  mostrarPessoas = true,
}: {
  grupos: Grupo[]
  unidade?: string
  mostrarPessoas?: boolean
}) {
  if (grupos.length === 0) {
    return <Vazio>Nada a exibir neste recorte.</Vazio>
  }

  const maior = grupos.reduce((m, g) => Math.max(m, g.co2Kg), 0)
  const total = grupos.reduce((s, g) => s + g.co2Kg, 0)

  return (
    <ul className="space-y-3">
      {grupos.map((grupo) => (
        <li key={grupo.rotulo}>
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="text-[var(--color-folha-900)]">
              {grupo.rotulo}
              {grupo.agrupadoPorSupressao && (
                <span
                  className="ml-2 rounded bg-[var(--color-folha-300)] px-1.5 py-0.5 text-[11px] text-[var(--color-folha-900)]/70"
                  title="Recortes pequenos demais para serem exibidos sem identificar quem está neles"
                >
                  recortes agrupados
                </span>
              )}
            </span>
            <span className="shrink-0 tabular-nums text-[var(--color-folha-900)]/75">
              {numero(grupo.co2Kg)} {unidade}
              {total > 0 && (
                <span className="ml-2 text-[var(--color-folha-900)]/45">
                  {proporcao(grupo.co2Kg / total)}
                </span>
              )}
            </span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded bg-[var(--color-folha-300)]/50">
            <div
              className="h-full rounded bg-[var(--color-folha-700)]"
              style={{ width: `${maior > 0 ? (grupo.co2Kg / maior) * 100 : 0}%` }}
            />
          </div>
          {mostrarPessoas && (
            <p className="mt-1 text-xs text-[var(--color-folha-900)]/45">
              {inteiro(grupo.pessoas)} {grupo.pessoas === 1 ? 'pessoa' : 'pessoas'}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}

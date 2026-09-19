/**
 * A faixa proporcional dos três módulos — CLAUDE.md §10.0.
 *
 * É o indicador principal partido em três, e é por isso que ela mora dentro do
 * mesmo painel dele: são a mesma afirmação em duas formas, e separá-las em dois
 * painéis faria o leitor procurar a relação entre dois números que são um.
 *
 * **As três fatias somam o indicador; se não somarem, é defeito, não
 * arredondamento** — e a conferência disso não está aqui. Ela é invariante da
 * consulta, que estoura antes de desenhar qualquer coisa (§10.0.1): uma tela que
 * conferisse o próprio dado só saberia esconder o erro.
 *
 * **Fatia de largura zero não é desenhada, e a legenda continua com as três
 * linhas.** A faixa mostra o que tem tamanho; quem diz que um módulo existe e
 * não somou nada — ou que não foi declarado — é a legenda, que é onde zero e
 * ausência se distinguem (§9.10).
 */
import { numero, proporcao } from '@/lib/formato'
import type { ModuloDaVisaoGeral } from '@/server/consultas/visao-geral'
import { COR_DO_MODULO, NOME_CURTO, type ModuloEmpilhado } from './paleta'

export function FaixaDosModulos({ modulos }: { modulos: ModuloDaVisaoGeral[] }) {
  const comTamanho = modulos.filter((m) => m.proporcao > 0)

  return (
    <div className="mt-5">
      <div
        className="flex h-3.5 w-full overflow-hidden rounded-full bg-[#E7EFE5]"
        role="img"
        aria-label={comTamanho
          .map((m) => `${NOME_CURTO[m.modulo as ModuloEmpilhado]} ${proporcao(m.proporcao)}`)
          .join(', ')}
      >
        {comTamanho.map((m) => (
          <span
            key={m.modulo}
            className="h-full"
            style={{
              width: `${m.proporcao * 100}%`,
              background: COR_DO_MODULO[m.modulo as ModuloEmpilhado],
            }}
            title={`${NOME_CURTO[m.modulo as ModuloEmpilhado]}: ${numero(m.toneladas, 1)} t CO₂e`}
          />
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {modulos.map((m) => (
          <li key={m.modulo} className="flex items-baseline gap-2 text-[12.5px]">
            <span
              aria-hidden
              className="inline-block size-2.5 shrink-0 translate-y-px rounded-[3px]"
              style={{ background: COR_DO_MODULO[m.modulo as ModuloEmpilhado] }}
            />
            <span className="text-[var(--color-tinta)]">
              {NOME_CURTO[m.modulo as ModuloEmpilhado]}
            </span>
            <span className="text-[var(--color-apoio)] tabular-nums">
              {m.recorte === null ? (
                'não declarado'
              ) : (
                <>
                  {numero(m.toneladas, 1)} t · {proporcao(m.proporcao)}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

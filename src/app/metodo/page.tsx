/**
 * Tela de Método — CLAUDE.md §10.5.
 *
 * A primeira tela do sistema, e de propósito: é onde cada escolha que muda o
 * número fica registrada, e é a única tela do inventário que não exibe recorte
 * de pessoa nenhum. Tudo que aparece aqui vem da camada de consulta (§9.10);
 * esta página não sabe o que é uma coleção.
 */
import { Casca } from '../casca'
import { AcessoNegadoError } from '@/server/consultas/acesso'
import { consultarMetodo, NAO_DEFINIDO } from '@/server/consultas/metodo'
import type {
  AlertaDeclarado,
  EscopoDoParametro,
  Metodo,
} from '@/server/consultas/metodo'
import { exigirSessao } from '@/server/sessao'

export const dynamic = 'force-dynamic'

const NOME_DO_ESCOPO: Record<EscopoDoParametro, string> = {
  geral: 'Geral',
  mobilidade: 'Mobilidade',
  viagens: 'Viagens corporativas',
  maritimo: 'Transporte marítimo',
}

const CORES_DA_SEVERIDADE: Record<AlertaDeclarado['severidade'], string> = {
  erro: 'bg-red-100 text-red-900',
  atencao: 'bg-amber-100 text-amber-900',
  informativo: 'bg-[var(--color-folha-300)] text-[var(--color-folha-900)]',
}

const NOME_DA_SEVERIDADE: Record<AlertaDeclarado['severidade'], string> = {
  erro: 'erro',
  atencao: 'atenção',
  informativo: 'informativo',
}

function Secao({
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

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-[var(--color-folha-500)] px-4 py-6 text-sm text-[var(--color-folha-900)]/60">
      {children}
    </p>
  )
}

function Parametros({ metodo }: { metodo: Metodo }) {
  const escopos = (['geral', 'mobilidade', 'viagens', 'maritimo'] as const).filter(
    (e) => metodo.parametros.some((p) => p.escopo === e),
  )

  return (
    <div className="space-y-8">
      {escopos.map((escopo) => (
        <div key={escopo}>
          <h3 className="text-xs font-semibold tracking-wide text-[var(--color-folha-900)]/50 uppercase">
            {NOME_DO_ESCOPO[escopo]}
          </h3>
          <dl className="mt-3 divide-y divide-[var(--color-folha-300)] border-t border-[var(--color-folha-300)]">
            {metodo.parametros
              .filter((p) => p.escopo === escopo)
              .map((p) => (
                <div key={p.rotulo} className="grid gap-1 py-3 md:grid-cols-[18rem_1fr]">
                  <dt className="text-sm font-medium text-[var(--color-folha-900)]">
                    {p.rotulo}
                  </dt>
                  <dd>
                    <span
                      className={
                        p.definido
                          ? 'text-sm text-[var(--color-folha-900)]'
                          : 'rounded bg-amber-100 px-2 py-0.5 text-sm font-medium text-amber-900'
                      }
                    >
                      {p.valor}
                    </span>
                    <p className="mt-1 max-w-3xl text-xs text-[var(--color-folha-900)]/60">
                      {p.observacao}
                    </p>
                  </dd>
                </div>
              ))}
          </dl>
        </div>
      ))}
    </div>
  )
}

export default async function Page() {
  const ctx = await exigirSessao()

  let metodo: Metodo
  try {
    metodo = await consultarMetodo(ctx)
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      return (
        <Casca ctx={ctx} atual="/metodo">
          <h1 className="text-xl font-semibold">Sem acesso</h1>
          <p className="mt-2 text-sm text-[var(--color-folha-900)]/70">{erro.message}</p>
        </Casca>
      )
    }
    throw erro
  }

  const pendentes = metodo.parametros.filter((p) => !p.definido)

  return (
    <Casca ctx={ctx} atual="/metodo">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--color-folha-900)]">Método</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--color-folha-900)]/70">
          As fontes, os parâmetros e os fatores que produzem os números deste
          inventário. Trocar qualquer um deles muda o resultado — por isso cada um
          está declarado aqui, e não só no código.
        </p>
        <p className="mt-2 text-xs text-[var(--color-folha-900)]/50">
          Consultado em {metodo.geradoEm}.
        </p>
      </header>

      {pendentes.length > 0 && (
        <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {pendentes.length === 1
            ? 'Uma decisão de método ainda não foi tomada'
            : `${pendentes.length} decisões de método ainda não foram tomadas`}
          : {pendentes.map((p) => p.rotulo.toLowerCase()).join('; ')}. Elas aparecem
          abaixo marcadas como {NAO_DEFINIDO}.
        </p>
      )}

      <Secao
        titulo="Fontes"
        descricao="De onde vem o dado de cada módulo e em que situação ele está."
      >
        {metodo.fontes.length === 0 ? (
          <Vazio>Nenhum módulo disponível para o seu perfil.</Vazio>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {metodo.fontes.map((f) => (
              <article
                key={f.modulo}
                className="rounded-md border border-[var(--color-folha-300)] p-4"
              >
                <h3 className="text-sm font-semibold text-[var(--color-folha-900)]">
                  {NOME_DO_ESCOPO[f.modulo]}
                </h3>
                <p className="mt-2 text-sm text-[var(--color-folha-900)]/75">
                  {f.descricao}
                </p>
                <p className="mt-2 text-xs text-[var(--color-folha-900)]/55">
                  {f.situacao}
                </p>
              </article>
            ))}
          </div>
        )}
      </Secao>

      <Secao
        titulo="Parâmetros e escolhas"
        descricao="Cada linha é uma decisão que altera o número. O que ainda não foi decidido aparece marcado, nunca em branco."
      >
        <Parametros metodo={metodo} />
      </Secao>

      <Secao
        titulo="Qualidade do dado"
        descricao="Quanto de cada módulo está carregado, e quanto ficou fora da média."
      >
        {metodo.qualidade.length === 0 ? (
          <Vazio>Nenhum módulo disponível para o seu perfil.</Vazio>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {metodo.qualidade.map((q) => (
              <article
                key={q.modulo}
                className="rounded-md border border-[var(--color-folha-300)] p-4"
              >
                <h3 className="text-sm font-semibold text-[var(--color-folha-900)]">
                  {NOME_DO_ESCOPO[q.modulo]}
                </h3>
                {q.registros === 0 ? (
                  <p className="mt-2 text-sm text-[var(--color-folha-900)]/55">
                    Nada carregado.
                  </p>
                ) : (
                  <dl className="mt-2 space-y-1">
                    {q.itens.map((i) => (
                      <div key={i.rotulo} className="flex justify-between gap-3 text-sm">
                        <dt className="text-[var(--color-folha-900)]/65">{i.rotulo}</dt>
                        <dd className="font-medium text-[var(--color-folha-900)]">
                          {i.valor}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </article>
            ))}
          </div>
        )}
      </Secao>

      <Secao
        titulo="Exceções"
        descricao="Respostas que ficam fora da média, com o motivo. Elas não são descartadas: continuam no banco e aparecem aqui."
      >
        {metodo.excecoes.length === 0 ? (
          <Vazio>Nenhuma exceção registrada.</Vazio>
        ) : (
          <table className="w-full border-t border-[var(--color-folha-300)] text-sm">
            <thead>
              <tr className="text-left text-xs tracking-wide text-[var(--color-folha-900)]/50 uppercase">
                <th className="py-2 font-semibold">Módulo</th>
                <th className="py-2 font-semibold">Motivo</th>
                <th className="py-2 text-right font-semibold">Registros</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-folha-300)]">
              {metodo.excecoes.map((e) => (
                <tr key={`${e.modulo}-${e.motivo}`}>
                  <td className="py-2 text-[var(--color-folha-900)]/70">
                    {NOME_DO_ESCOPO[e.modulo]}
                  </td>
                  <td className="py-2">{e.motivo}</td>
                  <td className="py-2 text-right font-medium">{e.registros}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Secao>

      <Secao
        titulo="Alertas"
        descricao="Sinalizações levantadas durante a carga, por tipo. A descrição de cada ocorrência fica no banco: ela cita valores da linha e não chega a esta tela."
      >
        {metodo.alertas.length === 0 ? (
          <Vazio>Nenhum alerta registrado.</Vazio>
        ) : (
          <table className="w-full border-t border-[var(--color-folha-300)] text-sm">
            <thead>
              <tr className="text-left text-xs tracking-wide text-[var(--color-folha-900)]/50 uppercase">
                <th className="py-2 font-semibold">Módulo</th>
                <th className="py-2 font-semibold">Tipo</th>
                <th className="py-2 font-semibold">Severidade</th>
                <th className="py-2 text-right font-semibold">Registros</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-folha-300)]">
              {metodo.alertas.map((a) => (
                <tr key={`${a.modulo}-${a.tipo}-${a.severidade}`}>
                  <td className="py-2 text-[var(--color-folha-900)]/70">
                    {NOME_DO_ESCOPO[a.modulo]}
                  </td>
                  <td className="py-2 font-mono text-xs">{a.tipo}</td>
                  <td className="py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${CORES_DA_SEVERIDADE[a.severidade]}`}
                    >
                      {NOME_DA_SEVERIDADE[a.severidade]}
                    </span>
                  </td>
                  <td className="py-2 text-right font-medium">{a.ocorrencias}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Secao>

      <Secao
        titulo="Fatores de emissão"
        descricao="Com fonte, versão e vigência. Fator muda de ano para ano, e todo documento de emissão guarda o que foi usado no cálculo."
      >
        {metodo.fatores.length === 0 ? (
          <Vazio>
            Nenhum fator carregado. Sem fator vigente o cálculo falha
            explicitamente, em vez de assumir um valor.
          </Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-t border-[var(--color-folha-300)] text-sm">
              <thead>
                <tr className="text-left text-xs tracking-wide text-[var(--color-folha-900)]/50 uppercase">
                  <th className="py-2 font-semibold">Categoria</th>
                  <th className="py-2 font-semibold">Chave</th>
                  <th className="py-2 text-right font-semibold">Valor</th>
                  <th className="py-2 font-semibold">Unidade</th>
                  <th className="py-2 font-semibold">Fonte</th>
                  <th className="py-2 font-semibold">Versão</th>
                  <th className="py-2 font-semibold">Vigência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-folha-300)]">
                {metodo.fatores.map((f) => (
                  <tr
                    key={`${f.categoria}-${f.chave}-${f.versao}-${f.vigenciaInicio}`}
                    className={f.vigenteHoje ? '' : 'text-[var(--color-folha-900)]/45'}
                  >
                    <td className="py-2 font-mono text-xs">{f.categoria}</td>
                    <td className="py-2 font-mono text-xs">{f.chave}</td>
                    <td className="py-2 text-right tabular-nums">{f.valor}</td>
                    <td className="py-2 text-xs">{f.unidade}</td>
                    <td className="py-2 text-xs">{f.fonte}</td>
                    <td className="py-2 text-xs">{f.versao}</td>
                    <td className="py-2 text-xs whitespace-nowrap">
                      {f.vigenciaInicio} → {f.vigenciaFim ?? 'sem fim'}
                      {!f.vigenteHoje && ' (fora de vigência)'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </Casca>
  )
}

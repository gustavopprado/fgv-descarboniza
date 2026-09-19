/**
 * Tela de Método — CLAUDE.md §10.5.
 *
 * A primeira tela do sistema, e de propósito: é onde cada escolha que muda o
 * número fica registrada, e é a única tela do inventário que não exibe recorte
 * de pessoa nenhum. Tudo que aparece aqui vem da camada de consulta (§9.10);
 * esta página não sabe o que é uma coleção.
 *
 * O protótipo desenha esta tela com três painéis, mas é anterior à lista mínima
 * que a §10 passou a exigir. **O conteúdo daqui é o da §10**; do protótipo vem a
 * linguagem visual, não o recorte do que declarar.
 */
import { AcessoNegadoError } from '@/server/consultas/acesso'
import { consultarMetodo, NAO_DEFINIDO } from '@/server/consultas/metodo'
import type {
  AlertaDeclarado,
  EscopoDoParametro,
  Metodo,
} from '@/server/consultas/metodo'
import { exigirSessao } from '@/server/sessao'
import { Casca } from '../casca'
import {
  Cabecalho,
  Etiqueta,
  Grade,
  MINIMO,
  Painel,
  Revelar,
  Rolavel,
  TABELA,
  Vazio,
} from '../componentes'

export const dynamic = 'force-dynamic'

const NOME_DO_ESCOPO: Record<EscopoDoParametro, string> = {
  geral: 'Geral',
  mobilidade: 'Mobilidade',
  viagens: 'Viagens corporativas',
  maritimo: 'Transporte marítimo',
}

const CORES_DA_SEVERIDADE: Record<AlertaDeclarado['severidade'], string> = {
  erro: 'bg-[#F7DDDA] text-[#8A2018]',
  atencao: 'bg-[#FBEED3] text-[#8A6A1C]',
  informativo: 'bg-[var(--color-folha-300)] text-[var(--color-folha-900)]',
}

const NOME_DA_SEVERIDADE: Record<AlertaDeclarado['severidade'], string> = {
  erro: 'erro',
  atencao: 'atenção',
  informativo: 'informativo',
}

function Parametros({ metodo }: { metodo: Metodo }) {
  const escopos = (['geral', 'mobilidade', 'viagens', 'maritimo'] as const).filter(
    (e) => metodo.parametros.some((p) => p.escopo === e),
  )

  return (
    <div className="space-y-7">
      {escopos.map((escopo) => (
        <div key={escopo}>
          <h3 className="text-[11px] font-semibold tracking-[0.02em] text-[var(--color-apoio)] uppercase">
            {NOME_DO_ESCOPO[escopo]}
          </h3>
          <dl className="mt-2 divide-y divide-[#EDF2EB] border-t border-[var(--color-linha)]">
            {metodo.parametros
              .filter((p) => p.escopo === escopo)
              .map((p) => (
                <div
                  key={p.rotulo}
                  className="grid items-start gap-1 py-3 [&>*]:min-w-0 md:grid-cols-[19rem_1fr]"
                >
                  <dt className="text-[13px] font-medium text-[var(--color-tinta)]">
                    {p.rotulo}
                  </dt>
                  <dd>
                    {p.definido ? (
                      <span className="text-[13px] text-[var(--color-tinta)]">
                        {p.valor}
                      </span>
                    ) : (
                      <Etiqueta tom="atencao">{p.valor}</Etiqueta>
                    )}
                    <p className="mt-1 max-w-[70ch] text-[12px] text-[var(--color-apoio)]">
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
          <Cabecalho titulo="Sem acesso" descricao={erro.message} />
        </Casca>
      )
    }
    throw erro
  }

  const pendentes = metodo.parametros.filter((p) => !p.definido)

  return (
    <Casca ctx={ctx} atual="/metodo">
      <Cabecalho
        titulo="Método"
        descricao="As fontes, os parâmetros e os fatores que produzem os números deste inventário. Trocar qualquer um deles muda o resultado — por isso cada um está declarado aqui, e não só no código."
      />

      {pendentes.length > 0 && (
        <Revelar ordem={0} className="mb-4">
          {/* A caixa ocupa a largura inteira — ela sinaliza estado, e encolhida
              faria a pendência parecer menor. Quem leva medida de leitura é o
              texto, como no `Vazio`. */}
          <div className="rounded-[var(--radius-painel)] border border-[#F0E0BC] bg-[#FBEED3]/50 px-[22px] py-4">
            <p className="max-w-[80ch] text-[13px] text-[#8A6A1C]">
              {pendentes.length === 1
                ? 'Uma decisão de método ainda não foi tomada'
                : `${pendentes.length} decisões de método ainda não foram tomadas`}
              : {pendentes.map((p) => p.rotulo.toLowerCase()).join('; ')}. Elas aparecem
              abaixo marcadas como {NAO_DEFINIDO}.
            </p>
          </div>
        </Revelar>
      )}

      <Revelar ordem={1}>
        <Painel
          titulo="Fontes"
          descricao="De onde vem o dado de cada módulo e em que situação ele está."
        >
          {metodo.fontes.length === 0 ? (
            <Vazio>Nenhum módulo disponível para o seu perfil.</Vazio>
          ) : (
            <dl className="grid items-start gap-x-6 gap-y-4 [&>*]:min-w-0 md:grid-cols-3">
              {metodo.fontes.map((f) => (
                <div key={f.modulo}>
                  <dt className="text-[13px] font-semibold text-[var(--color-tinta)]">
                    {NOME_DO_ESCOPO[f.modulo]}
                  </dt>
                  <dd className="mt-1 text-[13px] text-[var(--color-apoio)]">
                    {f.descricao}
                    <span className="mt-1.5 block text-[12px] text-[var(--color-apoio)]/80">
                      {f.situacao}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Painel>
      </Revelar>

      <Revelar ordem={2} className="mt-4">
        <Painel
          titulo="Parâmetros e escolhas"
          descricao="Cada linha é uma decisão que altera o número. O que ainda não foi decidido aparece marcado, nunca em branco."
        >
          <Parametros metodo={metodo} />
        </Painel>
      </Revelar>

      <Revelar ordem={3} className="mt-4">
        <Painel
          titulo="Qualidade do dado"
          descricao="Quanto de cada módulo está carregado, e quanto ficou fora da média. No marítimo, a cascata da §8.2 aparece degrau a degrau: a proporção é da emissão, e o número ao lado é de embarques."
        >
          {metodo.qualidade.length === 0 ? (
            <Vazio>Nenhum módulo disponível para o seu perfil.</Vazio>
          ) : (
            <div className="grid items-start gap-x-6 gap-y-5 [&>*]:min-w-0 md:grid-cols-3">
              {metodo.qualidade.map((q) => (
                <div key={q.modulo}>
                  <h3 className="text-[13px] font-semibold text-[var(--color-tinta)]">
                    {NOME_DO_ESCOPO[q.modulo]}
                  </h3>
                  {q.registros === 0 ? (
                    <p className="mt-1.5 text-[13px] text-[var(--color-apoio)]">
                      Nada carregado.
                    </p>
                  ) : (
                    <dl className="mt-1.5 space-y-1">
                      {q.itens.map((i) => (
                        <div
                          key={i.rotulo}
                          className="flex justify-between gap-3 text-[12.5px]"
                        >
                          <dt className="text-[var(--color-apoio)]">{i.rotulo}</dt>
                          <dd className="font-medium text-[var(--color-tinta)] tabular-nums">
                            {i.valor}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              ))}
            </div>
          )}
        </Painel>
      </Revelar>

      <Grade tipo="duas" className="mt-4">
        <Revelar ordem={4}>
          <Painel
            titulo="Exceções"
            descricao="Respostas que ficam fora da média, com o motivo. Elas não são descartadas: continuam no banco e aparecem aqui."
          >
            {metodo.excecoes.length === 0 ? (
              <Vazio>Nenhuma exceção registrada.</Vazio>
            ) : (
              <Rolavel minimo={MINIMO.tabela3}>
                <table className={TABELA.tabela}>
                  <thead>
                    <tr>
                      <th className={TABELA.th}>Módulo</th>
                      <th className={TABELA.th}>Motivo</th>
                      <th className={TABELA.thNum}>Registros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metodo.excecoes.map((e) => (
                      <tr key={`${e.modulo}-${e.motivo}`}>
                        <td className={`${TABELA.td} text-[var(--color-apoio)]`}>
                          {NOME_DO_ESCOPO[e.modulo]}
                        </td>
                        <td className={TABELA.td} data-rotulo="Motivo">{e.motivo}</td>
                        <td className={TABELA.tdNum} data-rotulo="Registros">{e.registros}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Rolavel>
            )}
          </Painel>
        </Revelar>

        <Revelar ordem={5}>
          <Painel
            titulo="Alertas"
            descricao="Sinalizações levantadas durante a carga, por tipo, com a regra que levanta cada uma. A descrição de cada ocorrência fica no banco: ela cita valores da linha e não chega a esta tela."
          >
            {metodo.alertas.length === 0 ? (
              <Vazio>Nenhum alerta registrado.</Vazio>
            ) : (
              <Rolavel minimo={MINIMO.tabela3}>
                <table className={TABELA.tabela}>
                  <thead>
                    <tr>
                      <th className={TABELA.th}>Tipo</th>
                      <th className={TABELA.th}>Severidade</th>
                      <th className={TABELA.thNum}>Registros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metodo.alertas.map((a) => (
                      <tr key={`${a.modulo}-${a.tipo}-${a.severidade}`}>
                        <td className={TABELA.td}>
                          <span className="font-mono text-[11.5px]">{a.tipo}</span>
                          <span className="mt-0.5 block text-[11.5px] text-[var(--color-apoio)]">
                            {NOME_DO_ESCOPO[a.modulo]}
                          </span>
                          {/* **O motivo é a regra, não a linha.** Sem ele a
                              tabela respondia "quantos" e não "o quê", e um
                              código como `co2_por_container_atipico` só se
                              entende de dentro do código. A descrição gravada
                              na carga continua fora daqui: ela cita valor do
                              registro (§3.1). */}
                          <span className="mt-1 block max-w-[62ch] text-[11.5px] leading-[1.45] text-[var(--color-apoio)]">
                            {a.motivo}
                          </span>
                        </td>
                        <td className={TABELA.td} data-rotulo="Severidade">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CORES_DA_SEVERIDADE[a.severidade]}`}
                          >
                            {NOME_DA_SEVERIDADE[a.severidade]}
                          </span>
                        </td>
                        <td className={TABELA.tdNum} data-rotulo="Registros">{a.ocorrencias}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Rolavel>
            )}
          </Painel>
        </Revelar>
      </Grade>

      {metodo.regioesInferidas.length > 0 && (
        <Revelar ordem={6} className="mt-4">
          <Painel
            titulo="Região inferida da coordenada"
            descricao="O mapa de viagens agrupa por corredor entre regiões. A região do aeroporto brasileiro vem do estado, que é dado do cadastro; a destes aqui foi deduzida da coordenada, por faixa continental — é a parte frágil da classificação, e está aqui para ser conferida."
          >
            <Rolavel minimo={MINIMO.tabela3}>
              <table className={TABELA.tabela}>
                <thead>
                  <tr>
                    <th className={TABELA.th}>Código</th>
                    <th className={TABELA.th}>Aeroporto</th>
                    <th className={TABELA.th}>Região atribuída</th>
                  </tr>
                </thead>
                <tbody>
                  {metodo.regioesInferidas.map((r) => (
                    <tr key={r.iata}>
                      <td className={`${TABELA.td} font-mono text-[11.5px]`}>{r.iata}</td>
                      <td className={TABELA.td} data-rotulo="Aeroporto">{r.nome}</td>
                      <td className={TABELA.td}>
                        {r.regiao === 'Região indefinida' ? (
                          <Etiqueta tom="atencao">{r.regiao}</Etiqueta>
                        ) : (
                          r.regiao
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Rolavel>
          </Painel>
        </Revelar>
      )}

      <Revelar ordem={7} className="mt-4">
        <Painel
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
              <Rolavel minimo={MINIMO.tabela7}>
                <table className={TABELA.tabela}>
                  <thead>
                    <tr>
                      <th className={TABELA.th}>Categoria</th>
                      <th className={TABELA.th}>Chave</th>
                      <th className={TABELA.thNum}>Valor</th>
                      <th className={TABELA.th}>Unidade</th>
                      <th className={TABELA.th}>Fonte</th>
                      <th className={TABELA.th}>Versão</th>
                      <th className={TABELA.th}>Vigência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metodo.fatores.map((f) => (
                      <tr
                        key={`${f.categoria}-${f.chave}-${f.versao}-${f.vigenciaInicio}`}
                        className={f.vigenteHoje ? '' : 'text-[var(--color-apoio)]/60'}
                      >
                        <td className={`${TABELA.td} font-mono text-[11.5px]`}>
                          {f.categoria}
                        </td>
                        <td className={`${TABELA.td} font-mono text-[11.5px]`}>
                          {f.chave}
                        </td>
                        <td className={TABELA.tdNum} data-rotulo="Valor">{f.valor}</td>
                        <td className={`${TABELA.td} text-[12px]`} data-rotulo="Unidade">{f.unidade}</td>
                        <td className={`${TABELA.td} text-[12px]`} data-rotulo="Fonte">{f.fonte}</td>
                        <td className={`${TABELA.td} text-[12px]`} data-rotulo="Versão">{f.versao}</td>
                        <td className={`${TABELA.td} text-[12px] whitespace-nowrap`} data-rotulo="Vigência">
                          {f.vigenciaInicio} → {f.vigenciaFim ?? 'sem fim'}
                          {!f.vigenteHoje && ' (fora de vigência)'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Rolavel>
            </div>
          )}
        </Painel>
      </Revelar>

      <p className="mt-6 text-[12px] text-[var(--color-apoio)]/80">
        Consultado em {metodo.geradoEm}.
      </p>
    </Casca>
  )
}

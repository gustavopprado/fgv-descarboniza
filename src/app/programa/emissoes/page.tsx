/**
 * Tela "Emissões registradas" — CLAUDE.md §10, item 7.
 *
 * **Lê `viagemRegistrada` e nenhuma coleção do inventário** (§0.1). Não há
 * comparação com o inventário, não há total somado e não há série lado a lado:
 * juntar fonte administrativa completa com adesão voluntária produz um número
 * cuja variação mede preenchimento e parece medir emissão.
 *
 * **É a única parte do sistema em que a pessoa aparece pelo nome** (§3.2), e
 * mesmo aqui com limite: `gestor` não vê quem registrou, porque para ele o
 * programa também é agregado. Quem decide isso é a camada de consulta, não esta
 * tela — aqui o nome simplesmente vem nulo.
 */
import { numero, periodo, plural, proporcao } from '@/lib/formato'
import { AcessoNegadoError } from '@/server/consultas/acesso'
import { consultarPrograma } from '@/server/consultas/programa'
import { exigirSessao } from '@/server/sessao'
import { Casca } from '../../casca'
import { Cabecalho, Cartao, Grade, MINIMO, Nota, Painel, Revelar, Rolavel, SeletorDeAno, TABELA, Vazio } from '../../componentes'
import { MapaDoProgramaSvg, NaoDesenhadoNoPrograma } from '../mapa'
import { SerieMensal } from '../../serie-mensal'

export const dynamic = 'force-dynamic'

const NOME_DO_TIPO: Record<string, string> = { aereo: 'Avião', carro: 'Carro' }

function anoDe(parametro: string | undefined): number | undefined {
  if (parametro === undefined) return undefined
  const ano = Number(parametro)
  return Number.isInteger(ano) && ano > 2000 && ano < 2100 ? ano : undefined
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string }>
}) {
  const ctx = await exigirSessao()
  const ano = anoDe((await searchParams).ano)

  let dados
  try {
    dados = await consultarPrograma(ctx, ano === undefined ? {} : { ano })
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      return (
        <Casca ctx={ctx} atual="/programa/emissoes">
          <Cabecalho titulo="Sem acesso" descricao={erro.message} />
        </Casca>
      )
    }
    throw erro
  }

  const anos = [...new Set(dados.porMes.map((p) => Number(p.mes.slice(0, 4))))].sort()

  return (
    <Casca ctx={ctx} atual="/programa/emissoes">
      <Cabecalho
        titulo="Emissões registradas"
        descricao="O que os colaboradores registraram por conta própria. É adesão voluntária, não fonte de relatório — por isso nada daqui entra no inventário da empresa, nem somado nem lado a lado."
        acao={
          <SeletorDeAno
            anos={anos}
            atual={ano ?? null}
            href={(a) =>
              a === null ? '/programa/emissoes' : `/programa/emissoes?ano=${a}`
            }
          />
        }
      />

      {dados.trechos === 0 ? (
        <Vazio>
          Nenhuma viagem registrada{ano === undefined ? '' : ` em ${ano}`}. O programa
          mede daqui para a frente: enquanto ninguém registrar, esta tela fica vazia — e
          vazia ela está dizendo a verdade, não faltando dado.
        </Vazio>
      ) : (
        <>
          <Revelar ordem={0}>
            <Grade tipo="tres">
              <Cartao
                rotulo="Registradas no período"
                valor={dados.viagens}
                casas={0}
                unidade={dados.viagens === 1 ? 'viagem' : 'viagens'}
                nota={`${plural(dados.trechos, 'trecho', 'trechos')} ao todo.`}
              />
              <Cartao
                rotulo="Emissão acumulada"
                valor={dados.co2Kg}
                unidade="kg CO₂e"
                nota="Já atribuída a cada pessoa: a emissão do carro é do veículo e é dividida pelos ocupantes, então quem dá carona não conta a mesma viagem duas vezes."
              />
              {/* **O denominador da adesão não sai de coleção nenhuma** (§13). O
                  tamanho da coleção de funcionários seria o candidato óbvio e
                  está errado: ela inclui quem só aparece como aprovador de
                  passagem. Sem o parâmetro, a tela conta e declara que não há
                  denominador, em vez de exibir uma proporção que parece
                  funcionar. */}
              <Cartao
                rotulo="Já registraram"
                valor={
                  dados.cobertura.proporcao === null
                    ? dados.cobertura.registraram
                    : dados.cobertura.proporcao * 100
                }
                casas={dados.cobertura.proporcao === null ? 0 : 1}
                unidade={
                  dados.cobertura.proporcao === null
                    ? dados.cobertura.registraram === 1
                      ? 'pessoa'
                      : 'pessoas'
                    : '%'
                }
                nota={
                  dados.cobertura.quadro === null
                    ? 'Quantas pessoas distintas já registraram alguma viagem. A proporção não aparece porque o tamanho do quadro não está definido no ambiente — e denominador errado é pior que indicador ausente, porque parece funcionar.'
                    : `${plural(dados.cobertura.registraram, 'pessoa', 'pessoas')} de ${dados.cobertura.quadro} do quadro.`
                }
                etiqueta={
                  dados.cobertura.quadro === null
                    ? { texto: 'denominador não definido', tom: 'atencao' }
                    : undefined
                }
              />
            </Grade>
          </Revelar>

          <Revelar ordem={1} className="mt-4">
            <Painel
              titulo="Para onde se foi"
              descricao="Por trajeto registrado, com o lugar de verdade em cada ponta — a cidade do aeroporto no voo, o município no carro."
            >
              {dados.mapa.ligacoes.length === 0 ? (
                <Vazio>
                  Nenhum trajeto pôde ser desenhado.{' '}
                  <NaoDesenhadoNoPrograma mapa={dados.mapa} />
                </Vazio>
              ) : (
                <MapaDoProgramaSvg mapa={dados.mapa} />
              )}
            </Painel>
          </Revelar>

          <Revelar ordem={2} className="mt-4">
            <Grade tipo="larga">
              <Painel
                titulo="Últimas viagens"
                descricao="As mais recentes primeiro. Cada linha é uma viagem, com os trechos somados."
              >
                <Rolavel minimo={MINIMO.tabela5}>
                  <table className={TABELA.tabela}>
                    <thead>
                      <tr>
                        <th className={TABELA.th}>Rota</th>
                        <th className={TABELA.th}>Período</th>
                        <th className={TABELA.th}>Modal</th>
                        {dados.ultimas.some((v) => v.registradoPor !== null) && (
                          <th className={TABELA.th}>Registrou</th>
                        )}
                        <th className={TABELA.thNum}>kg CO₂e</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dados.ultimas.map((v) => (
                        <tr key={v.reservaId}>
                          <td className={TABELA.td}>{v.rota}</td>
                          <td
                            className={`${TABELA.td} text-[var(--color-apoio)]`}
                            data-rotulo="Período"
                          >
                            {periodo(v.dataIda, v.dataVolta ?? v.dataIda)}
                          </td>
                          <td
                            className={`${TABELA.td} text-[var(--color-apoio)]`}
                            data-rotulo="Modal"
                          >
                            {NOME_DO_TIPO[v.tipo] ?? v.tipo}
                          </td>
                          {dados.ultimas.some((o) => o.registradoPor !== null) && (
                            <td
                              className={`${TABELA.td} text-[var(--color-apoio)]`}
                              data-rotulo="Registrou"
                            >
                              {v.registradoPor ?? '—'}
                            </td>
                          )}
                          <td className={TABELA.tdNum} data-rotulo="kg CO₂e">{numero(v.co2Kg)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Rolavel>
                <Nota>
                  O valor de cada linha é o que se atribui a quem registrou. Num carro
                  com mais de um ocupante, a emissão do veículo é maior que a soma
                  mostrada aqui — e é assim que tem que ser.
                </Nota>
              </Painel>

              <div className="space-y-4">
                <Painel
                  titulo="Emissão por mês"
                  descricao="Pela data de ida, que vale para a viagem inteira."
                >
                  <SerieMensal
                    serie={dados.porMes}
                    nota="A série cobre o que os colaboradores registraram, e nada do inventário entra aqui: é adesão voluntária, não fonte de relatório."
                  />
                </Painel>
                <Painel titulo="Avião e carro">
                  <ul className="space-y-3">
                    {dados.porTipo.map((t) => (
                      <li key={t.tipo}>
                        <div className="flex items-baseline justify-between gap-4 text-[13px]">
                          <span className="text-[var(--color-tinta)]">
                            {NOME_DO_TIPO[t.tipo] ?? t.tipo}
                          </span>
                          <span className="shrink-0 text-[var(--color-apoio)] tabular-nums">
                            {numero(t.co2Kg)} kg CO₂e
                            <span className="ml-2 text-[var(--color-apoio)]/70">
                              {proporcao(t.proporcao)}
                            </span>
                          </span>
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded bg-[#E7EFE5]">
                          <div
                            className="h-full rounded bg-[var(--color-folha-700)]"
                            style={{ width: `${t.proporcao * 100}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[11.5px] text-[var(--color-apoio)]/80">
                          {plural(t.viagens, 'viagem', 'viagens')}
                        </p>
                      </li>
                    ))}
                  </ul>
                </Painel>
              </div>
            </Grade>
          </Revelar>
        </>
      )}

      <p className="mt-6 max-w-[80ch] text-[12px] text-[var(--color-apoio)]/85">
        Estes números <strong className="font-medium">não fazem parte do inventário</strong>{' '}
        e não devem ser somados a ele: o inventário vem de fonte administrativa completa do
        período, e isto aqui é o que cada um resolveu registrar. Uma queda nesta tela pode
        ser queda de adesão, não de emissão — é por isso que as duas coisas nunca aparecem
        na mesma conta.
        {dados.fechadoAte !== null &&
          ` O período até ${dados.fechadoAte} está fechado: o que tem ida até essa data não é mais editável por quem registrou.`}
      </p>
    </Casca>
  )
}

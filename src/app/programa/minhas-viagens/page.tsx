/**
 * "Minhas viagens" — a tela da §10 item 7 vista pelo próprio viajante.
 *
 * **O viajante vê apenas as próprias submissões, e o filtro está na consulta,
 * pelo uid dele** (§5.1). Não é esta tela que o limita: quem o limita é a
 * camada, junto do dado. Esconder item de menu não é controle de acesso, e
 * esconder linha de tabela também não.
 *
 * `colaborador` é o papel de menor privilégio do sistema — não abre painel, não
 * vê dado de terceiro, não vê agregado. Por isso esta tela é a versão dele da
 * sétima tela, e não uma "Emissões registradas" com filtro.
 */
import { numero, periodo, plural } from '@/lib/formato'
import { AcessoNegadoError } from '@/server/consultas/acesso'
import { consultarMinhasViagens } from '@/server/consultas/programa'
import { exigirSessao } from '@/server/sessao'
import { Casca } from '../../casca'
import { Cabecalho, Cartao, Grade, MINIMO, Nota, Painel, Revelar, Rolavel, TABELA, Vazio } from '../../componentes'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const NOME_DO_TIPO: Record<string, string> = { aereo: 'Avião', carro: 'Carro' }

export default async function Page() {
  const ctx = await exigirSessao()

  let dados
  try {
    dados = await consultarMinhasViagens(ctx)
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      return (
        <Casca ctx={ctx} atual="/programa/minhas-viagens">
          <Cabecalho titulo="Sem acesso" descricao={erro.message} />
        </Casca>
      )
    }
    throw erro
  }

  return (
    <Casca ctx={ctx} atual="/programa/minhas-viagens">
      <Cabecalho
        titulo="Minhas viagens"
        descricao="O que você registrou. Ninguém mais vê esta lista pelo seu nome fora da equipe do inventário, e o inventário da empresa não usa estes números."
        acao={
          <Link
            href="/programa/registrar"
            className="shrink-0 rounded-[9px] bg-[var(--color-folha-700)] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--color-folha-900)]"
          >
            Registrar viagem
          </Link>
        }
      />

      {dados.viagens.length === 0 ? (
        <Vazio>
          Você ainda não registrou nenhuma viagem. O formulário pede o mínimo para
          calcular a emissão e devolve o resultado na hora.
        </Vazio>
      ) : (
        <>
          <Revelar ordem={0}>
            <Grade tipo="duas">
              <Cartao
                rotulo="Suas viagens"
                valor={dados.viagens.length}
                casas={0}
                unidade={dados.viagens.length === 1 ? 'viagem' : 'viagens'}
                nota={plural(
                  dados.viagens.reduce((s, v) => s + v.trechos, 0),
                  'trecho registrado',
                  'trechos registrados',
                )}
              />
              <Cartao
                rotulo="Sua emissão"
                valor={dados.co2Kg}
                unidade="kg CO₂e"
                nota="Num carro compartilhado, a emissão é do veículo e o que aparece aqui é a sua parte, dividida pelos ocupantes."
              />
            </Grade>
          </Revelar>

          <Revelar ordem={1} className="mt-4">
            <Painel titulo="Registradas" descricao="Mais recentes primeiro.">
              <Rolavel minimo={MINIMO.tabela5}>
                <table className={TABELA.tabela}>
                  <thead>
                    <tr>
                      <th className={TABELA.th}>Rota</th>
                      <th className={TABELA.th}>Período</th>
                      <th className={TABELA.th}>Modal</th>
                      <th className={TABELA.thNum}>kg CO₂e</th>
                      <th className={TABELA.th} />
                    </tr>
                  </thead>
                  <tbody>
                    {dados.viagens.map((v) => (
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
                          {v.ocupantes !== null && v.ocupantes > 1
                            ? ` · ${v.ocupantes} ocupantes`
                            : ''}
                        </td>
                        <td className={TABELA.tdNum} data-rotulo="kg CO₂e">{numero(v.co2Kg)}</td>
                        <td className={`${TABELA.td} text-right`}>
                          {v.editavel ? (
                            <Link
                              href={`/programa/registrar?viagem=${encodeURIComponent(v.reservaId)}`}
                              className="text-[12.5px] text-[var(--color-folha-900)] underline underline-offset-2"
                            >
                              Editar
                            </Link>
                          ) : (
                            <span
                              className="text-[12.5px] text-[var(--color-apoio)]/70"
                              title="Período fechado: o registro continua valendo e não muda mais."
                            >
                              fechada
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Rolavel>
              {dados.fechadoAte !== null && (
                <Nota>
                  Viagem com ida até {dados.fechadoAte} está em período fechado e não é
                  mais editável. Fechar congela o que já foi registrado — nada é apagado,
                  e o que está fechado continua contando.
                </Nota>
              )}
            </Painel>
          </Revelar>
        </>
      )}
    </Casca>
  )
}

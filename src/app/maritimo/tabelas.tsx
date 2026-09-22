/**
 * As duas tabelas da tela de Marítimo — CLAUDE.md §10.4.
 *
 * **As duas são só marítimo, nas duas pontas de cada conta.** O frete aéreo de
 * fornecedor está no total do módulo e fora daqui: ele não tem contêiner, e o
 * destino dele é um aeroporto ou um ponto interior — numa tabela cuja unidade é
 * contêiner por porto, quatro linhas sem contêiner nenhum não são um corredor
 * pequeno, são outra coisa. Quem declara isso é `ForaDoIndicador`, e está numa
 * peça só porque aparece em três lugares desta tela.
 *
 * **Não há supressão aqui** (§3.1.3). Embarque não tem pessoa: um limite mediria
 * número de embarques fingindo medir privacidade, e esconderia corredor pouco
 * usado sem proteger ninguém.
 *
 * Nome de porto, de agente, de navio e de cliente chega do banco em tempo de
 * execução e **nunca é escrito aqui** (§2.2).
 */
import { inteiro, numero, periodo, proporcao } from '@/lib/formato'
import type { CorredorMaritimo, ResumoDeMaritimo } from '@/server/consultas/inventario'
import { MINIMO, Nota, Rolavel, TABELA, Vazio } from '../componentes'

/**
 * O que está no total do módulo e fora de tudo que é por contêiner.
 *
 * Texto único, usado na nota do indicador, na legenda do mapa e sob as duas
 * tabelas. Duplicá-lo seria garantir que uma das cópias envelhecesse — foi a
 * lição registrada quando a frase do mapa de Viagens virou componente.
 *
 * **É o fato, sem o porquê.** Ele aparece quatro vezes na mesma tela, e quatro
 * cópias de um parágrafo afogam o dado que elas qualificam. O que precisa estar
 * visível é o recorte — estes embarques somam no total e não entram em nada que
 * seja por contêiner —, porque sem ele o mapa soma menos que o número e é lido
 * como falha de carga. **O motivo é lastro e mora no resumo da tela** (§11.5),
 * uma vez só.
 */
export function ForaDoIndicador({ dados }: { dados: ResumoDeMaritimo }) {
  if (dados.embarquesAereos === 0) return null
  const proporcaoAerea = dados.co2Kg === 0 ? 0 : dados.co2KgAereo / dados.co2Kg

  return (
    <>
      {inteiro(dados.embarquesAereos)}{' '}
      {dados.embarquesAereos === 1 ? 'embarque é frete' : 'embarques são frete'} aéreo
      ({proporcao(proporcaoAerea)} da emissão): soma no total e fica fora de tudo que
      é por contêiner.
    </>
  )
}

/* ------------------------------------------------------------- corredores */

export function TabelaDeCorredores({
  corredores,
  nota,
}: {
  corredores: CorredorMaritimo[]
  nota?: React.ReactNode
}) {
  if (corredores.length === 0) return <Vazio>Nenhum corredor neste recorte.</Vazio>

  const total = corredores.reduce((s, c) => s + c.co2Kg, 0)
  const maior = corredores.reduce((m, c) => Math.max(m, c.co2Kg), 0)

  return (
    <>
      <Rolavel minimo={MINIMO.tabela5}>
        <table className={TABELA.tabela}>
          <thead>
            <tr>
              <th className={TABELA.th}>Corredor</th>
              <th className={TABELA.thNum}>Embarques</th>
              <th className={TABELA.thNum}>Contêineres</th>
              <th className={TABELA.th}>Período</th>
              <th className={TABELA.thNum}>kg CO₂</th>
            </tr>
          </thead>
          <tbody>
            {corredores.map((c) => (
              <tr key={c.corredor}>
                <td className={TABELA.td}>
                  <span className="text-[var(--color-tinta)]">
                    {c.origemRotulo} → {c.destinoRotulo}
                  </span>
                  <span className="mt-1 block h-1.5 w-full overflow-hidden rounded bg-[#E7EFE5]">
                    <span
                      className="block h-full rounded bg-[var(--color-folha-700)]"
                      style={{ width: `${maior > 0 ? (c.co2Kg / maior) * 100 : 0}%` }}
                    />
                  </span>
                </td>
                <td className={TABELA.tdNum} data-rotulo="Embarques">
                  {inteiro(c.embarques)}
                </td>
                <td className={TABELA.tdNum} data-rotulo="Contêineres">
                  {inteiro(c.containers)}
                </td>
                <td
                  className={`${TABELA.td} text-[var(--color-apoio)]`}
                  data-rotulo="Período"
                >
                  {periodo(c.primeira, c.ultima)}
                </td>
                <td className={TABELA.tdNum} data-rotulo="kg CO₂">
                  {numero(c.co2Kg)}
                  {total > 0 && (
                    <span className="ml-1.5 text-[11px] text-[var(--color-apoio)]/70">
                      {proporcao(c.co2Kg / total)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Rolavel>
      {nota !== undefined && <Nota>{nota}</Nota>}
    </>
  )
}

/* ---------------------------------------------------- contêineres por porto */

export function TabelaDePortos({
  portos,
  nota,
}: {
  portos: ResumoDeMaritimo['porPorto']
  nota?: React.ReactNode
}) {
  if (portos.length === 0) return <Vazio>Nenhum desembarque neste recorte.</Vazio>

  const maior = portos.reduce((m, p) => Math.max(m, p.containers), 0)
  const total = portos.reduce((s, p) => s + p.containers, 0)

  return (
    <>
      <Rolavel minimo={MINIMO.tabela3}>
        <table className={TABELA.tabela}>
          <thead>
            <tr>
              <th className={TABELA.th}>Porto de desembarque</th>
              <th className={TABELA.thNum}>Contêineres</th>
              <th className={TABELA.thNum}>kg CO₂</th>
            </tr>
          </thead>
          <tbody>
            {portos.map((p) => (
              <tr key={p.porto}>
                <td className={TABELA.td}>
                  <span
                    className={
                      p.porto === ''
                        ? 'text-[var(--color-apoio)] italic'
                        : 'text-[var(--color-tinta)]'
                    }
                  >
                    {p.rotulo}
                  </span>
                  <span className="mt-1 block h-1.5 w-full overflow-hidden rounded bg-[#E7EFE5]">
                    <span
                      className="block h-full rounded bg-[var(--color-folha-700)]"
                      style={{
                        width: `${maior > 0 ? (p.containers / maior) * 100 : 0}%`,
                      }}
                    />
                  </span>
                </td>
                <td className={TABELA.tdNum} data-rotulo="Contêineres">
                  {inteiro(p.containers)}
                  {total > 0 && (
                    <span className="ml-1.5 text-[11px] text-[var(--color-apoio)]/70">
                      {proporcao(p.containers / total)}
                    </span>
                  )}
                </td>
                <td className={TABELA.tdNum} data-rotulo="kg CO₂">
                  {numero(p.co2Kg)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Rolavel>
      {nota !== undefined && <Nota>{nota}</Nota>}
    </>
  )
}

/* ------------------------------------------------------- qualidade do dado */

/**
 * O rodapé que a §8.2 exige, em uma linha.
 *
 * Ele responde "quanto deste número veio do agente" — e, quando tudo veio, diz
 * isso em vez de sumir: rodapé ausente se lê como pergunta não respondida.
 *
 * **Desde que os contêineres sem detalhe de agente entraram, ele carrega também
 * a contagem**, e essa é a ressalva que impede a leitura errada (§11.5): a
 * proporção sozinha diz que parte do número é estimada, e não diz que a maior
 * parte da operação nunca teve linha de relatório nenhuma. Quem precisa dessa
 * frase é justamente quem não vai abrir o resumo.
 */
export function QualidadeDoDado({ dados }: { dados: ResumoDeMaritimo }) {
  const medido = dados.qualidade.find((q) => q.nivel === 'medido')?.proporcao ?? 0
  const semDetalhe = dados.residuo.containers

  return (
    <Nota>
      <strong className="font-medium text-[var(--color-tinta)]">
        {proporcao(medido)} deste número vem de dado do agente
      </strong>
      {medido >= 1 ? (
        ', e não há estimativa neste recorte.'
      ) : semDetalhe === 0 ? (
        '; o restante é estimativa por média de contêiner.'
      ) : (
        <>
          ; o restante são {semDetalhe} de {dados.containers} contêineres que nenhum agente
          detalhou linha a linha, com a emissão estimada pela média medida no porto de
          desembarque. A contagem deles vem do registro de DI, e não da partida.
        </>
      )}
    </Nota>
  )
}

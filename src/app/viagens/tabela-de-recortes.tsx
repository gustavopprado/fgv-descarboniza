/**
 * Tabela de destinos e de rotas — CLAUDE.md §3.1.2 e §10.3.
 *
 * **Diz quantas pessoas e quando, nunca quem.** É a distinção da §3.1: o objeto
 * do painel é a empresa, e a rota é fato da operação dela; o que continua
 * absolutamente fora é nome, matrícula, e-mail ou qualquer identificador — a
 * tabela mostra emissão por rota, jamais a lista de quem voou.
 *
 * **A linha de resto não é supressão**, e o rodapé diz isso em texto. A
 * diferença importa: o balde de "outros" da Mobilidade existe para não
 * identificar ninguém e não pode ser aberto; aqui o corte é de leitura, e o que
 * ele reúne está inteiro nos totais desta tela. Sem essa frase, quem lembra da
 * versão anterior desta tela lê a linha como a supressão que acabou de sair.
 */
import { inteiro, numero, periodo, proporcao } from '@/lib/formato'
import type { RecorteDeViagem } from '@/server/consultas/agregacao'
import { Nota, TABELA, Vazio } from '../componentes'

export function TabelaDeRecortes({
  recortes,
  cabecalho,
  nota,
}: {
  recortes: RecorteDeViagem[]
  /** Título da primeira coluna: "Destino" ou "Rota". */
  cabecalho: string
  nota?: React.ReactNode
}) {
  if (recortes.length === 0) {
    return <Vazio>Nada a exibir neste recorte.</Vazio>
  }

  const total = recortes.reduce((s, r) => s + r.co2Kg, 0)
  const maior = recortes.reduce((m, r) => Math.max(m, r.co2Kg), 0)
  const resto = recortes.find((r) => r.resto)

  return (
    <>
      <table className={TABELA.tabela}>
        <thead>
          <tr>
            <th className={TABELA.th}>{cabecalho}</th>
            <th className={TABELA.thNum}>Pessoas</th>
            <th className={TABELA.thNum}>Trechos</th>
            <th className={TABELA.th}>Período</th>
            <th className={TABELA.thNum}>kg CO₂</th>
          </tr>
        </thead>
        <tbody>
          {recortes.map((r) => (
            <tr key={r.rotulo}>
              <td className={TABELA.td}>
                <span
                  className={
                    r.resto ? 'text-[var(--color-apoio)] italic' : 'text-[var(--color-tinta)]'
                  }
                >
                  {r.rotulo}
                </span>
                {/* A barra fica sob o rótulo: a coluna numérica já carrega o
                    valor, e a barra existe para dar a proporção de relance. */}
                <span className="mt-1 block h-1.5 w-full overflow-hidden rounded bg-[#E7EFE5]">
                  <span
                    className="block h-full rounded bg-[var(--color-folha-700)]"
                    style={{ width: `${maior > 0 ? (r.co2Kg / maior) * 100 : 0}%` }}
                  />
                </span>
              </td>
              <td className={TABELA.tdNum}>{inteiro(r.pessoas)}</td>
              <td className={TABELA.tdNum}>{inteiro(r.trechos)}</td>
              {/* Sem `nowrap`: espremida, a coluna quebra no travessão entre as
                  duas datas, que é o único lugar onde a quebra não atrapalha.
                  Fixar a largura faria a tabela estourar o painel. */}
              <td className={`${TABELA.td} text-[var(--color-apoio)]`}>
                {periodo(r.primeira, r.ultima)}
              </td>
              <td className={TABELA.tdNum}>
                {numero(r.co2Kg)}
                {total > 0 && (
                  <span className="ml-1.5 text-[11px] text-[var(--color-apoio)]/70">
                    {proporcao(r.co2Kg / total)}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {(resto !== undefined || nota !== undefined) && (
        <Nota>
          {resto !== undefined && (
            <>
              A última linha soma {inteiro(resto.recortes)} recortes menores para a
              tabela caber.{' '}
              <strong className="font-medium text-[var(--color-tinta)]">
                Não é supressão
              </strong>
              : nada foi escondido por causa de quantas pessoas voaram, e o valor está
              inteiro nos totais desta tela.{' '}
            </>
          )}
          {nota}
        </Nota>
      )}
    </>
  )
}

/**
 * O que aconteceu numa região — CLAUDE.md §3.1.2 e §10.3.
 *
 * Abre ao clicar num ponto do mapa e responde uma pergunta só: **quanto, quantos
 * e quando**, por corredor. Não é uma lista de viagens e não é uma lista de
 * pessoas: é o mesmo agregado da tabela, recortado pelo lugar que se clicou.
 *
 * **A distinção importa e é a da §3.1.2.** Rota é fato da operação da empresa e
 * por isso aparece; a tela mostra emissão por rota, nunca a relação do que cada
 * um fez. Uma linha por viagem, com data exata, deixaria de ser emissão por rota
 * e viraria registro de deslocamento — é outra decisão, e não foi tomada.
 */
import { inteiro, numero, periodo, plural } from '@/lib/formato'
import type { MapaDeCorredores } from '@/server/consultas/inventario'
import { Nota, TABELA, Vazio } from '../componentes'

export function RegiaoAberta({
  mapa,
  regiao,
  fechar,
}: {
  mapa: MapaDeCorredores
  regiao: string
  /** Endereço que fecha o recorte — o mesmo mapa, sem região. */
  fechar: string
}) {
  const resumo = mapa.regioes.find((r) => r.regiao === regiao)
  if (resumo === undefined) {
    return (
      <Vazio>
        Nenhum corredor aéreo desenhado toca {regiao} neste recorte.{' '}
        <a href={fechar} className="underline">
          Voltar ao mapa
        </a>
        .
      </Vazio>
    )
  }

  const corredores = mapa.corredores
    .filter((c) => c.origemRegiao === regiao || c.destinoRegiao === regiao)
    .sort((a, b) => b.co2Kg - a.co2Kg)

  return (
    <div className="revelar mt-4 rounded-[11px] border border-[var(--color-linha)] bg-[var(--color-fundo)] px-4 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-[13.5px] font-semibold text-[var(--color-tinta)]">
          {regiao}
        </h3>
        <a
          href={fechar}
          className="text-[12px] text-[var(--color-apoio)] underline underline-offset-2"
        >
          fechar
        </a>
      </div>

      <p className="mt-0.5 text-[12.5px] text-[var(--color-apoio)]">
        {plural(resumo.trechos, 'trecho', 'trechos')} pousando ou decolando ali, de{' '}
        {plural(resumo.pessoas, 'pessoa', 'pessoas')}, somando{' '}
        {numero(resumo.co2Kg)} kg CO₂ — {periodo(resumo.primeira, resumo.ultima)}.
      </p>

      <table className={`${TABELA.tabela} mt-3.5`}>
        <thead>
          <tr>
            <th className={TABELA.th}>Corredor</th>
            <th className={TABELA.thNum}>Pessoas</th>
            <th className={TABELA.thNum}>Trechos</th>
            <th className={TABELA.th}>Período</th>
            <th className={TABELA.thNum}>kg CO₂</th>
          </tr>
        </thead>
        <tbody>
          {corredores.map((c) => (
            <tr key={c.corredor}>
              <td className={TABELA.td}>
                {c.origemRegiao === c.destinoRegiao
                  ? `dentro de ${c.origemRegiao}`
                  : c.corredor}
              </td>
              <td className={TABELA.tdNum}>{inteiro(c.pessoas)}</td>
              <td className={TABELA.tdNum}>{inteiro(c.trechos)}</td>
              <td className={`${TABELA.td} text-[var(--color-apoio)]`}>
                {periodo(c.primeira, c.ultima)}
              </td>
              <td className={TABELA.tdNum}>{numero(c.co2Kg)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Nota>
        {/* Quem somar as colunas vai achar dois números diferentes do cabeçalho,
            e precisa saber por quê antes de concluir que um deles está errado. */}
        Trechos e emissão somam com o cabeçalho; <strong className="font-medium">
        pessoas não soma</strong>, porque quem voou por dois corredores conta uma
        vez no total da região. E um trecho entre duas regiões conta nas duas: é o
        deslocamento que tocou este lugar, não uma divisão da emissão entre eles —
        somar regiões passaria do total do módulo.
      </Nota>
    </div>
  )
}

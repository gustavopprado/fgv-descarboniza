/**
 * O que acontece numa faixa de distância — CLAUDE.md §3.1.1 e §11.2.
 *
 * Abre ao clicar num anel do radar e responde duas perguntas: **quantos moram
 * a esta distância e como eles se deslocam**. Não é uma lista de pessoas, e não
 * pode virar uma: o recorte é o anel, e o modal vem agregado, com a supressão
 * de grupo pequeno por cima.
 *
 * **Quando a faixa é pequena, o modal inteiro cai no balde** — e isso é o
 * resultado certo, não uma falha do painel. Num anel com poucas pessoas, dizer
 * que quem mora ali vai de moto é dizer de quem é a moto. A contagem da faixa
 * continua aparecendo porque ela não é informação nova: o radar já desenha um
 * ponto por pessoa, e contá-los é olhar o desenho.
 */
import { rotuloDoTransporte } from '@/lib/calculo/mobilidade'
import { numero, plural } from '@/lib/formato'
import type { FaixaDoRadar } from '@/server/consultas/inventario'
import { ListaDeGrupos, Nota, Vazio } from '../componentes'

export function FaixaAberta({
  faixa,
  fechar,
}: {
  faixa: FaixaDoRadar
  /** Endereço que fecha o recorte — a mesma tela, sem faixa. */
  fechar: string
}) {
  const soSuprimidos =
    faixa.porModal.length > 0 && faixa.porModal.every((g) => g.agrupadoPorSupressao)

  return (
    <div className="revelar mt-4 rounded-[11px] border border-[var(--color-linha)] bg-[var(--color-fundo)] px-4 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-[13.5px] font-semibold text-[var(--color-tinta)]">
          De {numero(faixa.deKm, 0)} a {numero(faixa.ateKm, 0)} km da fábrica
        </h3>
        <a
          href={fechar}
          className="text-[12px] text-[var(--color-apoio)] underline underline-offset-2"
        >
          fechar
        </a>
      </div>

      {faixa.pessoas === 0 ? (
        <Vazio>Ninguém mora nesta faixa.</Vazio>
      ) : (
        <>
          <p className="mt-0.5 max-w-[80ch] text-[12.5px] text-[var(--color-apoio)]">
            {plural(faixa.pessoas, 'pessoa', 'pessoas')}, a{' '}
            {numero(faixa.distanciaKmMedia)} km em média, somando{' '}
            {numero(faixa.co2Kg)} kg CO₂ por mês.
          </p>

          <div className="mt-3.5">
            <ListaDeGrupos
              grupos={faixa.porModal.map((g) => ({
                ...g,
                rotulo: rotuloDoTransporte(g.rotulo),
              }))}
            />
          </div>

          {soSuprimidos ? (
            <Nota>
              Pouca gente mora nesta faixa para separar o modal: dizer como este
              punhado de pessoas se desloca seria dizer de quem é cada
              deslocamento. A emissão delas continua inteira no total da tela.
            </Nota>
          ) : (
            <Nota>
              A emissão é a taxa mensal de quem mora nesta faixa; somando as
              faixas se chega ao total da tela, porque cada pessoa cai em uma só.
            </Nota>
          )}
        </>
      )}
    </div>
  )
}

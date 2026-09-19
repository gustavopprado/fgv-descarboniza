/**
 * Tela de Mobilidade — CLAUDE.md §10.2.
 *
 * Escopo 3, categoria 7: o deslocamento casa-trabalho do quadro. A métrica
 * exibida é **kg CO₂ por funcionário por mês** (§1), e o total anual sai dela
 * pela conversão explícita da camada de consulta.
 *
 * Nada aqui identifica ninguém (§3.1): os recortes por bairro e cidade já vêm
 * com supressão de grupo pequeno, e o radar recebe só distâncias.
 */
import { opcional } from '@/lib/env'
import { inteiro, plural } from '@/lib/formato'
import { AcessoNegadoError } from '@/server/consultas/acesso'
import { consultarMobilidade } from '@/server/consultas/inventario'
import { exigirSessao } from '@/server/sessao'
import { Casca } from '../casca'
import {
  Cabecalho,
  Cartao,
  Grade,
  ListaDeGrupos,
  Nota,
  Painel,
  Revelar,
  Vazio,
} from '../componentes'
import { GraficoDeBarras } from '../grafico-de-barras'
import { Radar } from './radar'

export const dynamic = 'force-dynamic'

/**
 * Os quatro recortes desta tela numa grade só — CLAUDE.md §10.2.
 *
 * **Em tela larga a linha ganha uma terceira coluna, e o motivo é aritmético.**
 * As duas peças desenhadas aqui têm largura natural: o radar tem teto de 615px e
 * o gráfico de modal, de 425px. Somadas com o respiro dos painéis, elas pedem
 * pouco mais de 1100px — e num monitor de 2000 a linha tem 1750. Sobravam ~620px
 * que nenhuma das duas sabia usar, e mexer na razão 1,55:1 só transferia o branco
 * de um painel para o outro. **Excedente estrutural não se resolve com proporção;
 * resolve-se com uma coluna a mais.**
 *
 * Com três colunas o radar cai para ~527px — dentro da faixa em que ele já é
 * desenhado em telas menores, então nada da calibração dele muda — e passa a
 * ocupar a coluna inteira, sem sobra.
 *
 * **Abaixo de `xl` a estrutura é a de antes**: `lg` divide em 1,55fr/1fr e a
 * ordem natural da grade reproduz as duas linhas que existiam — radar ao lado do
 * gráfico, cidade ao lado de bairro. Abaixo de `lg`, coluna única.
 *
 * A colocação é explícita em vez de duplicar painel no DOM com `hidden`: painel
 * duplicado é conteúdo duplicado para leitor de tela, animação rodando duas vezes
 * e duas cópias para envelhecerem em desacordo.
 */
const GRADE_DOS_RECORTES =
  'mt-4 grid items-start gap-4 [&>*]:min-w-0 lg:grid-cols-[1.55fr_1fr] xl:grid-cols-3'

/**
 * Onde cada painel cai quando a terceira coluna aparece.
 *
 * O radar e a lista de bairros atravessam as duas linhas porque são altos; o
 * gráfico e a lista de cidades empilham no meio. Se o radar ficar mais alto que
 * os dois do meio somados, a grade cresce e a folga aparece embaixo de cada um
 * deles — é o pior caso, e é suave.
 */
const LUGAR = {
  radar: 'xl:col-start-1 xl:row-start-1 xl:row-span-2',
  modal: 'xl:col-start-2 xl:row-start-1',
  cidade: 'xl:col-start-2 xl:row-start-2',
  bairro: 'xl:col-start-3 xl:row-start-1 xl:row-span-2',
} as const

function anoBaseDe(parametro: string | undefined): number | null {
  const bruto = parametro ?? opcional('MOBILIDADE_ANO_BASE')
  if (bruto === undefined) return null
  const ano = Number(bruto)
  return Number.isInteger(ano) && ano > 2000 && ano < 2100 ? ano : null
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string }>
}) {
  const ctx = await exigirSessao()
  const anoBase = anoBaseDe((await searchParams).ano)

  if (anoBase === null) {
    return (
      <Casca ctx={ctx} atual="/mobilidade">
        <Cabecalho titulo="Mobilidade casa-trabalho" />
        <Vazio>
          Nenhum ano-base indicado. Informe <code>?ano=AAAA</code> no endereço ou
          configure <code>MOBILIDADE_ANO_BASE</code> no ambiente.
        </Vazio>
      </Casca>
    )
  }

  let dados
  try {
    dados = await consultarMobilidade(ctx, { anoBase })
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      return (
        <Casca ctx={ctx} atual="/mobilidade">
          <Cabecalho titulo="Sem acesso" descricao={erro.message} />
        </Casca>
      )
    }
    throw erro
  }

  const excecoes = dados.excecoes.reduce((s, e) => s + e.respostas, 0)

  return (
    <Casca ctx={ctx} atual="/mobilidade">
      <Cabecalho
        titulo="Mobilidade casa-trabalho"
        descricao={`Emissão do deslocamento diário entre a residência e a fábrica, a partir da pesquisa de mobilidade do ano-base ${dados.anoBase}. A pesquisa é anual: o valor é uma taxa mensal, e é a mesma em todos os meses do ano.`}
      />

      {dados.respondentes === 0 ? (
        <Vazio>Nenhuma resposta carregada para o ano-base {dados.anoBase}.</Vazio>
      ) : (
        <>
          <Revelar ordem={0}>
            <Grade tipo="tres">
              <Cartao
                rotulo="Por funcionário, por mês"
                valor={dados.co2KgMesPorFuncionario}
                unidade="kg CO₂"
                nota={`Média de ${plural(dados.respondentes, 'resposta', 'respostas')}, com ${inteiro(dados.diasUteisMes)} dias úteis no mês.`}
              />
              <Cartao
                rotulo="Total no ano"
                valor={dados.co2ToneladasAno}
                casas={2}
                unidade="t CO₂e"
                nota="A taxa mensal do quadro, repetida nos doze meses do ano-base."
              />
              <Cartao
                rotulo="Distância média"
                valor={dados.distanciaKmMedia}
                unidade="km"
                nota="Deslocamento só de ida; cada dia útil conta ida e volta."
              />
            </Grade>
          </Revelar>

          <div className={GRADE_DOS_RECORTES}>
            <Revelar ordem={1} className={LUGAR.radar}>
              <Painel
                titulo="Onde o quadro mora"
                descricao="Cada ponto é uma pessoa, posicionada pela distância até a fábrica."
              >
                <Radar distanciasKm={dados.radarDistanciasKm} />
              </Painel>
            </Revelar>

            <Revelar ordem={2} className={LUGAR.modal}>
              <Painel
                titulo="Emissão por modal"
                descricao="kg CO₂ por funcionário por mês, somado no modal."
              >
                <GraficoDeBarras
                  barras={dados.porModal.map((g) => ({
                    rotulo: g.rotulo,
                    valor: g.co2Kg,
                    atenuada: g.agrupadoPorSupressao,
                  }))}
                  unidade="kg CO₂"
                  largura={340}
                  altura={280}
                />
                <Nota>
                  Bicicleta e deslocamento a pé não emitem. O ônibus usa fator por
                  passageiro-quilômetro, e por isso emite bem menos por pessoa que o
                  transporte individual.
                  {dados.porModal.some((g) => g.agrupadoPorSupressao) && (
                    <>
                      {' '}
                      A barra mais clara reúne os modais com poucas pessoas, que não
                      podem aparecer separados sem identificar quem respondeu.
                    </>
                  )}
                </Nota>
              </Painel>
            </Revelar>

            <Revelar ordem={3} className={LUGAR.cidade}>
              <Painel titulo="Por cidade">
                <ListaDeGrupos grupos={dados.porCidade} />
              </Painel>
            </Revelar>

            <Revelar ordem={4} className={LUGAR.bairro}>
              <Painel titulo="Por bairro">
                <ListaDeGrupos grupos={dados.porBairro} />
              </Painel>
            </Revelar>
          </div>

          <p className="mt-6 max-w-[80ch] text-[12px] text-[var(--color-apoio)]/85">
            Recorte com poucas pessoas é agrupado em &ldquo;outros&rdquo;: um bairro
            com um respondente identificaria esse respondente mesmo sem o nome dele.
            {excecoes > 0 && (
              <>
                {' '}
                {plural(excecoes, 'resposta está', 'respostas estão')} fora da média
                como exceção, com o motivo listado na tela de Método.
              </>
            )}
          </p>
        </>
      )}
    </Casca>
  )
}

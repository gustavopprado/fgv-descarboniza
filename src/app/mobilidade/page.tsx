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
import { Cartao, ListaDeGrupos, Secao, Vazio } from '../componentes'
import { Radar } from './radar'

export const dynamic = 'force-dynamic'

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
        <h1 className="text-2xl font-semibold">Mobilidade</h1>
        <div className="mt-4">
          <Vazio>
            Nenhum ano-base indicado. Informe <code>?ano=AAAA</code> no endereço ou
            configure <code>MOBILIDADE_ANO_BASE</code> no ambiente.
          </Vazio>
        </div>
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
          <h1 className="text-xl font-semibold">Sem acesso</h1>
          <p className="mt-2 text-sm text-[var(--color-folha-900)]/70">{erro.message}</p>
        </Casca>
      )
    }
    throw erro
  }

  const semDados = dados.respondentes === 0
  const excecoes = dados.excecoes.reduce((s, e) => s + e.respostas, 0)

  return (
    <Casca ctx={ctx} atual="/mobilidade">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--color-folha-900)]">
          Mobilidade
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--color-folha-900)]/70">
          Deslocamento casa-trabalho do quadro, do ano-base {dados.anoBase}. Escopo 3,
          categoria 7. A pesquisa é anual: o valor é uma taxa mensal, e é a mesma em
          todos os meses do ano.
        </p>
      </header>

      {semDados ? (
        <div className="mt-6">
          <Vazio>
            Nenhuma resposta carregada para o ano-base {dados.anoBase}.
          </Vazio>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <Cartao
              rotulo="Por funcionário, por mês"
              valor={dados.co2KgMesPorFuncionario}
              unidade="kg CO₂"
              nota={`Média de ${plural(dados.respondentes, 'resposta', 'respostas')} na média, com ${inteiro(dados.diasUteisMes)} dias úteis no mês.`}
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
          </div>

          <Secao
            titulo="Onde o quadro mora"
            descricao="Um ponto por pessoa, posicionado pela distância até a fábrica."
          >
            <Radar distanciasKm={dados.radarDistanciasKm} />
          </Secao>

          <Secao
            titulo="Emissão por modal"
            descricao="Bicicleta e deslocamento a pé não emitem. O ônibus usa fator por passageiro-quilômetro, e por isso emite bem menos por pessoa que o transporte individual."
          >
            <ListaDeGrupos grupos={dados.porModal} />
          </Secao>

          <div className="grid gap-10 md:grid-cols-2">
            <Secao titulo="Por cidade">
              <ListaDeGrupos grupos={dados.porCidade} />
            </Secao>
            <Secao titulo="Por bairro">
              <ListaDeGrupos grupos={dados.porBairro} />
            </Secao>
          </div>

          <p className="mt-10 border-t border-[var(--color-folha-300)] pt-4 text-xs text-[var(--color-folha-900)]/55">
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

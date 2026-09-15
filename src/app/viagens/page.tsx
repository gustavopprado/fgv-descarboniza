/**
 * Tela de Viagens corporativas — CLAUDE.md §10.3.
 *
 * Aéreo e carro, das duas fontes separadas pela data de corte (§7). A métrica
 * exibida é **kg CO₂ por viagem** (§1), e viagem aqui é a reserva: a unidade de
 * cálculo é o trecho, mas quem lê o painel conta viagens.
 *
 * Nada identifica ninguém (§3.1): destinos, rotas e mapa já vêm com supressão
 * de recorte pequeno, e a rota suprimida não vira linha no mapa.
 */
import Link from 'next/link'

import { inteiro, numero, plural } from '@/lib/formato'
import { AcessoNegadoError } from '@/server/consultas/acesso'
import { consultarViagens } from '@/server/consultas/inventario'
import { exigirSessao } from '@/server/sessao'
import { Casca } from '../casca'
import { Cartao, ListaDeGrupos, Secao, Vazio } from '../componentes'
import { MapaDeRotasSvg } from './mapa-de-rotas'
import { SerieMensal } from './serie-mensal'

export const dynamic = 'force-dynamic'

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
    dados = await consultarViagens(ctx, ano === undefined ? {} : { ano })
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      return (
        <Casca ctx={ctx} atual="/viagens">
          <h1 className="text-xl font-semibold">Sem acesso</h1>
          <p className="mt-2 text-sm text-[var(--color-folha-900)]/70">{erro.message}</p>
        </Casca>
      )
    }
    throw erro
  }

  // Os anos disponíveis saem da própria série: não custa uma consulta a mais.
  const anos = [...new Set(dados.porMes.map((p) => Number(p.mes.slice(0, 4))))].sort()
  const semDados = dados.trechos === 0
  const empresaConhecida = dados.porEmpresa.some((g) => !g.rotulo.startsWith('Sem '))

  return (
    <Casca ctx={ctx} atual="/viagens">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--color-folha-900)]">
          Viagens corporativas
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--color-folha-900)]/70">
          Deslocamento aéreo e rodoviário a serviço. Escopo 3 categoria 6 no aéreo e
          no veículo de terceiro; Escopo 1 no veículo da frota. Cada trecho conta
          separado, e escala emite mais que um voo direto equivalente.
        </p>

        {anos.length > 1 && (
          <nav className="mt-4 flex flex-wrap gap-2 text-sm">
            <Link
              href="/viagens"
              className={
                ano === undefined
                  ? 'rounded bg-[var(--color-fgv)]/20 px-3 py-1 font-medium'
                  : 'rounded px-3 py-1 text-[var(--color-folha-900)]/70 hover:bg-[var(--color-folha-300)]/50'
              }
            >
              Todos os anos
            </Link>
            {anos.map((umAno) => (
              <Link
                key={umAno}
                href={`/viagens?ano=${umAno}`}
                className={
                  ano === umAno
                    ? 'rounded bg-[var(--color-fgv)]/20 px-3 py-1 font-medium'
                    : 'rounded px-3 py-1 text-[var(--color-folha-900)]/70 hover:bg-[var(--color-folha-300)]/50'
                }
              >
                {umAno}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {semDados ? (
        <div className="mt-6">
          <Vazio>
            Nenhum trecho carregado{ano === undefined ? '' : ` para ${ano}`}.
          </Vazio>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <Cartao
              rotulo="Por viagem"
              valor={numero(dados.co2KgPorViagem)}
              unidade="kg CO₂"
              nota={`${plural(dados.viagens, 'viagem', 'viagens')}, somando ${plural(dados.trechos, 'trecho', 'trechos')}.`}
            />
            <Cartao
              rotulo={ano === undefined ? 'Total do período' : `Total de ${ano}`}
              valor={numero(dados.co2ToneladasAno, 2)}
              unidade="t CO₂e"
            />
            <Cartao
              rotulo="Emissão total"
              valor={inteiro(dados.co2Kg)}
              unidade="kg CO₂"
              nota="Reserva duplicada no relatório da agência fica gravada e fora deste total."
            />
          </div>

          <Secao
            titulo="Emissão por mês"
            descricao="Pela data do voo ou da viagem, nunca pela data de lançamento da passagem."
          >
            <SerieMensal serie={dados.porMes} corteFonte={dados.corteFonte} />
          </Secao>

          <Secao titulo="Mapa de rotas">
            {dados.mapa.rotas.length === 0 ? (
              <Vazio>
                Nenhuma rota com coordenada para desenhar.
                {dados.mapa.suprimidas > 0 &&
                  ` ${plural(dados.mapa.suprimidas, 'rota ficou', 'rotas ficaram')} de fora por identificar quem voou.`}
              </Vazio>
            ) : (
              <>
                <MapaDeRotasSvg mapa={dados.mapa} />
                <p className="mt-2 max-w-3xl text-xs text-[var(--color-folha-900)]/55">
                  {dados.mapa.suprimidas > 0 && (
                    <>
                      {plural(dados.mapa.suprimidas, 'rota não aparece', 'rotas não aparecem')}{' '}
                      no mapa por serem voadas por pouca gente: a linha apontaria
                      para essa gente. Elas continuam somando no total.{' '}
                    </>
                  )}
                  {dados.mapa.semCoordenada > 0 && (
                    <>
                      {plural(
                        dados.mapa.semCoordenada,
                        'rota ficou de fora',
                        'rotas ficaram de fora',
                      )}{' '}
                      por falta de coordenada do aeroporto no cadastro.{' '}
                    </>
                  )}
                  Trechos de carro não são desenhados: a origem e o destino deles são
                  municípios, e a lista do IBGE ainda não foi carregada.
                </p>
              </>
            )}
          </Secao>

          <div className="grid gap-10 md:grid-cols-2">
            <Secao
              titulo="Destinos mais frequentes"
              descricao="Por emissão acumulada no destino."
            >
              <ListaDeGrupos grupos={dados.destinos} />
            </Secao>
            <Secao titulo="Rotas">
              <ListaDeGrupos grupos={dados.rotas} />
            </Secao>
          </div>

          <Secao titulo="Por modal">
            <ListaDeGrupos grupos={dados.porModal} mostrarPessoas={false} />
          </Secao>

          <Secao titulo="Por empresa">
            {empresaConhecida ? (
              <ListaDeGrupos grupos={dados.porEmpresa} mostrarPessoas={false} />
            ) : (
              <Vazio>
                A base de viagens ainda não informa a empresa por trecho, então tudo
                aparece como &ldquo;sem empresa&rdquo;. O campo existe desde já para
                não exigir migração quando a origem passar a informá-lo.
              </Vazio>
            )}
          </Secao>

          <p className="mt-10 border-t border-[var(--color-folha-300)] pt-4 text-xs text-[var(--color-folha-900)]/55">
            Recorte com poucas pessoas é agrupado em &ldquo;outros&rdquo;. A classe
            econômica é assumida em todos os trechos do histórico, porque o relatório
            da agência não informa a cabine — essa e as demais escolhas que mudam o
            número estão na tela de Método.
          </p>
        </>
      )}
    </Casca>
  )
}

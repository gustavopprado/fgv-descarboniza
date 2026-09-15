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
import { plural } from '@/lib/formato'
import { AcessoNegadoError } from '@/server/consultas/acesso'
import { consultarViagens } from '@/server/consultas/inventario'
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
  SeletorDeAno,
  Vazio,
} from '../componentes'
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
          <Cabecalho titulo="Sem acesso" descricao={erro.message} />
        </Casca>
      )
    }
    throw erro
  }

  // Os anos disponíveis saem da própria série: não custa uma consulta a mais.
  const anos = [...new Set(dados.porMes.map((p) => Number(p.mes.slice(0, 4))))].sort()
  const empresaConhecida = dados.porEmpresa.some((g) => !g.rotulo.startsWith('Sem '))

  return (
    <Casca ctx={ctx} atual="/viagens">
      <Cabecalho
        titulo="Viagens corporativas"
        descricao="Deslocamento aéreo e rodoviário a serviço. Escopo 3 categoria 6 no aéreo e no veículo de terceiro; Escopo 1 no veículo da frota. Cada trecho conta separado, e escala emite mais que um voo direto equivalente."
        acao={
          <SeletorDeAno
            anos={anos}
            atual={ano ?? null}
            href={(a) => (a === null ? '/viagens' : `/viagens?ano=${a}`)}
          />
        }
      />

      {dados.trechos === 0 ? (
        <Vazio>Nenhum trecho carregado{ano === undefined ? '' : ` para ${ano}`}.</Vazio>
      ) : (
        <>
          <Revelar ordem={0}>
            <Grade tipo="tres">
              <Cartao
                rotulo="Por viagem"
                valor={dados.co2KgPorViagem}
                unidade="kg CO₂"
                nota={`${plural(dados.viagens, 'viagem', 'viagens')}, somando ${plural(dados.trechos, 'trecho', 'trechos')}.`}
              />
              <Cartao
                rotulo={ano === undefined ? 'Total do período' : `Total de ${ano}`}
                valor={dados.co2ToneladasAno}
                casas={2}
                unidade="t CO₂e"
                nota="Reserva duplicada no relatório da agência fica gravada e fora deste total."
              />
              <Cartao
                rotulo="Emissão total"
                valor={dados.co2Kg}
                casas={0}
                unidade="kg CO₂"
              />
            </Grade>
          </Revelar>

          <Revelar ordem={1} className="mt-4">
            <Painel
              titulo="Emissão por mês"
              descricao="Pela data do voo ou da viagem, nunca pela data de lançamento da passagem."
            >
              <SerieMensal serie={dados.porMes} corteFonte={dados.corteFonte} />
            </Painel>
          </Revelar>

          <Revelar ordem={2} className="mt-4">
            <Painel
              titulo="Para onde a empresa voa"
              descricao="Espessura da linha proporcional à emissão da rota no período."
            >
              {dados.mapa.rotas.length === 0 ? (
                <Vazio>
                  Nenhuma rota com coordenada para desenhar.
                  {dados.mapa.suprimidas > 0 &&
                    ` ${plural(dados.mapa.suprimidas, 'rota ficou', 'rotas ficaram')} de fora por identificar quem voou.`}
                </Vazio>
              ) : (
                <>
                  <MapaDeRotasSvg mapa={dados.mapa} />
                  <Nota>
                    {dados.mapa.suprimidas > 0 && (
                      <>
                        {plural(
                          dados.mapa.suprimidas,
                          'rota não aparece',
                          'rotas não aparecem',
                        )}{' '}
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
                    Trechos de carro não são desenhados: a origem e o destino deles
                    são municípios, e a lista do IBGE ainda não foi carregada.
                  </Nota>
                </>
              )}
            </Painel>
          </Revelar>

          <Revelar ordem={3} className="mt-4">
            <Grade tipo="duas">
              <Painel
                titulo="Destinos mais frequentes"
                descricao="Por emissão acumulada no destino."
              >
                <ListaDeGrupos grupos={dados.destinos} />
              </Painel>
              <Painel titulo="Rotas" descricao="Por emissão acumulada no par.">
                <ListaDeGrupos grupos={dados.rotas} />
              </Painel>
            </Grade>
          </Revelar>

          <Revelar ordem={4} className="mt-4">
            <Grade tipo="duas">
              <Painel titulo="Por modal">
                <ListaDeGrupos grupos={dados.porModal} mostrarPessoas={false} />
              </Painel>
              <Painel titulo="Por empresa">
                {empresaConhecida ? (
                  <ListaDeGrupos grupos={dados.porEmpresa} mostrarPessoas={false} />
                ) : (
                  <Vazio>
                    A base de viagens ainda não informa a empresa por trecho, então
                    tudo aparece como &ldquo;sem empresa&rdquo;. O campo existe desde
                    já para não exigir migração quando a origem passar a informá-lo.
                  </Vazio>
                )}
              </Painel>
            </Grade>
          </Revelar>

          <p className="mt-6 max-w-[80ch] text-[12px] text-[var(--color-apoio)]/85">
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

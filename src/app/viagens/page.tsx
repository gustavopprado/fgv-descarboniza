/**
 * Tela de Viagens corporativas — CLAUDE.md §10.3.
 *
 * Aéreo e carro, das duas fontes administrativas do módulo: o relatório da
 * agência e a planilha do cartão empresarial (§7). Não há data de corte e não há
 * troca de fonte no tempo — **o que os colaboradores registram no programa de
 * viagens não aparece em tela nenhuma daqui** (§0.1).
 *
 * A métrica exibida é **kg CO₂ por viagem** (§1), e viagem aqui é a reserva: a
 * unidade de cálculo é o trecho, mas quem lê o painel conta viagens.
 *
 * **Nada identifica ninguém, e rota não é supressa** (§3.1.2). Nome, matrícula,
 * e-mail e qualquer identificador continuam fora, e nenhum deles trafega para o
 * cliente — o agregado sai pronto do servidor. O que mudou é que destino,
 * corredor e rota aparecem: são fato da operação da empresa, e escondê-los
 * deixava um terço da emissão aérea sem lugar no mapa sem proteger ninguém.
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
  Painel,
  Revelar,
  SeletorDeAno,
  Vazio,
} from '../componentes'
import { MapaDeRotasSvg, NaoDesenhado } from './mapa-de-rotas'
import { RegiaoAberta } from './regiao-aberta'
import { SerieMensal } from './serie-mensal'
import { TabelaDeRecortes } from './tabela-de-recortes'

export const dynamic = 'force-dynamic'

function anoDe(parametro: string | undefined): number | undefined {
  if (parametro === undefined) return undefined
  const ano = Number(parametro)
  return Number.isInteger(ano) && ano > 2000 && ano < 2100 ? ano : undefined
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string; regiao?: string }>
}) {
  const ctx = await exigirSessao()
  const parametros = await searchParams
  const ano = anoDe(parametros.ano)

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

  // **A região aberta no mapa é conferida contra o que existe, não aceita como
  // veio.** O parâmetro chega do endereço, e endereço é entrada de fora: sem
  // esta linha, qualquer texto na URL viraria título de painel na tela.
  const regiao =
    dados.mapa.regioes.find((r) => r.regiao === parametros.regiao)?.regiao ?? null

  const enderecoDoMapa = (proxima: string | null): string => {
    const busca = new URLSearchParams()
    if (ano !== undefined) busca.set('ano', String(ano))
    if (proxima !== null) busca.set('regiao', proxima)
    const consulta = busca.toString()
    // A âncora devolve a rolagem ao mapa depois do salto de página.
    return `/viagens${consulta === '' ? '' : `?${consulta}`}#mapa`
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
                nota={
                  `${plural(dados.viagens, 'viagem', 'viagens')}, somando ${plural(dados.trechos, 'trecho', 'trechos')}` +
                  (dados.trechosForaDoTotal === 0
                    ? '.'
                    : `. Outro${dados.trechosForaDoTotal === 1 ? '' : 's'} ${dados.trechosForaDoTotal} ` +
                      `${dados.trechosForaDoTotal === 1 ? 'trecho está gravado' : 'trechos estão gravados'} e fora desta conta, ` +
                      'por serem itinerário duplicado no relatório da agência — a conferência de cobertura conta os dois.')
                }
              />
              <Cartao
                rotulo={ano === undefined ? 'Total do período' : `Total de ${ano}`}
                valor={dados.co2ToneladasAno}
                casas={2}
                unidade="t CO₂e"
                nota="Soma as duas fontes administrativas do módulo. O que os colaboradores registram no programa de viagens não entra aqui."
              />
              <Cartao
                rotulo="Trechos por viagem"
                valor={dados.viagens === 0 ? 0 : dados.trechos / dados.viagens}
                unidade="trechos"
                nota="Ida e volta dão dois; escala conta separado e emite mais que um voo direto. Valor abaixo de dois indica viagem partida em mais de um registro na origem, o que infla a contagem de viagens e puxa o indicador ao lado para baixo."
              />
            </Grade>
          </Revelar>

          {/* A ordem é a do protótipo: o mapa ocupa a largura inteira e a
              tabela de destinos fica ao lado do gráfico mensal. O empilhamento
              anterior era omissão, não decisão — ninguém tinha comparado esta
              tela com o desenho de referência. */}
          <Revelar ordem={1} className="mt-4">
            <Painel
              id="mapa"
              titulo="Para onde a empresa voa"
              descricao="Por corredor entre regiões — unidade mais grossa que a da tabela ao lado, porque uma linha precisa de dois lugares e o mapa responde para onde se voa, não com que frequência."
            >
              {dados.mapa.corredores.length === 0 ? (
                <Vazio>
                  Nenhum corredor pôde ser desenhado. <NaoDesenhado mapa={dados.mapa} />
                </Vazio>
              ) : (
                <>
                  <MapaDeRotasSvg
                    mapa={dados.mapa}
                    aberta={regiao}
                    href={(r) => enderecoDoMapa(r === regiao ? null : r)}
                  />
                  {regiao !== null && (
                    <RegiaoAberta
                      mapa={dados.mapa}
                      regiao={regiao}
                      fechar={enderecoDoMapa(null)}
                    />
                  )}
                </>
              )}
            </Painel>
          </Revelar>

          {/* `larga` em vez de duas colunas iguais: a tabela tem cinco colunas
              e o gráfico é elástico. O protótipo divide meio a meio porque a
              tabela dele tem quatro colunas e nenhuma de data.

              **A coluna da direita é uma pilha de três painéis, e o motivo é de
              altura.** Com um painel só ao lado de uma tabela de dez linhas, a
              grade esticava o painel curto e sobrava meia tela em branco dentro
              dele. Empilhar equilibra as duas colunas com conteúdo, em vez de
              equilibrar com vazio. */}
          <Revelar ordem={2} className="mt-4">
            <Grade tipo="larga">
              <Painel
                titulo="Destinos mais frequentes"
                descricao="Por aeroporto de chegada. Quantas pessoas desembarcaram ali e em que período — nunca quem."
              >
                <TabelaDeRecortes
                  recortes={dados.destinos}
                  cabecalho="Destino"
                  nota="Cada trecho tem um destino só, então a coluna de trechos fecha com o total dos cartões. Uma pessoa que foi ao mesmo lugar duas vezes conta uma."
                />
              </Painel>
              <div className="space-y-4">
                <Painel
                  titulo="Emissão por mês"
                  descricao="Pela data do voo ou da viagem, nunca pela data de lançamento da passagem."
                >
                  <SerieMensal serie={dados.porMes} />
                </Painel>
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
              </div>
            </Grade>
          </Revelar>

          {/* Rotas ocupa a largura inteira: é a mesma tabela de cinco colunas,
              e sem um painel do tamanho dela para pôr ao lado, meia tela seria
              o mesmo vazio de novo. */}
          <Revelar ordem={3} className="mt-4">
            <Painel
              titulo="Rotas"
              descricao="Pelo par de aeroportos, com direção: ida e volta são duas linhas aqui, ao contrário do mapa, onde o corredor não tem sentido."
            >
              <TabelaDeRecortes recortes={dados.rotas} cabecalho="Rota" />
            </Painel>
          </Revelar>

          <p className="mt-6 max-w-[80ch] text-[12px] text-[var(--color-apoio)]/85">
            Rota, corredor e destino não são suprimidos por contagem de pessoas: são
            fato da operação da empresa, e a emissão deles já estava no total —
            escondê-los omitia de onde ela vinha, não quanto foi. Nenhuma tela do
            inventário exibe nome, matrícula ou e-mail, e nenhum identificador chega
            ao navegador. A classe econômica é assumida em todos os trechos do
            histórico, porque o relatório da agência não informa a cabine — essa e as
            demais escolhas que mudam o número estão na tela de Método.
          </p>
        </>
      )}
    </Casca>
  )
}

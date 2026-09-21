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
import { consultarMetodo } from '@/server/consultas/metodo'
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
import { MapaDeCorredoresDoInventario, NaoDesenhado } from './mapa-de-rotas'
import { RegiaoAberta } from './regiao-aberta'
import {
  Bloco,
  Fatores,
  Itens,
  Parametros,
  Procedencia,
  Sinalizacoes,
  SobreATela,
} from '../informacoes'
import { SerieMensal } from '../serie-mensal'
import { TabelaDeRecortes } from './tabela-de-recortes'

export const dynamic = 'force-dynamic'

/**
 * Os quatro blocos desta tela numa grade só — CLAUDE.md §10.3.
 *
 * Até `lg` a ordem natural da grade reproduz a composição do protótipo: o mapa
 * atravessa as duas colunas, destinos fica ao lado da pilha, e as rotas
 * atravessam de novo. No `xl` a colocação vira explícita — ver o comentário
 * junto do mapa, que é onde o motivo mora.
 */
const GRADE_DA_TELA = 'mt-4 grid items-start gap-4 [&>*]:min-w-0 lg:grid-cols-[1.55fr_1fr]'

/**
 * Onde cada bloco cai.
 *
 * `lg:col-span-2` é o que faz mapa e rotas atravessarem a linha até `lg`;
 * `xl:col-span-1` desfaz isso quando cada um ganha coluna própria.
 */
const LUGAR = {
  mapa: 'lg:col-span-2 xl:col-span-1 xl:col-start-1 xl:row-start-1',
  pilha: 'space-y-4 xl:col-start-2 xl:row-start-1',
  destinos: 'xl:col-start-1 xl:row-start-2',
  rotas: 'lg:col-span-2 xl:col-span-1 xl:col-start-2 xl:row-start-2',
} as const

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
  let metodo
  try {
    ;[dados, metodo] = await Promise.all([
      consultarViagens(ctx, ano === undefined ? {} : { ano }),
      consultarMetodo(ctx, { modulo: 'viagens' }),
    ])
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
  // **Com um ano só, o seletor se esconde e o ano some da tela.** A §7.0 faz do
  // ano-base a identidade do relatório: ele precisa estar aqui, não só na tela
  // de Método. Quando há mais de um, quem diz qual é o próprio seletor.
  const anoUnico = ano === undefined && anos.length === 1 ? anos[0] : null
  const anoNaTela = ano ?? anoUnico
  const empresaConhecida = dados.porEmpresa.some((g) => !g.rotulo.startsWith('Sem '))

  return (
    <Casca ctx={ctx} atual="/viagens">
      <Cabecalho
        titulo="Viagens corporativas"
        descricao="Deslocamento aéreo e rodoviário a serviço. Escopo 3 categoria 6, e Escopo 1 no veículo da frota."
        acao={
          anoUnico === null ? (
            <SeletorDeAno
              anos={anos}
              atual={ano ?? null}
              href={(a) => (a === null ? '/viagens' : `/viagens?ano=${a}`)}
            />
          ) : (
            <span
              className="shrink-0 rounded-[9px] bg-[#E2EADF] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--color-tinta)]"
              title="O inventário de viagens relata um ano."
            >
              Relatório de {anoUnico}
            </span>
          )
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
                      'por serem itinerário duplicado no relatório da agência.')
                }
              />
              <Cartao
                rotulo={
                  anoNaTela === null ? 'Total do período' : `Total de ${anoNaTela}`
                }
                valor={dados.co2Toneladas}
                casas={2}
                unidade="t CO₂e"
                nota="Soma as duas fontes administrativas. O programa de viagens não entra aqui."
              />
              <Cartao
                rotulo="Trechos por viagem"
                valor={dados.viagens === 0 ? 0 : dados.trechos / dados.viagens}
                unidade="trechos"
                nota="Ida e volta dão dois; escala conta separado."
              />
            </Grade>
          </Revelar>

          {/* Os quatro blocos desta tela numa grade só.

              **Até `lg` a composição é a do protótipo**: o mapa na largura
              inteira, a tabela de destinos ao lado do gráfico mensal, e as rotas
              na largura inteira embaixo. A ordem natural da grade reproduz isso
              sem nenhuma colocação explícita.

              **No `xl` o mapa ganha um vizinho, e o motivo é o mesmo da
              Mobilidade**: o desenho tem teto de 1056px e a linha inteira passa
              de 1700, então sobravam ~660px que o mapa não sabia usar. Excedente
              estrutural não se resolve com proporção — resolve-se com alguém ao
              lado. O mapa passa a dividir a linha com a pilha que antes
              acompanhava a tabela de destinos, e as duas tabelas de cinco colunas
              descem para a linha de baixo, uma ao lado da outra.

              Na coluna de 1,55fr o painel do mapa tem 1008px úteis, então o
              desenho **preenche a coluna sem sobra** em vez de bater no teto.
              Acima de ~1800px de conteúdo o teto volta a morder e o branco
              reaparece; aí a conversa é outra linha, não outra proporção. */}
          <div className={GRADE_DA_TELA}>
            <Revelar ordem={1} className={LUGAR.mapa}>
              <Painel
                id="mapa"
                titulo="Para onde a empresa voa"
                descricao="Por corredor entre regiões — unidade mais grossa que a das tabelas abaixo."
              >
                {dados.mapa.corredores.length === 0 ? (
                  <Vazio>
                    Nenhum corredor pôde ser desenhado. <NaoDesenhado mapa={dados.mapa} />
                  </Vazio>
                ) : (
                  <>
                    <MapaDeCorredoresDoInventario
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

            <Revelar ordem={2} className={LUGAR.destinos}>
              <Painel
                titulo="Destinos mais frequentes"
                descricao="Por aeroporto de chegada. Quantas pessoas e em que período — nunca quem."
              >
                <TabelaDeRecortes
                  recortes={dados.destinos}
                  cabecalho="Destino"
                  nota="Uma pessoa que foi ao mesmo lugar duas vezes conta uma."
                />
              </Painel>
            </Revelar>

            {/* A pilha existe por altura: um painel só ao lado de um mapa alto
                ou de uma tabela de dez linhas volta a ser a coluna curta que a
                grade esticava. Empilhar equilibra com conteúdo. */}
            <Revelar ordem={3} className={LUGAR.pilha}>
              <Painel
                titulo="Emissão por mês"
                descricao="Pela data do voo, nunca pela data de lançamento da passagem."
              >
                <SerieMensal
                  serie={dados.porMes}
                  nota="Ela soma as duas fontes administrativas do módulo."
                />
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
            </Revelar>

            <Revelar ordem={4} className={LUGAR.rotas}>
              <Painel
                titulo="Rotas"
                descricao="Pelo par de aeroportos, com direção: ida e volta são duas linhas."
              >
                <TabelaDeRecortes recortes={dados.rotas} cabecalho="Rota" />
              </Painel>
            </Revelar>
          </div>
        </>
      )}

      <SobreATela titulo="Viagens corporativas">
        <Procedencia metodo={metodo} modulo="viagens" />
        <Bloco titulo="Como o número é calculado">
          <Parametros parametros={metodo.parametros} />
        </Bloco>
        <Bloco titulo="Fatores">
          <Fatores fatores={metodo.fatores} categorias={['viagem_aerea']} />
        </Bloco>
        <Bloco titulo="Mapa">
          Ponto = média dos aeroportos da região. Só trecho aéreo.
        </Bloco>
        {metodo.regioesInferidas.length > 0 && (
          <Bloco titulo="Região deduzida da coordenada, não do estado">
            <Itens
              itens={metodo.regioesInferidas.map((r) => ({
                rotulo: r.iata,
                valor: r.regiao,
              }))}
            />
          </Bloco>
        )}
        <Sinalizacoes metodo={metodo} modulo="viagens" />
      </SobreATela>
    </Casca>
  )
}

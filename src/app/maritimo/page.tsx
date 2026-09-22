/**
 * Tela do Transporte marítimo de importações — CLAUDE.md §10.4.
 *
 * Escopo 3 categoria 4, frete upstream. A métrica exibida é **kg CO₂ por
 * contêiner** (§1), e peso, volume e intensidade por quilo ficam de fora da
 * interface: são insumo de cálculo, e a intensidade por quilo em particular é a
 * unidade que a §8.1 recusa como base de alocação.
 *
 * **Não há pessoa neste módulo** (§3.1.3). Embarque não tem funcionário, não tem
 * passageiro e não tem residência — não há supressão a aplicar, e um limite
 * passado à função de agrupamento mediria número de embarques fingindo medir
 * privacidade.
 *
 * Três coisas que esta tela declara porque mudam o número, e que a camada expõe
 * para ela não precisar subtrair nada:
 *
 *  - **previsão fica fora dos totais**, contada à parte;
 *  - **frete aéreo fica no total e fora do que é por contêiner**;
 *  - **o módulo cobre um agente só**, porque os outros não entregam detalhe
 *    linha a linha e os totais da aba de resumo são conta circular (§8.1).
 *
 * **A tela relata o ano-base do inventário, e só ele.** A coleção é contínua e
 * atravessa três anos civis, dois deles parciais (§8.4) — e ponta parcial lida
 * como ano cheio é o erro que a §11.0 já tinha barrado no consolidado, com um
 * seletor de ano que convidava exatamente a isso. O recorte é a mesma constante
 * que o consolidado usa, então **as duas telas passam a mostrar o mesmo
 * número**: enquanto elas diferiam, quem abrisse as duas lado a lado ia procurar
 * qual das duas cargas estava errada.
 */
import { ANO_BASE_INVENTARIO } from '@/lib/env'
import { plural } from '@/lib/formato'
import { AcessoNegadoError } from '@/server/consultas/acesso'
import { consultarMaritimo } from '@/server/consultas/inventario'
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
  Vazio,
} from '../componentes'
import {
  Bloco,
  Parametros,
  Procedencia,
  Recolhido,
  Sinalizacoes,
  SobreATela,
} from '../informacoes'
import { SerieMensal } from '../serie-mensal'
import { MapaDeCorredoresMaritimos, NaoDesenhado } from './mapa'
import { ForaDoIndicador, QualidadeDoDado, TabelaDeCorredores, TabelaDePortos } from './tabelas'

export const dynamic = 'force-dynamic'

/** A mesma grade da tela de Viagens, pelo mesmo motivo de largura. */
const GRADE_DA_TELA = 'mt-4 grid items-start gap-4 [&>*]:min-w-0 lg:grid-cols-[1.55fr_1fr]'

const LUGAR = {
  mapa: 'lg:col-span-2 xl:col-span-1 xl:col-start-1 xl:row-start-1',
  pilha: 'space-y-4 xl:col-start-2 xl:row-start-1',
  portos: 'xl:col-start-1 xl:row-start-2',
  corredores: 'lg:col-span-2 xl:col-span-1 xl:col-start-2 xl:row-start-2',
} as const

export default async function Page() {
  const ctx = await exigirSessao()
  // **O ano não vem do endereço.** Não há seletor e não há parâmetro: a tela
  // relata o ano-base do inventário, e é a mesma constante do consolidado.
  const ano = ANO_BASE_INVENTARIO

  let dados
  let metodo
  try {
    ;[dados, metodo] = await Promise.all([
      consultarMaritimo(ctx, { ano }),
      consultarMetodo(ctx, { ano, modulo: 'maritimo' }),
    ])
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      return (
        <Casca ctx={ctx} atual="/maritimo">
          <Cabecalho titulo="Sem acesso" descricao={erro.message} />
        </Casca>
      )
    }
    throw erro
  }

  const empresaConhecida = dados.porEmpresa.some((g) => !g.rotulo.startsWith('Sem '))

  return (
    <Casca ctx={ctx} atual="/maritimo">
      <Cabecalho
        titulo="Transporte marítimo de importações"
        descricao="Frete das importações, Escopo 3 categoria 4. O CO₂ informado pelo agente não é recalculado."
        acao={
          <span
            className="shrink-0 rounded-[9px] bg-[#E2EADF] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--color-tinta)]"
            title="O inventário relata um ano; a coleção do módulo atravessa três."
          >
            Relatório de {ano}
          </span>
        }
      />

      {dados.embarques === 0 ? (
        <Vazio>
          Nenhum embarque carregado para {ano}.
          {dados.previsoes.embarques > 0 && (
            <>
              {' '}
              Há {plural(dados.previsoes.embarques, 'embarque previsto', 'embarques previstos')}{' '}
              neste recorte, e previsão fica fora do total: o CO₂ já vem lançado pelo
              agente, mas a viagem ainda não aconteceu.
            </>
          )}
        </Vazio>
      ) : (
        <>
          <Revelar ordem={0}>
            <Grade tipo="tres">
              <Cartao
                rotulo="Por contêiner"
                valor={dados.co2KgPorContainer}
                unidade="kg CO₂"
                nota={
                  <>
                    {plural(dados.containers, 'contêiner marítimo', 'contêineres marítimos')} em{' '}
                    {plural(dados.embarques, 'embarque', 'embarques')}.{' '}
                    <ForaDoIndicador dados={dados} />
                  </>
                }
              />
              <Cartao
                rotulo={`Total de ${ano}`}
                valor={dados.co2Toneladas}
                casas={2}
                unidade="t CO₂e"
                nota={
                  dados.previsoes.embarques === 0
                    ? 'Soma o que o agente informou, sem recálculo.'
                    : `Soma o realizado; ${plural(dados.previsoes.embarques, 'um embarque previsto está', 'embarques previstos estão')} fora desta conta.`
                }
              />
              <Cartao
                rotulo="Contêineres por embarque"
                valor={dados.embarques === 0 ? 0 : dados.containers / dados.embarques}
                unidade="contêineres"
                nota="Só marítimo."
              />
            </Grade>
          </Revelar>

          <div className={GRADE_DA_TELA}>
            <Revelar ordem={1} className={LUGAR.mapa}>
              <Painel
                id="mapa"
                titulo="De onde a carga vem"
                descricao="Um ponto por porto e uma linha por corredor, com o sentido da carga."
              >
                {dados.mapa.corredores.length === 0 ? (
                  <Vazio>
                    Nenhum corredor pôde ser desenhado. <NaoDesenhado mapa={dados.mapa} />
                  </Vazio>
                ) : (
                  <MapaDeCorredoresMaritimos
                    mapa={dados.mapa}
                    ressalva={<ForaDoIndicador dados={dados} />}
                  />
                )}
              </Painel>
            </Revelar>

            <Revelar ordem={2} className={LUGAR.portos}>
              <Painel
                titulo="Contêineres por porto"
                descricao="Por porto de desembarque, contados a partir dos embarques."
              >
                <TabelaDePortos
                  portos={dados.porPorto}
                  nota={<ForaDoIndicador dados={dados} />}
                />
              </Painel>
            </Revelar>

            <Revelar ordem={3} className={LUGAR.pilha}>
              <Painel
                titulo="Emissão por mês"
                descricao="Pela partida prevista do primeiro carregamento."
              >
                <SerieMensal
                  serie={dados.porMes}
                  nota="Embarque previsto não entra; o frete aéreo de fornecedor entra."
                />
              </Painel>
              <Painel titulo="Por empresa">
                {empresaConhecida ? (
                  <ListaDeGrupos grupos={dados.porEmpresa} mostrarPessoas={false} />
                ) : (
                  <Vazio>
                    Este recorte não tem empresa por embarque: a coluna não vem em todos
                    os blocos do relatório. O campo existe desde já para não exigir
                    migração quando a origem passar a informá-lo.
                  </Vazio>
                )}
              </Painel>
            </Revelar>

            <Revelar ordem={4} className={LUGAR.corredores}>
              <Painel
                titulo="Corredores"
                descricao="Por par de portos, na ordem do transporte."
              >
                <TabelaDeCorredores
                  corredores={dados.mapa.corredores}
                  nota={<ForaDoIndicador dados={dados} />}
                />
              </Painel>
            </Revelar>
          </div>

          <Revelar ordem={5}>
            <QualidadeDoDado dados={dados} />
          </Revelar>
        </>
      )}

      {/* **O resumo abre com duas coisas e só duas**: de onde vem o dado e como
          a conta é feita. O lastro — parâmetros, mapa, exceções e alertas —
          continua na página, recolhido, no formato que a Mobilidade estreou
          (§11.5). A ressalva que impede ler o mapa errado não está aqui: ela é
          visível, na legenda do próprio mapa. */}
      <SobreATela titulo="Transporte marítimo de importações">
        <Procedencia metodo={metodo} modulo="maritimo" />

        <Bloco titulo="Como o número é calculado">
          <p className="max-w-[80ch] leading-[1.5]">
            O CO₂ é o que o agente informou por embarque, e não se recalcula. Onde ele
            não informou, a estimativa é por contêiner — pela média do corredor, e só
            depois pela média geral. O mês sai da partida prevista; embarque ainda não
            partido tem o CO₂ lançado e fica fora do total.
          </p>
        </Bloco>

        <Recolhido titulo="Parâmetros, mapa e sinalizações">
          <Bloco titulo="Parâmetros">
            <Parametros parametros={metodo.parametros} />
          </Bloco>
          <Bloco titulo="Mapa">
            Ponto = porto do cadastro. A linha é geometria, não a derrota do navio.
          </Bloco>
          {/* **O porquê do recorte aéreo mora aqui, uma vez.** Na tela ele
              aparece quatro vezes, e ali basta o fato — quatro cópias da
              explicação afogam o dado que elas qualificam (§11.5). */}
          {dados.embarquesAereos > 0 && (
            <Bloco titulo="Frete aéreo de fornecedor">
              Continua no total: é Escopo 3 categoria 4, frete upstream, emissão da
              empresa. Fica fora de tudo que é por contêiner porque não tem contêiner,
              e fora do mapa porque o destino dele não é porto.
            </Bloco>
          )}
          <Sinalizacoes metodo={metodo} modulo="maritimo" />
        </Recolhido>
      </SobreATela>
    </Casca>
  )
}

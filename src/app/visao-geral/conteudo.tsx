/**
 * O desenho da Visão geral — CLAUDE.md §10.0.
 *
 * **Separado da página de propósito**, e a separação tem um uso concreto: a
 * página faz sessão, consulta e recusa; esta peça só desenha, e por isso pode
 * ser medida numa rota temporária com dados inventados, sem banco e sem sessão.
 * Medir uma cópia do desenho mediria a cópia — foi assim que três rodadas de
 * correção de layout saíram de deduzir em vez de medir (§14, 18/09).
 *
 * Ela não conhece Firestore nem papel: recebe o que a camada já entregou.
 */
import { inteiro, numero, plural } from '@/lib/formato'
import type { VisaoGeral } from '@/server/consultas/visao-geral'
import {
  Cabecalho,
  Cartao,
  Etiqueta,
  Grade,
  Nota,
  Painel,
  Revelar,
  Vazio,
} from '../componentes'
import { Contador } from '../contador'
import { Bloco, Itens, SobreATela } from '../informacoes'
import { FaixaDosModulos } from './faixa'
import { SerieEmpilhada } from './serie-empilhada'

/**
 * A grade da tela, e por que ela existe — a lição de 18/09.
 *
 * **Excedente estrutural resolve-se com uma coluna a mais, não com outra
 * razão.** A série empilhada tem largura natural: o `viewBox` é escala, então
 * alargá-la além do teto não acrescenta mês nenhum — multiplica o desenho,
 * texto incluído. Medida em largura inteira, ela deixava 438px de branco dentro
 * do painel a 1366px e 992px a 1920. Branco dentro de uma caixa com borda não se
 * lê como "este painel é pequeno": lê-se como dado faltando, que é a pior coisa
 * que um inventário pode insinuar sem querer.
 *
 * Com a coluna, a 1366 sobram 33px no painel da série — o desenho preenche a
 * coluna. **Acima disso o teto volta a morder**, e a 1920 sobravam 370px: por
 * isso a coluna da série passa a ter medida fixa em `2xl`, de 570px, que é
 * exatamente o teto do desenho (420 × 1,25) mais o respiro do painel. O que
 * sobra vai para os cartões, e **é lá que ele não incomoda**: a nota do cartão
 * reflui e o cartão encolhe em altura, em vez de abrir branco ao lado de uma
 * figura (18/09).
 *
 * **A ordem no DOM é a do celular, e a colocação explícita é a do desktop.** No
 * telefone os cartões vêm antes: eles decompõem o número que acabou de ser lido,
 * e a série vem depois. Em tela larga a série vai para a coluna grande, à
 * esquerda, sem duplicar painel no DOM — painel duplicado é conteúdo duplicado
 * para leitor de tela e animação rodando duas vezes.
 */
const GRADE_DA_TELA =
  'mt-4 grid items-start gap-4 [&>*]:min-w-0 lg:grid-cols-[1.55fr_1fr] 2xl:grid-cols-[minmax(0,570px)_1fr]'

const LUGAR = {
  cartoes: 'space-y-4 lg:col-start-2 lg:row-start-1',
  serie: 'lg:col-start-1 lg:row-start-1',
} as const

export function ConteudoDaVisaoGeral({ dados }: { dados: VisaoGeral }) {
  const mobilidade = dados.porModulo.find((m) => m.modulo === 'mobilidade')!
  const viagens = dados.porModulo.find((m) => m.modulo === 'viagens')!
  const maritimo = dados.porModulo.find((m) => m.modulo === 'maritimo')!
  const transportadoras = dados.porModulo.find((m) => m.modulo === 'transportadoras')!
  const vazio = dados.porModulo.every((m) => m.documentos === 0)

  return (
    <>
      <Cabecalho
        titulo={`Inventário de emissões de ${dados.ano}`}
        descricao="Mobilidade casa-trabalho, viagens corporativas, transporte marítimo e distribuição rodoviária, somados no ano-base."
      />

      {vazio ? (
        <Vazio>
          Nenhum dos quatro módulos tem documento carregado para {dados.ano}. Isto é
          ausência de carga, não emissão zero: um inventário sem dado nenhum não é
          um inventário que mediu zero.
        </Vazio>
      ) : (
        <>
          <Revelar ordem={0}>
            <Painel>
              <p className="text-[12.5px] text-[var(--color-apoio)]">
                Emissão total de {dados.ano}
              </p>
              <p className="mt-1 font-[family-name:var(--font-titulo)] text-[52px] leading-none font-bold tracking-[-0.03em] text-[var(--color-tinta)] tabular-nums">
                <Contador valor={dados.totalToneladas} casas={1} />
                <span className="ml-2 text-[17px] font-semibold text-[var(--color-apoio)]">
                  t CO₂e
                </span>
              </p>

              <FaixaDosModulos modulos={dados.porModulo} />

              <Nota>
                Soma dos quatro módulos, cada um pelo recorte do cartão dele. Embarque
                previsto fica de fora
                {dados.maritimo.previsoes.embarques === 0
                  ? ', e não há nenhum neste recorte.'
                  : `: há ${inteiro(dados.maritimo.previsoes.embarques)}, com o CO₂ já lançado e a viagem por acontecer.`}
              </Nota>
            </Painel>
          </Revelar>


          <div className={GRADE_DA_TELA}>
            <Revelar ordem={1} className={LUGAR.cartoes}>
              <Grade tipo="tres" className="lg:grid-cols-1">
                {mobilidade.recorte === null ? (
                  <Painel>
                    <p className="text-[12.5px] text-[var(--color-apoio)]">Mobilidade</p>
                    <p className="mt-0.5 font-[family-name:var(--font-titulo)] text-[33px] leading-none font-bold text-[var(--color-apoio)]">
                      —
                    </p>
                    <p className="mt-1.5 text-[12px] text-[var(--color-apoio)]">
                      O ano-base da pesquisa não está declarado no ambiente, então o
                      módulo não entra no total. Isto é ausência de parâmetro, não
                      emissão zero — um zero aqui passaria por medição.
                    </p>
                    <p className="mt-2.5">
                      <Etiqueta tom="atencao">ano-base não definido</Etiqueta>
                    </p>
                  </Painel>
                ) : (
                  <Cartao
                    rotulo="Mobilidade casa-trabalho"
                    valor={mobilidade.toneladas}
                    casas={1}
                    unidade="t CO₂e"
                    nota="Escopo 3, categoria 7. É a única parte deste total que não é medição do período."
                    etiqueta={{
                      texto: `Ano-base ${dados.mobilidade.anoBase} aplicado a ${dados.ano}`,
                      tom: 'atencao',
                    }}
                  />
                )}

                <Cartao
                  rotulo="Viagens corporativas"
                  valor={viagens.toneladas}
                  casas={1}
                  unidade="t CO₂e"
                  nota="Escopo 3, categoria 6. Agrupa pela data do voo."
                />

                <Cartao
                  rotulo="Transporte marítimo"
                  valor={maritimo.toneladas}
                  casas={1}
                  unidade="t CO₂e"
                  nota={
                    <>
                      {/* **A segunda declaração da §11.0 mudou de sinal, e por
                          isso mudou de texto.** Enquanto o módulo era o
                          inventário de um agente, a frase dizia que a importação
                          do ano era maior que este número — a leitura errada era
                          tomar um total parcial por completo. Agora o total cobre
                          a contagem inteira do período, e a leitura errada é a
                          oposta: tomar por medido um número cuja maior parte é
                          estimativa. Declaração que descreve o risco antigo é
                          declaração que já não protege ninguém. */}
                      Escopo 3, categoria 4.{' '}
                      {dados.maritimo.containersSemDetalhe === 0
                        ? `Cobre ${inteiro(dados.maritimo.agentes)} agente(s) de carga, todos com detalhe por embarque.`
                        : `Cobre os ${inteiro(dados.maritimo.containers)} contêineres do ano; ${inteiro(dados.maritimo.containersSemDetalhe)} deles não têm detalhe de agente e entram por estimativa.`}
                    </>
                  }
                />

                {/* **Duas categorias num cartão só, e não é imprecisão.** O
                    frete destas entregas é CIF em parte e FOB em parte — cat. 4
                    e cat. 9 do mesmo escopo —, e o relatório de origem não diz
                    qual linha é qual. As duas somam neste número; o porquê fica
                    no resumo da tela do módulo, que é onde o lastro mora. */}
                <Cartao
                  rotulo="Distribuição rodoviária"
                  valor={transportadoras.toneladas}
                  casas={1}
                  unidade="t CO₂e"
                  nota={
                    <>
                      Escopo 3, categorias 4 e 9. Agrupa pela data da entrega, em{' '}
                      {plural(dados.transportadoras.entregas, 'entrega', 'entregas')}.
                    </>
                  }
                />
              </Grade>
            </Revelar>

            <Revelar ordem={2} className={LUGAR.serie}>
              <Painel
                titulo="Emissão mês a mês"
                descricao="Empilhada; a soma das doze colunas é o total do ano."
              >
                <SerieEmpilhada
                  serie={dados.porMes}
                  nota="Cada módulo agrupa por uma data diferente; a mobilidade é banda constante."
                />
              </Painel>
            </Revelar>
          </div>
        </>
      )}

      <SobreATela titulo={`Inventário de emissões de ${dados.ano}`}>
        <Bloco titulo="Quatro recortes, um total">
          <Itens
            itens={dados.porModulo.map((m) => ({
              rotulo: m.rotulo,
              valor: m.recorte ?? 'sem recorte definido',
            }))}
          />
        </Bloco>
        <Bloco titulo="Fora do total">
          Embarque previsto e o programa de viagens.
        </Bloco>
        <Bloco titulo="Cada módulo">
          Fonte, fatores e parâmetros ficam no botão da tela dele.
        </Bloco>
      </SobreATela>
    </>
  )
}

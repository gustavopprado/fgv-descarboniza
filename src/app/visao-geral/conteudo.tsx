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
  const vazio = dados.porModulo.every((m) => m.documentos === 0)

  return (
    <>
      <Cabecalho
        titulo={`Inventário de emissões de ${dados.ano}`}
        descricao="Mobilidade casa-trabalho, viagens corporativas e transporte marítimo de importações, somados no ano-base do inventário. Os cortes por período, modal, rota e empresa ficam nas telas de cada módulo."
      />

      {vazio ? (
        <Vazio>
          Nenhum dos três módulos tem documento carregado para {dados.ano}. Isto é
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
                Soma dos três módulos, cada um pelo recorte declarado no cartão
                dele. Embarque previsto fica de fora:{' '}
                {dados.maritimo.previsoes.embarques === 0
                  ? 'não há nenhum neste recorte, e a regra continua valendo — '
                  : `há ${plural(dados.maritimo.previsoes.embarques, 'um neste recorte', `${inteiro(dados.maritimo.previsoes.embarques)} neste recorte`)}, e `}
                o CO₂ já vem lançado pelo agente, mas a viagem ainda não aconteceu.
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
                    nota={
                      <>
                        Escopo 3, categoria 7. A pesquisa é anual e produz uma taxa
                        mensal, aplicada aos doze meses:{' '}
                        {plural(
                          mobilidade.documentos,
                          'uma resposta na média',
                          `${inteiro(mobilidade.documentos)} respostas na média`,
                        )}
                        . É a única parte deste total que não é medição do período.
                      </>
                    }
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
                  nota={
                    <>
                      Escopo 3, categoria 6. Agrupa pela data do voo, nunca pela data
                      de lançamento da passagem:{' '}
                      {plural(
                        viagens.documentos,
                        'um trecho no total',
                        `${inteiro(viagens.documentos)} trechos no total`,
                      )}
                      .
                    </>
                  }
                />

                <Cartao
                  rotulo="Transporte marítimo"
                  valor={maritimo.toneladas}
                  casas={1}
                  unidade="t CO₂e"
                  nota={
                    <>
                      Escopo 3, categoria 4. Fatia de {dados.ano} de uma série que
                      começa antes e continua depois — a tela de Marítimo mostra o
                      período inteiro.{' '}
                      {dados.maritimo.agentes === 1
                        ? 'Cobre um agente de carga: os outros não entregam detalhe por embarque, e a importação do ano é maior que este número.'
                        : `Cobre ${inteiro(dados.maritimo.agentes)} agentes de carga; agente que não entrega detalhe por embarque não está no inventário, nem como estimativa.`}
                    </>
                  }
                />
              </Grade>
            </Revelar>

            <Revelar ordem={2} className={LUGAR.serie}>
              <Painel
                titulo="Emissão mês a mês"
                descricao="Empilhada, nunca somada numa linha só: a mobilidade é taxa repetida nos doze meses, e numa curva única de total ela achataria a variação dos outros dois."
              >
                <SerieEmpilhada
                  serie={dados.porMes}
                  nota={
                    <>
                      Cada módulo agrupa por uma data diferente: viagens pela data do
                      voo, marítimo pela partida prevista do primeiro carregamento, e
                      a mobilidade por nenhuma — ela é a mesma taxa nos doze meses, e
                      por isso aparece como banda constante. A soma das doze colunas é
                      o total de {dados.ano}.
                    </>
                  }
                />
              </Painel>
            </Revelar>
          </div>
        </>
      )}
    </>
  )
}

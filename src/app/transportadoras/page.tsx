/**
 * Tela da distribuição rodoviária às filiais — CLAUDE.md §9.5.
 *
 * Escopo 3, frete de saída operado por transportadora terceirizada. **As
 * entregas misturam CIF e FOB, e o relatório não diz qual é qual** (§9.1): a
 * parcela CIF é cat. 4 e a FOB é cat. 9, as duas do mesmo escopo, e as duas
 * entram somadas no número deste módulo.
 *
 * **A modalidade não muda valor nenhum desta tela** — total, filial e mês são os
 * mesmos nas duas —, e por isso ela não aparece como ressalva sobre o número: é
 * lastro, e mora no resumo, junto da fonte e do fator (§11.5). Onde ela decide
 * alguma coisa é na montagem do relatório final, que separa as categorias.
 *
 * **A emissão é separada por filial, não por transportadora**, mesmo o nome do
 * módulo se referindo a elas: a planilha não identifica qual transportadora fez
 * cada entrega (§9.1). A tela diz isso onde alguém poderia concluir o contrário.
 *
 * **Não há pessoa neste módulo**, e não há cliente na tela: o agregado é por
 * filial (§9.4), e o código do cliente não sai da camada de consulta.
 *
 * Peso e distância são insumo de cálculo e ficam fora da interface (§1). A
 * exceção é o peso movimentado no painel da filial, que a §9.5 pede — a mesma
 * resolução da distância média na tela de Mobilidade.
 */
import { plural } from '@/lib/formato'
import { AcessoNegadoError } from '@/server/consultas/acesso'
import { consultarTransportadoras } from '@/server/consultas/inventario'
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
import {
  Bloco,
  Fatores,
  Itens,
  Parametros,
  Procedencia,
  Recolhido,
  SobreATela,
} from '../informacoes'
import { SerieMensal } from '../serie-mensal'
import { FilialAberta } from './filial-aberta'
import { MapaDasFiliais } from './mapa'

export const dynamic = 'force-dynamic'

/**
 * **A grade é proporcional, e a coluna de medida fixa foi tentada e desfeita.**
 *
 * O mapa tem largura natural — `viewBox` é escala, então alargar o painel além
 * do teto do desenho só deixa branco dentro de uma caixa com borda (18/09). A
 * primeira versão desta tela deu ao mapa uma coluna de medida fixa por causa
 * disso, e ela **não cabe**: com o menu de 232px, a 1366 sobravam 167px para a
 * coluna da direita e a página inteira passava a rolar de lado.
 *
 * Proporcional, o branco que sobra ao lado do mapa é de algumas dezenas de
 * pixels nas larguras em que alguém abre a tela — e some sozinho nas estreitas,
 * onde a coluna é menor que o desenho e ele encolhe até o próprio piso.
 *
 * > **O erro não foi a medida: foi medir sem a casca.** A rota temporária de
 * > medição desenhava a tela sem o menu, então toda largura de coluna saía
 * > 232px maior que a real. A conclusão — "cabe uma coluna fixa de 824" — era
 * > sobre um layout que não existe.
 */
const GRADE_DA_TELA = 'mt-4 grid items-start gap-4 [&>*]:min-w-0 xl:grid-cols-[1.1fr_1fr]'

/**
 * Onde cada painel fica: **uma coluna só até `xl`**, e de `xl` em diante o mapa
 * ocupa as duas linhas da esquerda, com a série e a lista empilhadas à direita.
 *
 * As duas colunas começam mais tarde que nas outras telas, e a razão de cada
 * número foi medida com o menu descontado: a 1024 cada coluna ficaria abaixo do
 * piso dos dois desenhos, e os dois passariam a rolar por dentro — cerca de cem
 * pixels cada. E a razão é 1,1 e não 1,2 porque a 1280, o degrau em que as duas
 * colunas começam, a de 1,2 deixava a série onze pixels abaixo do piso dela:
 * rolagem de uma dezena de pixels é a pior que existe, porque ninguém percebe
 * que ela está lá e ela leva embora o último mês (lição de 19/09).
 */
const LUGAR = { mapa: 'xl:row-span-2' } as const

/** Prefixo da categoria do fator deste módulo, para o resumo listá-lo. */
const CATEGORIAS = ['frete_rodoviario'] as const

function anoDe(parametro: string | undefined): number | undefined {
  if (parametro === undefined) return undefined
  const ano = Number(parametro)
  return Number.isInteger(ano) && ano > 2000 && ano < 2100 ? ano : undefined
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string; filial?: string }>
}) {
  const ctx = await exigirSessao()
  const parametros = await searchParams
  const ano = anoDe(parametros.ano)

  let dados
  let metodo
  try {
    ;[dados, metodo] = await Promise.all([
      consultarTransportadoras(ctx, ano === undefined ? {} : { ano }),
      consultarMetodo(ctx, { modulo: 'transportadoras' }),
    ])
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      return (
        <Casca ctx={ctx} atual="/transportadoras">
          <Cabecalho titulo="Sem acesso" descricao={erro.message} />
        </Casca>
      )
    }
    throw erro
  }

  /**
   * A filial aberta vem do endereço, e **é conferida contra o que existe**.
   * Sem a conferência, qualquer texto na URL viraria título de painel na tela.
   */
  const filialAberta =
    parametros.filial !== undefined &&
    dados.porFilial.some((f) => f.filial === parametros.filial)
      ? parametros.filial
      : null

  const base = ano === undefined ? '/transportadoras' : `/transportadoras?ano=${ano}`
  const separador = base.includes('?') ? '&' : '?'
  const enderecoDaFilial = (filial: string) =>
    filial === filialAberta ? base : `${base}${separador}filial=${filial}`

  return (
    <Casca ctx={ctx} atual="/transportadoras">
      <Cabecalho
        titulo="Distribuição rodoviária às filiais"
        descricao="Entregas de produto vendido às filiais, por transportadora terceirizada, no Escopo 3."
        acao={
          dados.anos.length > 1 ? (
            <SeletorDeAno
              anos={dados.anos}
              atual={ano ?? null}
              href={(a) => (a === null ? '/transportadoras' : `/transportadoras?ano=${a}`)}
            />
          ) : undefined
        }
      />

      {dados.entregas === 0 ? (
        <Vazio>
          Nenhuma entrega carregada{ano === undefined ? '' : ` para ${ano}`}.
        </Vazio>
      ) : (
        <>
          <Revelar ordem={0}>
            <Grade tipo="tres">
              <Cartao
                rotulo={ano === undefined ? 'Total do período' : `Total de ${ano}`}
                valor={dados.co2Toneladas}
                casas={1}
                unidade="t CO₂e"
                nota="Peso vezes distância, com fator médio de frete de carga."
              />
              <Cartao
                rotulo="Por entrega"
                valor={dados.entregas === 0 ? 0 : dados.co2Kg / dados.entregas}
                unidade="kg CO₂e"
                nota="Média do recorte; a distância varia de alguns quilômetros a milhares."
              />
              <Cartao
                rotulo="Entregas"
                valor={dados.entregas}
                casas={0}
                unidade="entregas"
                nota="Uma linha do relatório, uma entrega."
              />
            </Grade>
          </Revelar>

          <div className={GRADE_DA_TELA}>
            <Revelar ordem={1} className={LUGAR.mapa}>
              <Painel
                id="mapa"
                titulo="De onde a entrega sai"
                descricao="As três filiais de origem. Clique numa delas para ver os números."
              >
                <MapaDasFiliais
                  filiais={dados.porFilial}
                  href={enderecoDaFilial}
                  aberta={filialAberta}
                />
                {filialAberta !== null && (
                  <FilialAberta
                    filiais={dados.porFilial}
                    filial={filialAberta}
                    co2KgDoModulo={dados.co2Kg}
                    fechar={base}
                  />
                )}
              </Painel>
            </Revelar>

            <Revelar ordem={2}>
              <Painel titulo="Emissão por mês" descricao="Pela data da entrega.">
                <SerieMensal
                  serie={dados.porMes}
                  nota="Linha internacional não entra: ela é embarque do módulo marítimo."
                />
              </Painel>
            </Revelar>

            <Revelar ordem={3}>
              <Painel
                titulo="Por filial"
                descricao="A emissão é separada por filial de origem, nunca por transportadora."
              >
                <ListaDeGrupos
                  grupos={dados.porFilial.map((f) => ({
                    chave: f.filial,
                    rotulo: f.rotulo,
                    documentos: f.entregas,
                    pessoas: 0,
                    co2Kg: f.co2Kg,
                    agrupadoPorSupressao: false,
                  }))}
                  mostrarPessoas={false}
                />
                {/* Onde alguém concluiria o contrário — o módulo se chama
                    Transportadoras e não mostra transportadora nenhuma. */}
                <p className="mt-3 max-w-[80ch] text-[12px] text-[var(--color-apoio)]">
                  O relatório traz filial, cliente, distância e peso, e{' '}
                  <strong className="font-medium">não diz qual transportadora fez
                  cada entrega</strong> — por isso o corte é por filial.
                </p>
              </Painel>
            </Revelar>
          </div>
        </>
      )}

      {/* **O resumo abre com duas coisas e só duas**: de onde vem o dado e como
          a conta é feita. O lastro — parâmetro, fator e mapa — continua na
          página, recolhido, no formato que a Mobilidade estreou (§11.5).

          **A mistura de CIF e FOB entra recolhida, e é o lugar dela**: ela não
          muda valor nenhum desta tela (§9.1), então é lastro e não ressalva.
          Recolher não é remover — o parâmetro continua na página, nomeando as
          duas modalidades e as duas categorias. */}
      <SobreATela titulo="Distribuição rodoviária às filiais">
        <Procedencia metodo={metodo} modulo="transportadoras" />
        {dados.entregas > 0 && (
          <Bloco titulo="O que entrou">
            {/*
              **O único módulo cujo "o que entrou" vem do agregado da tela.** A
              coleção de entregas é uma ordem de grandeza maior que as outras, e
              a tela acabou de lê-la para desenhar o número: relê-la no método
              seria ler a coleção inteira duas vezes para a mesma
              pergunta. Vindo daqui, os dois números não podem divergir — são um
              só.
            */}
            <Itens
              itens={[
                { rotulo: 'Entregas no total', valor: String(dados.entregas) },
                ...dados.porFilial.map((f) => ({
                  rotulo: `Filial ${f.filial}`,
                  valor: String(f.entregas),
                })),
              ]}
            />
          </Bloco>
        )}

        <Bloco titulo="Como o número é calculado">
          <p className="max-w-[80ch] leading-[1.5]">
            Cada entrega vira peso vezes distância: o peso em toneladas,
            multiplicado pelos quilômetros do trecho da filial até o cliente e
            pelo fator médio de frete rodoviário de carga. É só a ida, e o veículo
            é a média da frota — a origem não diz qual caminhão fez a entrega. O
            mês sai da data da entrega.
          </p>
        </Bloco>

        <Recolhido titulo="Parâmetros, fator e mapa">
          <Bloco titulo="Parâmetros">
            <Parametros parametros={metodo.parametros} />
          </Bloco>
          <Bloco titulo="Fator">
            <Fatores fatores={metodo.fatores} categorias={CATEGORIAS} />
          </Bloco>
          <Bloco titulo="Mapa">
            Ponto = filial de origem, no centro do município. O destino não é
            desenhado: a origem traz a distância, não a localização do cliente.
          </Bloco>
        </Recolhido>
      </SobreATela>
    </Casca>
  )
}

/**
 * O mapa da tela de Viagens — CLAUDE.md §10.3.
 *
 * **O desenho é compartilhado; o que mora aqui é o que é do inventário.** O
 * componente em `../mapa-de-rotas` não conhece coleção, consulta nem módulo:
 * recebe lugares e ligações e desenha. Este arquivo faz a ponte — converte o
 * corredor entre regiões no formato do desenho e escreve a legenda que só vale
 * para esta tela.
 *
 * **A unidade aqui é o corredor entre regiões, não a rota par-a-par**, e isso é
 * escolha de leitura: uma linha por par de aeroportos vira um emaranhado sobre o
 * Sudeste e responde pior a pergunta da tela, que é para onde a empresa voa. No
 * programa de viagens a unidade é outra, pelo motivo oposto — lá não há volume
 * que peça agregação.
 *
 * **Nenhum corredor é suprimido por contagem de pessoas** (§3.1.2). Enquanto
 * havia supressão, o mapa calava justamente os corredores mais pesados — a
 * emissão deles já estava no total, e o que ficava escondido era de onde ela
 * vinha. Nada nesta tela diz quem voou; o que mudou é que a rota aparece.
 */
import { inteiro, proporcao } from '@/lib/formato'
import type { LigacaoDoMapa } from '@/lib/mapa'
import { ehDoBrasil } from '@/lib/regiao'
import type { MapaDeCorredores } from '@/server/consultas/inventario'
import { MapaDeRotasSvg, type TextosDoMapa } from '../mapa-de-rotas'

/**
 * O corredor do inventário no formato do desenho.
 *
 * `domestico` sai da mesma classificação que o cadastro do aeroporto grava e que
 * a tela de Método declara (§10.3) — não de uma lista de nomes escrita aqui.
 */
export function ligacoesDosCorredores(mapa: MapaDeCorredores): LigacaoDoMapa[] {
  return mapa.corredores.map((c) => ({
    chave: c.corredor,
    co2Kg: c.co2Kg,
    origem: {
      chave: c.origemRegiao,
      rotulo: c.origemRegiao,
      latitude: c.origemLatitude,
      longitude: c.origemLongitude,
      domestico: ehDoBrasil(c.origemRegiao),
    },
    destino: {
      chave: c.destinoRegiao,
      rotulo: c.destinoRegiao,
      latitude: c.destinoLatitude,
      longitude: c.destinoLongitude,
      domestico: ehDoBrasil(c.destinoRegiao),
    },
  }))
}

/**
 * O que existe e não pôde ser desenhado.
 *
 * São dois motivos, e os dois são recorte declarado, não dado escondido:
 * aeroporto sem região ou sem coordenada, que é dado faltando de verdade, e o
 * trecho rodoviário, que sai por município e não tem geografia no inventário. A
 * supressão que antes morava nesta frase saiu (§3.1.2): ela escondia dado que
 * existia, e é coisa diferente das duas.
 *
 * Continua num componente só porque aparece com mapa e sem mapa, e texto
 * duplicado é garantia de que um dos dois envelhece.
 */
export function NaoDesenhado({ mapa }: { mapa: MapaDeCorredores }) {
  const total = mapa.co2KgAereo + mapa.co2KgNaoAereo
  const proporcaoRodoviaria = total === 0 ? 0 : mapa.co2KgNaoAereo / total

  if (mapa.semGeografia === 0 && mapa.co2KgNaoAereo === 0) return null

  return (
    <>
      {mapa.semGeografia > 0 && (
        <>
          {inteiro(mapa.semGeografia)}{' '}
          {mapa.semGeografia === 1
            ? 'trecho ficou fora do desenho'
            : 'trechos ficaram fora do desenho'}{' '}
          por aeroporto sem região ou sem coordenada no cadastro — é dado faltando, e o
          valor continua somando em todos os totais desta tela.{' '}
        </>
      )}
      {/* **O mapa é aéreo, e calar sobre isso seria omissão.** O trecho de carro
          guarda município, não aeroporto, e a lista do IBGE não é fonte do
          inventário. Enquanto nenhuma das duas fontes administrativas trouxer
          carro, esta frase não aparece — e o primeiro trecho rodoviário que
          entrar a faz aparecer, em vez de deixar o mapa somar menos que o total
          sem explicação. */}
      {mapa.co2KgNaoAereo > 0 && (
        <>
          O mapa desenha só o trecho aéreo, que é o que tem aeroporto com
          coordenada; o rodoviário sai por município e ainda não tem geografia no
          inventário. São {proporcao(proporcaoRodoviaria)} da emissão deste
          recorte, que continua somando em todos os totais desta tela.
        </>
      )}
    </>
  )
}

export function MapaDeCorredoresDoInventario({
  mapa,
  href,
  aberta = null,
}: {
  mapa: MapaDeCorredores
  href?: (regiao: string) => string
  aberta?: string | null
}) {
  const textos: TextosDoMapa = {
    unidade: 'corredor aéreo',
    aviso: (
      <>
        <strong className="font-medium text-[var(--color-tinta)]">
          O ponto não marca a posição exata de nada
        </strong>{' '}
        — é a média dos aeroportos da região. A espessura acompanha a emissão.
      </>
    ),
    ressalva: (
      <>
        Só trechos aéreos; corredor dentro da mesma região vira anel.{' '}
        <NaoDesenhado mapa={mapa} />
      </>
    ),
  }

  return (
    <MapaDeRotasSvg
      ligacoes={ligacoesDosCorredores(mapa)}
      textos={textos}
      href={href}
      aberto={aberta}
    />
  )
}

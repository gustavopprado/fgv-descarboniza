/**
 * O mapa da tela de Marítimo — CLAUDE.md §10.4.
 *
 * **O desenho é compartilhado; o que mora aqui é o que é deste módulo.** A peça
 * em `../mapa-de-rotas` não conhece coleção, consulta nem módulo: recebe lugares
 * e ligações e desenha. Este arquivo faz a ponte e escreve a legenda.
 *
 * **Aqui o ponto é um porto de verdade**, e não uma média como no mapa de
 * Viagens. Lá a agregação por região existe por legibilidade — centenas de
 * trechos que cruzam região —, e o ponto é o centroide dos aeroportos usados
 * naquele recorte. Aqui o embarque já nasce com o par de portos, são poucas
 * dezenas de corredores, e agregar esconderia de onde a carga veio sem ganhar
 * nada. É o mesmo raciocínio que decidiu o mapa do programa de viagens.
 *
 * **Duas coisas que este mapa faz e o de Viagens não faz, e as duas são sobre o
 * dado ter algo que o outro não tem:**
 *
 *  - **a ligação tem sentido**, porque importação tem sentido — a carga sai de
 *    um porto e chega no outro, e isso está no documento. No inventário de
 *    viagens ida e volta são a mesma ligação, e um ponto percorrendo a linha
 *    inventaria uma direção que o recorte não tem;
 *  - **não há divisas de região**, porque região não é recorte deste módulo.
 *    Desenhá-las convidaria a procurar um agrupamento que a tela não oferece.
 */
import { inteiro, proporcao } from '@/lib/formato'
import type { LigacaoDoMapa } from '@/lib/mapa'
import type { MapaMaritimo } from '@/server/consultas/inventario'
import { MapaDeRotasSvg, type TextosDoMapa } from '../mapa-de-rotas'

/**
 * O corredor do módulo no formato do desenho.
 *
 * `domestico` sai do país do código oficial, gravado no cadastro de portos — não
 * de leitura do nome, que seria uma lista de nomes escrita dentro do desenho.
 */
export function ligacoesDosCorredores(mapa: MapaMaritimo): LigacaoDoMapa[] {
  return mapa.corredores.map((c) => ({
    chave: c.corredor,
    co2Kg: c.co2Kg,
    origem: {
      chave: c.origem,
      rotulo: c.origemRotulo,
      latitude: c.origemLatitude,
      longitude: c.origemLongitude,
      domestico: c.origemDomestico,
    },
    destino: {
      chave: c.destino,
      rotulo: c.destinoRotulo,
      latitude: c.destinoLatitude,
      longitude: c.destinoLongitude,
      domestico: c.destinoDomestico,
    },
  }))
}

/**
 * O que existe e não pôde ser desenhado.
 *
 * É recorte declarado, não dado escondido: embarque sem código de porto numa das
 * pontas, ou com código que o cadastro oficial não resolve em coordenada. O
 * valor continua somando em todos os totais da tela — mapa que soma menos que o
 * número, sem uma palavra, é lido como falha de carga.
 */
export function NaoDesenhado({ mapa }: { mapa: MapaMaritimo }) {
  if (mapa.semGeografia === 0) return null
  const total = mapa.co2KgDesenhado + mapa.co2KgSemGeografia

  return (
    <>
      {inteiro(mapa.semGeografia)}{' '}
      {mapa.semGeografia === 1 ? 'embarque não aparece' : 'embarques não aparecem'} no
      desenho por falta de código de porto ou de coordenada —{' '}
      {proporcao(total === 0 ? 0 : mapa.co2KgSemGeografia / total)} da emissão marítima,
      que continua somando no total.
    </>
  )
}

export function MapaDeCorredoresMaritimos({ mapa }: { mapa: MapaMaritimo }) {
  const textos: TextosDoMapa = {
    unidade: 'corredor marítimo',
    aviso: (
      <>
        <strong className="font-medium text-[var(--color-tinta)]">
          A linha não é a rota do navio
        </strong>{' '}
        — é a ligação entre os dois portos; o ponto mostra o sentido da carga.
      </>
    ),
    /* **A legenda ficou só com o aviso, por decisão do Gustavo em 22/09.**
       O que saiu daqui foi a espessura e o que não pôde ser desenhado — e a
       segunda é a que custa: a parcela estimada não tem porto de origem, então
       não vira linha, e hoje ela é a maior parte da emissão marítima. O mapa
       desenha os embarques com detalhe de agente.

       `NaoDesenhado` continua sendo usado pela tela no caso em que **nenhum**
       corredor pôde ser desenhado: ali o mapa está vazio, e um quadro vazio sem
       explicação se lê como falha de carga. */
  }

  return <MapaDeRotasSvg ligacoes={ligacoesDosCorredores(mapa)} textos={textos} sentido divisas={false} />
}

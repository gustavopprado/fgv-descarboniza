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
      {mapa.semGeografia === 1
        ? 'embarque ficou fora do desenho'
        : 'embarques ficaram fora do desenho'}{' '}
      por não ter código de porto numa das pontas ou por o código não ter coordenada
      na lista oficial — {proporcao(total === 0 ? 0 : mapa.co2KgSemGeografia / total)} da
      emissão marítima, que continua somando em todos os totais desta tela.
    </>
  )
}

export function MapaDeCorredoresMaritimos({
  mapa,
  ressalva,
}: {
  mapa: MapaMaritimo
  /** O que a tela precisa declarar junto, como o frete aéreo fora do desenho. */
  ressalva?: React.ReactNode
}) {
  const textos: TextosDoMapa = {
    unidade: 'corredor marítimo',
    aviso: (
      <>
        <strong className="font-medium text-[var(--color-tinta)]">
          A linha não é a derrota do navio
        </strong>{' '}
        — é a geometria entre os dois portos, e o ponto que a percorre mostra só o
        sentido da carga, do embarque ao desembarque. Todos levam o mesmo tempo:
        duração de travessia não está desenhada aqui.
      </>
    ),
    ressalva: (
      <>
        Espessura pela emissão do corredor. Portos pela lista UN/LOCODE, contorno pelo
        Natural Earth. {ressalva} <NaoDesenhado mapa={mapa} />
      </>
    ),
  }

  return <MapaDeRotasSvg ligacoes={ligacoesDosCorredores(mapa)} textos={textos} sentido divisas={false} />
}

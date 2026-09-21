/**
 * O mapa das filiais — CLAUDE.md §9.5.
 *
 * **Este mapa não tem rota, e por isso não é o mapa de rotas.** A planilha de
 * entregas não traz coordenada de cliente: ela traz a distância até ele. Não há
 * de onde tirar a outra ponta de uma linha, e desenhar uma linha para um ponto
 * inventado afirmaria um destino que o dado não tem. O que existe são **três
 * lugares e os números de cada um** — que é exatamente o que a §9.5 pede.
 *
 * **O desenho é compartilhado, o dado não** (§7.5): o contorno do mundo, o do
 * Brasil e a marca de lugar vêm da mesma peça que desenha Viagens, o marítimo e
 * o programa. O que muda aqui é o enquadramento e o que se clica.
 *
 * **O enquadramento é o Brasil inteiro, e não os três pontos.** Enquadrar pelos
 * pontos daria um retângulo entre o Paraná e Pernambuco, com o país cortado nas
 * quatro bordas — um mapa que parece truncado. Com o país inteiro, a distância
 * entre as filiais é o que ela é, e o Norte vazio também informa: não há filial
 * lá.
 *
 * **Clicar é âncora, não JavaScript.** O recorte vai para o endereço, como o
 * seletor de ano: recarregar mantém a filial aberta, o endereço pode ser
 * enviado a outra pessoa, e o ponto continua clicável com script bloqueado.
 */
import { projetar, rotulosQueCabem, type Coordenada } from '@/lib/mapa'
import { CONTORNO_DO_BRASIL } from '@/lib/mundo'
import type { FilialDoModulo } from '@/server/consultas/inventario'
import { Rolavel } from '../componentes'
import { Brasil, Pontos, Terra } from '../mapa-de-rotas'

/**
 * Mais alta que larga, ao contrário do mapa de rotas.
 *
 * O Brasil cabe num quadrado quase exato — quarenta e cinco graus de longitude
 * por trinta e nove de latitude —, e a projeção usa uma escala só para os dois
 * eixos (senão rota curta pareceria longa por acidente de enquadramento). Numa
 * moldura larga, o país sobraria branco dos dois lados.
 */
const MOLDURA = { largura: 470, altura: 420, margem: 30 }

/**
 * Teto e piso do desenho — a mesma regra do mapa de rotas, pelos mesmos dois
 * motivos.
 *
 * `viewBox` é escala, não tamanho: sem teto, um monitor largo multiplica o
 * desenho inteiro, rótulo incluído; sem piso, um celular o reduz até o nome da
 * filial virar sujeira de quatro pixels. Abaixo do piso ele rola, que é gesto
 * natural num mapa — encolher o texto não é.
 */
const LARGURA_MAXIMA = 780
const LARGURA_MINIMA = Math.round(MOLDURA.largura * 0.9)

/** Um respiro além da caixa do país, para o litoral não encostar na borda. */
const FOLGA_EM_GRAUS = 1.5

/** Os quatro cantos do país, que é o que a projeção enquadra. */
function cantosDoBrasil(): Coordenada[] {
  const oeste = Math.min(...CONTORNO_DO_BRASIL.map((a) => a.caixa[0]))
  const sul = Math.min(...CONTORNO_DO_BRASIL.map((a) => a.caixa[1]))
  const leste = Math.max(...CONTORNO_DO_BRASIL.map((a) => a.caixa[2]))
  const norte = Math.max(...CONTORNO_DO_BRASIL.map((a) => a.caixa[3]))
  return [
    { longitude: oeste - FOLGA_EM_GRAUS, latitude: sul - FOLGA_EM_GRAUS },
    { longitude: leste + FOLGA_EM_GRAUS, latitude: norte + FOLGA_EM_GRAUS },
  ]
}

export function MapaDasFiliais({
  filiais,
  href,
  aberta,
}: {
  filiais: FilialDoModulo[]
  /** Endereço que abre (ou fecha) a filial. */
  href: (filial: string) => string
  aberta: string | null
}) {
  /**
   * **Filial sem ponto não é desenhada, e não some da tela.** A coordenada vem
   * do centroide do município (§7.4) e pode faltar; a legenda declara quantas
   * ficaram sem ponto, porque nome que some sem aviso vira pergunta sobre dado
   * faltando.
   */
  const comPonto = filiais.filter(
    (f) => f.latitude !== null && f.longitude !== null,
  )
  const semPonto = filiais.length - comPonto.length

  const lugares = comPonto.map((f) => ({
    chave: f.filial,
    rotulo: f.rotulo,
    latitude: f.latitude as number,
    longitude: f.longitude as number,
    domestico: true,
  }))

  const projecao = projetar(cantosDoBrasil(), MOLDURA)
  const cabem = rotulosQueCabem(lugares, projecao, 1)
  const semNome = lugares.filter((l) => !cabem.has(l.chave)).length

  return (
    <figure className="m-0" style={{ maxWidth: LARGURA_MAXIMA }}>
      <Rolavel minimo={LARGURA_MINIMA}>
        <div className="relative overflow-hidden rounded-xl bg-[var(--color-escuro-2)] p-1.5">
          <svg
            viewBox={`0 0 ${MOLDURA.largura} ${MOLDURA.altura}`}
            className="block h-auto w-full"
            role="img"
            aria-label={`Mapa do Brasil com ${lugares.length} filial(is) marcada(s).`}
          >
            <Terra projecao={projecao} chave="filiais" />
            <Brasil projecao={projecao} chave="filiais" />
            <Pontos
              lugares={lugares}
              projecao={projecao}
              atraso={240}
              rotular={(ponto) => cabem.has(ponto.chave)}
              href={href}
              aberto={aberta}
              chave="filiais"
            />
          </svg>
        </div>
      </Rolavel>

      <figcaption className="mt-2 max-w-[70ch] text-[12px] leading-[1.5] text-[var(--color-apoio)]">
        {/* A ressalva que impede a primeira leitura errada vem antes de tudo: o
            ponto é a filial de onde a entrega saiu, e não o lugar em que ela foi
            entregue. O destino não existe neste mapa porque não existe na
            origem — a planilha traz a distância até o cliente, não onde ele
            está. */}
        Cada ponto é uma filial de origem; clique para ver os números dela.{' '}
        <strong className="font-medium">O destino das entregas não é desenhado</strong>
        : o relatório traz a distância até o cliente, não a localização dele.
        <span className="mt-1 block text-[11.5px]">
          Ponto no centroide do município (IBGE).
          {semNome > 0 && ` ${semNome} nome não coube no desenho.`}
          {semPonto > 0 &&
            ` ${semPonto} filial ficou sem ponto por falta de coordenada, e continua nos totais.`}
          <span className="max-sm:inline hidden"> Nesta largura os nomes saem do desenho.</span>
        </span>
      </figcaption>
    </figure>
  )
}

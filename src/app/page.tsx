/**
 * Visão geral — o inventário consolidado do ano-base (CLAUDE.md §10.0).
 *
 * É a sétima e última tela, e ficou por último de propósito: enquanto o
 * marítimo não existisse, ela mostraria dois terços do inventário como se fosse
 * o total.
 *
 * **Sem filtros.** Os quatro cortes da §10.1 ficam nas telas de módulo. Esta é
 * uma leitura só — é a tela que alguém abre para ver o número do ano —, e um
 * seletor de período aqui convidaria a ler ponta parcial como ano cheio, que é a
 * §0.1 com outra roupa: queda de cobertura lida como queda de emissão.
 *
 * Aqui moram sessão, consulta e recusa; o desenho mora em
 * `visao-geral/conteudo.tsx`.
 */
import { AcessoNegadoError } from '@/server/consultas/acesso'
import { consultarVisaoGeral } from '@/server/consultas/visao-geral'
import { exigirSessao } from '@/server/sessao'
import { Casca } from './casca'
import { Cabecalho } from './componentes'
import { ConteudoDaVisaoGeral } from './visao-geral/conteudo'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const ctx = await exigirSessao()

  let dados
  try {
    dados = await consultarVisaoGeral(ctx)
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      // `importacao` e `colaborador` não veem o consolidado (§5). Quem chega
      // aqui pela URL recebe a recusa da consulta, não uma tela recortada — um
      // total que soma um módulo só seria um número menor que o inventário
      // apresentado como se fosse o inventário.
      return (
        <Casca ctx={ctx} atual="/">
          <Cabecalho titulo="Sem acesso" descricao={erro.message} />
        </Casca>
      )
    }
    throw erro
  }

  return (
    <Casca ctx={ctx} atual="/">
      <ConteudoDaVisaoGeral dados={dados} />
    </Casca>
  )
}

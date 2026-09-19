/**
 * Busca de município para o formulário do programa — CLAUDE.md §7.4.
 *
 * **Não toca o banco.** A lista do IBGE é embarcada na aplicação (§7.4), e a
 * busca acontece sobre ela, no servidor. O motivo de existir uma rota em vez de
 * mandar a lista inteira para o navegador é tamanho: são mais de cinco mil
 * municípios, e nenhum formulário precisa carregá-los todos para oferecer doze.
 *
 * **Exige sessão mesmo sendo dado público.** O conteúdo não é sigiloso, mas um
 * caminho aberto na aplicação é um caminho aberto: a regra do sistema é que se
 * entra antes de pedir qualquer coisa, e abrir uma exceção por conveniência é
 * como se começa a ter exceções.
 */
import { buscarMunicipios } from '@/lib/municipios'
import { sessaoAtual } from '@/server/sessao'

export const dynamic = 'force-dynamic'

export async function GET(requisicao: Request): Promise<Response> {
  const ctx = await sessaoAtual()
  if (ctx === null) {
    return Response.json({ erro: 'sem sessão' }, { status: 401 })
  }

  const termo = new URL(requisicao.url).searchParams.get('q') ?? ''
  return Response.json({
    municipios: buscarMunicipios(termo).map((m) => ({
      codigo: m.codigoIbge,
      rotulo: `${m.nome}/${m.uf}`,
    })),
  })
}

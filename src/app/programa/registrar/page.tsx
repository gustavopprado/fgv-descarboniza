/**
 * Tela "Registrar viagem" — CLAUDE.md §10, item 6.
 *
 * **Isto não é inventário** (§0.1). A tela escreve em `viagemRegistrada` e lê
 * dela; não toca nenhuma coleção do inventário, e nenhuma tela do inventário
 * toca esta. O cálculo é que se compartilha — os mesmos fatores, as mesmas
 * funções de emissão (§7.5).
 *
 * O que ela pede é o mínimo que calcula emissão. O que ela devolve é a emissão
 * na hora, que é o incentivo de adesão do programa e não se omite.
 */
import { periodo } from '@/lib/formato'
import { AcessoNegadoError } from '@/server/consultas/acesso'
import {
  consultarAeroportos,
  consultarMinhasViagens,
} from '@/server/consultas/programa'
import { exigirSessao } from '@/server/sessao'
import { Casca } from '../../casca'
import { Cabecalho, Vazio } from '../../componentes'
import { FormularioDeViagem, type ViagemParaEditar } from './formulario'

export const dynamic = 'force-dynamic'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ viagem?: string }>
}) {
  const ctx = await exigirSessao()
  const parametros = await searchParams

  let aeroportos
  let minhas
  try {
    ;[aeroportos, minhas] = await Promise.all([
      consultarAeroportos(ctx),
      consultarMinhasViagens(ctx),
    ])
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      return (
        <Casca ctx={ctx} atual="/programa/registrar">
          <Cabecalho titulo="Sem acesso" descricao={erro.message} />
        </Casca>
      )
    }
    throw erro
  }

  // **A viagem a editar é conferida contra as próprias submissões de quem pediu.**
  // O parâmetro chega da URL, e URL é entrada de fora: procurá-lo na lista que já
  // veio filtrada pelo uid é o que impede alguém de abrir a viagem alheia — e a
  // escrita confere de novo, porque esconder na tela não é controle de acesso.
  const alvo =
    parametros.viagem === undefined
      ? null
      : (minhas.viagens.find((v) => v.reservaId === parametros.viagem) ?? null)

  const editando: ViagemParaEditar | null =
    alvo === null
      ? null
      : {
          reservaId: alvo.reservaId,
          tipo: alvo.tipo,
          dataIda: alvo.dataIda,
          dataVolta: alvo.dataVolta,
          pontos: alvo.pontos,
          rotulos: alvo.rota.split(' → '),
          classeCabine: alvo.classeCabine,
          propriedadeVeiculo: alvo.propriedadeVeiculo,
          combustivel: alvo.combustivel,
          ocupantes: alvo.ocupantes,
        }

  const fechadaParaEdicao = alvo !== null && !alvo.editavel

  return (
    <Casca ctx={ctx} atual="/programa/registrar">
      <Cabecalho
        titulo={editando === null ? 'Registrar viagem' : 'Editar viagem'}
        descricao="Registro voluntário do próprio deslocamento a serviço. É o mínimo que calcula emissão: origem, destino, data e modal — não se pede valor, justificativa nem aprovação, porque se a viagem aconteceu, já foi aprovada antes."
      />

      {fechadaParaEdicao ? (
        <Vazio>
          Esta viagem é de um período já fechado ({periodo(alvo.dataIda, alvo.dataVolta)})
          e não pode mais ser editada. Ela continua valendo e continua na sua lista — o
          fechamento congela o que já foi registrado, não apaga.
        </Vazio>
      ) : (
        <FormularioDeViagem aeroportos={aeroportos} editando={editando} />
      )}

      <p className="mt-6 max-w-[80ch] text-[12px] text-[var(--color-apoio)]/85">
        O que você registra aqui <strong className="font-medium">não entra no
        inventário da empresa</strong>, e isso é deliberado: o inventário é
        alimentado por fonte administrativa completa, e somar a ele um registro
        voluntário produziria uma série cuja variação mede quanta gente preencheu,
        não quanta emissão houve. Os dois usam a mesma matemática e os mesmos
        fatores; o que não se compartilha é o dado.
        {minhas.fechadoAte !== null &&
          ` O período até ${minhas.fechadoAte} está fechado: viagem com ida até essa data não pode mais ser registrada nem editada.`}
      </p>
    </Casca>
  )
}

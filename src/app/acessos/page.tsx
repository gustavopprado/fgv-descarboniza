/**
 * Acessos — liberar convidado externo. Ver POS-DEPLOY.md.
 *
 * Só `admin` e `gestor` abrem esta tela, e a recusa está na consulta, não no
 * menu. Ela concede **um papel só**, `externo`, que visualiza o sistema e não
 * registra viagem. Os demais papéis continuam sendo dados por script.
 *
 * Sem JavaScript de cliente: cada botão é um formulário que chama uma ação de
 * servidor, e o resultado volta pelo endereço.
 */
import { AcessoNegadoError } from '@/server/consultas/acesso'
import {
  MOTIVO_DA_RECUSA,
  consultarAcessos,
  type CodigoDaRecusa,
} from '@/server/consultas/acessos'
import { exigirSessao } from '@/server/sessao'
import { Casca } from '../casca'
import { Cabecalho, MINIMO, Painel, Revelar, Rolavel, TABELA, Vazio } from '../componentes'
import { aprovarAction, recusarAction, revogarAction } from './acoes'

export const dynamic = 'force-dynamic'

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})

function quando(iso: string | null): string {
  if (iso === null || iso === '') return '—'
  const data = new Date(iso)
  return Number.isNaN(data.getTime()) ? '—' : DATA_HORA.format(data)
}

const BOTAO = {
  forte:
    'rounded-[9px] bg-[var(--color-folha-700)] px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[var(--color-folha-900)] max-sm:py-3',
  fraco:
    'rounded-[9px] border border-[var(--color-linha)] px-3.5 py-1.5 text-[12.5px] text-[var(--color-apoio)] transition-colors hover:border-red-300 hover:text-red-700 max-sm:py-3',
} as const

function Acao({
  uid,
  acao,
  rotulo,
  tom,
}: {
  uid: string
  acao: (dados: FormData) => Promise<void>
  rotulo: string
  tom: keyof typeof BOTAO
}) {
  return (
    <form action={acao} className="inline-block">
      <input type="hidden" name="uid" value={uid} />
      <button type="submit" className={BOTAO[tom]}>
        {rotulo}
      </button>
    </form>
  )
}

const NOME_DO_STATUS = { recusada: 'Recusado', revogada: 'Revogado' } as const

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>
}) {
  const ctx = await exigirSessao()
  const { aviso } = await searchParams

  let dados
  try {
    dados = await consultarAcessos(ctx)
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      return (
        <Casca ctx={ctx} atual="/acessos">
          <Cabecalho titulo="Sem acesso" descricao={erro.message} />
        </Casca>
      )
    }
    throw erro
  }

  // O código vem da URL, que é entrada de fora: só vira frase se for conhecido.
  const motivo =
    aviso !== undefined && aviso in MOTIVO_DA_RECUSA
      ? MOTIVO_DA_RECUSA[aviso as CodigoDaRecusa]
      : null

  return (
    <Casca ctx={ctx} atual="/acessos">
      <Cabecalho
        titulo="Acessos"
        descricao="Convidados de fora do domínio corporativo criam uma senha na tela de entrada e só passam depois de liberados aqui. Convidado visualiza o inventário e as emissões registradas; não registra viagem e não vê quem registrou."
      />

      {motivo !== null && (
        <p
          role="alert"
          className="mb-4 rounded-[11px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800"
        >
          {motivo}
        </p>
      )}

      <Revelar ordem={0}>
        <Painel
          titulo="Pedidos pendentes"
          descricao="O sistema não confirma que o e-mail é mesmo da pessoa: qualquer um pode se cadastrar com o endereço de outra. Libere só quem combinou com você que acabou de se cadastrar."
        >
          {dados.pendentes.length === 0 ? (
            <Vazio>Nenhum pedido aguardando.</Vazio>
          ) : (
            <Rolavel minimo={MINIMO.tabela3}>
              <table className={TABELA.tabela}>
                <thead>
                  <tr>
                    <th className={TABELA.th}>E-mail</th>
                    <th className={TABELA.th}>Pedido em</th>
                    <th className={TABELA.th} />
                  </tr>
                </thead>
                <tbody>
                  {dados.pendentes.map((p) => (
                    <tr key={p.uid}>
                      <td className={`${TABELA.td} font-medium`}>
                        {p.email}
                        <span className="mt-0.5 block text-[11.5px] font-normal text-[var(--color-apoio)]">
                          {p.emailVerificado
                            ? 'e-mail confirmado pelo Google'
                            : 'e-mail não confirmado'}
                        </span>
                      </td>
                      <td
                        className={`${TABELA.td} text-[var(--color-apoio)]`}
                        data-rotulo="Pedido em"
                      >
                        {quando(p.pedidoEm)}
                      </td>
                      <td className={`${TABELA.td} text-right whitespace-nowrap`}>
                        <span className="inline-flex gap-2">
                          <Acao uid={p.uid} acao={aprovarAction} rotulo="Liberar" tom="forte" />
                          <Acao uid={p.uid} acao={recusarAction} rotulo="Recusar" tom="fraco" />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Rolavel>
          )}
        </Painel>
      </Revelar>

      <Revelar ordem={1} className="mt-4">
        <Painel
          titulo="Convidados liberados"
          descricao="Revogar encerra a sessão aberta e fecha a porta: fora do domínio não há acesso padrão a que voltar."
        >
          {dados.ativos.length === 0 ? (
            <Vazio>Nenhum convidado externo com acesso.</Vazio>
          ) : (
            <Rolavel minimo={MINIMO.tabela3}>
              <table className={TABELA.tabela}>
                <thead>
                  <tr>
                    <th className={TABELA.th}>E-mail</th>
                    <th className={TABELA.th}>Liberado por</th>
                    <th className={TABELA.th} />
                  </tr>
                </thead>
                <tbody>
                  {dados.ativos.map((a) => (
                    <tr key={a.uid}>
                      <td className={`${TABELA.td} font-medium`}>{a.email}</td>
                      <td
                        className={`${TABELA.td} text-[var(--color-apoio)]`}
                        data-rotulo="Liberado por"
                      >
                        {a.aprovadoPor === null
                          ? 'por script'
                          : `${a.aprovadoPor} · ${quando(a.aprovadoEm)}`}
                      </td>
                      <td className={`${TABELA.td} text-right`}>
                        <Acao uid={a.uid} acao={revogarAction} rotulo="Revogar" tom="fraco" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Rolavel>
          )}
        </Painel>
      </Revelar>

      {dados.encerrados.length > 0 && (
        <Revelar ordem={2} className="mt-4">
          <Painel
            titulo="Recusados e revogados"
            descricao="Quem está aqui não volta sozinho para a fila tentando entrar de novo. Para devolver o acesso, libere."
          >
            <Rolavel minimo={MINIMO.tabela3}>
              <table className={TABELA.tabela}>
                <thead>
                  <tr>
                    <th className={TABELA.th}>E-mail</th>
                    <th className={TABELA.th}>Decisão</th>
                    <th className={TABELA.th} />
                  </tr>
                </thead>
                <tbody>
                  {dados.encerrados.map((e) => (
                    <tr key={e.uid}>
                      <td className={`${TABELA.td} font-medium`}>{e.email}</td>
                      <td
                        className={`${TABELA.td} text-[var(--color-apoio)]`}
                        data-rotulo="Decisão"
                      >
                        {NOME_DO_STATUS[e.status as keyof typeof NOME_DO_STATUS]} por{' '}
                        {e.decididoPor ?? '—'} · {quando(e.decididoEm)}
                      </td>
                      <td className={`${TABELA.td} text-right`}>
                        <Acao uid={e.uid} acao={aprovarAction} rotulo="Liberar" tom="forte" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Rolavel>
          </Painel>
        </Revelar>
      )}
    </Casca>
  )
}

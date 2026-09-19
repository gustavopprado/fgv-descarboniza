'use client'

/**
 * Formulário do programa de viagens — CLAUDE.md §7.5.
 *
 * **O formulário é mínimo de propósito, e cada campo que existe entra na
 * conta.** Não há valor, não há justificativa, não há aprovação: se a viagem
 * aconteceu, já foi aprovada antes. Quanto mais curto, maior a chance de ser
 * preenchido — e esse é o único mecanismo de adesão que este programa tem.
 *
 * **O retorno imediato da emissão não é enfeite**, é o incentivo: quem preenche
 * vê na hora quanto a própria viagem emitiu. Por isso o resultado aparece aqui,
 * na mesma tela, e não numa página de confirmação.
 *
 * É componente de cliente porque a montagem do trajeto é interativa — trechos
 * que se acrescentam, paradas que se inserem, volta que se gera. As telas de
 * leitura do sistema continuam funcionando sem script; esta, por natureza, não.
 */
import { useActionState, useEffect, useState } from 'react'

import { inteiro, numero } from '@/lib/formato'
import type { AeroportoParaEscolher } from '@/server/consultas/programa'
import { registrarViagemAction, type EstadoDoFormulario } from '../acoes'

/* --------------------------------------------------------------- estilo */

/**
 * **Esta é a única tela que alguém de fora da equipe abre, e abre no telefone.**
 * Por isso os dois ajustes `max-sm:` daqui, que valem só abaixo de 640px e não
 * mexem na densidade do desktop:
 *
 * **Campo com 16px no celular.** O Safari do iPhone amplia a página inteira ao
 * focar um campo cuja fonte é menor que 16px, e o layout salta sob o dedo de
 * quem está preenchendo. Não é preferência de tamanho: abaixo de 16px o
 * navegador decide por conta própria.
 *
 * **Alvo de toque de 44px.** Medidos, os alvos saíam entre 32 e 41px — o pior
 * era a opção do autocomplete, com 32px, que é a interação central desta tela:
 * oito opções empilhadas para escolher aeroporto ou município. Dedo não tem a
 * precisão de um ponteiro, e errar a opção aqui é escolher o lugar errado.
 */
const CAMPO =
  'w-full rounded-[9px] border border-[var(--color-linha)] bg-white px-3 py-2 text-[13.5px] text-[var(--color-tinta)] outline-none focus:border-[var(--color-folha-700)] max-sm:py-3 max-sm:text-[16px]'
const ROTULO = 'block text-[12px] font-medium text-[var(--color-apoio)]'
const BOTAO_FRACO =
  'rounded-[8px] border border-[var(--color-linha)] px-3 py-1.5 text-[12.5px] text-[var(--color-tinta)] transition-colors hover:bg-[var(--color-folha-300)] max-sm:px-4 max-sm:py-3'
const BOTAO_FORTE =
  'rounded-[9px] bg-[var(--color-folha-700)] px-5 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-[var(--color-folha-900)] disabled:opacity-60 max-sm:py-3.5'
/** Opção da lista de aeroporto e de município: o alvo de toque mais usado daqui. */
const OPCAO =
  'block w-full px-3 py-1.5 text-left text-[13px] hover:bg-[var(--color-folha-300)] max-sm:py-3'

/* ------------------------------------------------- escolha de aeroporto */

/**
 * O aeroporto é escolhido de uma lista fechada, nunca digitado livre.
 *
 * A lista inteira vem do servidor como propriedade: são poucas dezenas de
 * aeroportos, e mandá-los de uma vez custa menos que uma ida ao servidor por
 * tecla digitada. O município, que são mais de cinco mil, faz o contrário.
 */
function EscolherAeroporto({
  rotulo,
  valor,
  aeroportos,
  aoEscolher,
}: {
  rotulo: string
  valor: string
  aeroportos: AeroportoParaEscolher[]
  aoEscolher: (iata: string) => void
}) {
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(false)

  const termo = busca.trim().toLowerCase()
  const achados =
    termo === ''
      ? []
      : aeroportos
          .filter(
            (a) =>
              a.iata.toLowerCase().includes(termo) ||
              a.nome.toLowerCase().includes(termo) ||
              (a.cidade ?? '').toLowerCase().includes(termo),
          )
          .slice(0, 8)

  const escolhido = aeroportos.find((a) => a.iata === valor) ?? null

  return (
    <div className="relative">
      <label className={ROTULO}>{rotulo}</label>
      <input
        className={`${CAMPO} mt-1`}
        placeholder="Código ou cidade"
        value={aberto ? busca : escolhido === null ? '' : `${escolhido.iata} — ${escolhido.cidade ?? escolhido.nome}`}
        onFocus={() => {
          setAberto(true)
          setBusca('')
        }}
        onBlur={() => window.setTimeout(() => setAberto(false), 150)}
        onChange={(evento) => setBusca(evento.target.value)}
      />
      {aberto && achados.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-[9px] border border-[var(--color-linha)] bg-white py-1 shadow-[0_6px_18px_rgba(34,51,31,.12)]">
          {achados.map((a) => (
            <li key={a.iata}>
              <button
                type="button"
                className={OPCAO}
                onMouseDown={(evento) => {
                  evento.preventDefault()
                  aoEscolher(a.iata)
                  setAberto(false)
                }}
              >
                <b className="font-semibold">{a.iata}</b> — {a.cidade ?? a.nome}
                {a.uf === null ? '' : `/${a.uf}`}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* -------------------------------------------------- escolha de município */

type Parada = { codigo: string; rotulo: string }

/**
 * O município também é escolhido de uma lista fechada (§7.4).
 *
 * **É isso que torna o cache de rota eficaz**, e não só um detalhe de
 * usabilidade: a chave do cache é a sequência de códigos IBGE, e texto livre
 * faria "Sao Jose dos Pinhais" e "São José dos Pinhais" virarem duas rotas
 * distintas — duas chamadas pagas ao provedor pelo mesmo trajeto.
 */
function EscolherMunicipio({
  rotulo,
  valor,
  aoEscolher,
}: {
  rotulo: string
  valor: Parada | null
  aoEscolher: (parada: Parada) => void
}) {
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(false)
  const [achados, setAchados] = useState<Parada[]>([])

  useEffect(() => {
    const termo = busca.trim()
    if (termo.length < 2) {
      setAchados([])
      return
    }
    // Espera antes de perguntar: sem isso, cada tecla vira uma requisição.
    const tarefa = window.setTimeout(() => {
      void fetch(`/api/municipios?q=${encodeURIComponent(termo)}`)
        .then((r) => (r.ok ? r.json() : { municipios: [] }))
        .then((dados: { municipios: Parada[] }) => setAchados(dados.municipios ?? []))
        .catch(() => setAchados([]))
    }, 220)
    return () => window.clearTimeout(tarefa)
  }, [busca])

  return (
    <div className="relative min-w-0 flex-1">
      <label className={ROTULO}>{rotulo}</label>
      <input
        className={`${CAMPO} mt-1`}
        placeholder="Comece a digitar o município"
        value={aberto ? busca : (valor?.rotulo ?? '')}
        onFocus={() => {
          setAberto(true)
          setBusca('')
        }}
        onBlur={() => window.setTimeout(() => setAberto(false), 150)}
        onChange={(evento) => setBusca(evento.target.value)}
      />
      {aberto && achados.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-[9px] border border-[var(--color-linha)] bg-white py-1 shadow-[0_6px_18px_rgba(34,51,31,.12)]">
          {achados.map((m) => (
            <li key={m.codigo}>
              <button
                type="button"
                className={OPCAO}
                onMouseDown={(evento) => {
                  evento.preventDefault()
                  aoEscolher(m)
                  setAberto(false)
                }}
              >
                {m.rotulo}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ resultado */

/**
 * O retorno imediato da §7.5.
 *
 * **A regra dos ocupantes fica explícita aqui**, e não num rodapé: a §7.5 manda
 * deixá-la na interface, porque um número que é um terço do que o carro emitiu
 * precisa dizer por que é um terço.
 */
function Resultado({ estado }: { estado: EstadoDoFormulario }) {
  if (estado.situacao !== 'gravada') return null

  const dividido = estado.ocupantes !== null && estado.ocupantes > 1

  return (
    <div className="mt-5 rounded-[var(--radius-painel)] border border-[var(--color-folha-500)] bg-[var(--color-folha-300)]/50 px-[22px] py-5">
      <p className="text-[12.5px] text-[var(--color-folha-900)]">
        Viagem registrada. Sua emissão:
      </p>
      <p className="mt-0.5 font-[family-name:var(--font-titulo)] text-[33px] font-bold tracking-[-0.03em] text-[var(--color-tinta)] tabular-nums">
        {numero(estado.co2Kg)}
        <span className="ml-1.5 text-[14px] font-semibold text-[var(--color-apoio)]">
          kg CO₂e
        </span>
      </p>
      <p className="mt-1 max-w-[70ch] text-[12.5px] text-[var(--color-apoio)]">
        {inteiro(estado.trechos.length)}{' '}
        {estado.trechos.length === 1 ? 'trecho' : 'trechos'}, {numero(estado.distanciaKm, 0)} km.{' '}
        {dividido
          ? `O veículo emitiu ${numero(estado.co2KgVeiculo)} kg CO₂e, e a emissão é do veículo: dividida pelos ${estado.ocupantes} ocupantes, sua parte é a de cima.`
          : estado.tipo === 'carro'
            ? 'Com um ocupante, a emissão do veículo é inteira sua.'
            : 'No aéreo cada trecho conta um passageiro, e escala emite mais que um voo direto equivalente.'}
      </p>

      <ul className="mt-3 border-t border-[var(--color-folha-500)] pt-3 text-[12.5px] text-[var(--color-apoio)]">
        {estado.trechos.map((t, i) => (
          <li key={i} className="flex justify-between gap-4 py-0.5">
            <span>
              {t.origem} → {t.destino}
            </span>
            <span className="shrink-0 tabular-nums">
              {numero(t.distanciaKm, 0)} km · {numero(t.co2Kg)} kg
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------ formulário */

export type ViagemParaEditar = {
  reservaId: string
  tipo: 'aereo' | 'carro'
  dataIda: string
  dataVolta: string | null
  pontos: string[]
  rotulos: string[]
  classeCabine: string | null
  propriedadeVeiculo: string | null
  combustivel: string | null
  ocupantes: number | null
}

export function FormularioDeViagem({
  aeroportos,
  editando,
}: {
  aeroportos: AeroportoParaEscolher[]
  editando: ViagemParaEditar | null
}) {
  const [estado, enviar, enviando] = useActionState<EstadoDoFormulario, FormData>(
    registrarViagemAction,
    { situacao: 'inicial' },
  )

  const [tipo, setTipo] = useState<'aereo' | 'carro'>(editando?.tipo ?? 'aereo')
  const [dataIda, setDataIda] = useState(editando?.dataIda ?? '')
  const [dataVolta, setDataVolta] = useState(editando?.dataVolta ?? '')

  const [trechos, setTrechos] = useState<{ origem: string; destino: string }[]>(() => {
    if (editando?.tipo === 'aereo') {
      return editando.pontos
        .slice(0, -1)
        .map((origem, i) => ({ origem, destino: editando.pontos[i + 1] }))
    }
    return [{ origem: '', destino: '' }]
  })
  const [classeCabine, setClasseCabine] = useState(
    editando?.classeCabine ?? 'economica',
  )

  const [paradas, setParadas] = useState<(Parada | null)[]>(() => {
    if (editando?.tipo === 'carro') {
      return editando.pontos.map((codigo, i) => ({
        codigo,
        rotulo: editando.rotulos[i] ?? codigo,
      }))
    }
    return [null, null]
  })
  const [propriedadeVeiculo, setPropriedadeVeiculo] = useState(
    editando?.propriedadeVeiculo ?? 'proprio',
  )
  const [combustivel, setCombustivel] = useState(editando?.combustivel ?? 'gasolina')
  const [ocupantes, setOcupantes] = useState(String(editando?.ocupantes ?? 1))

  const trechosCompletos = trechos.filter((t) => t.origem !== '' && t.destino !== '')
  const paradasCompletas = paradas.filter((p): p is Parada => p !== null)
  const podeEnviar =
    dataIda !== '' &&
    (tipo === 'aereo' ? trechosCompletos.length > 0 : paradasCompletas.length >= 2)

  return (
    <form action={enviar}>
      {/* O que o servidor lê. O estado interativo vive no navegador; o que
          atravessa é o trajeto montado, e é ele que a ação confere campo a
          campo — nada aqui é aceito como veio. */}
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="reservaId" value={editando?.reservaId ?? ''} />
      <input type="hidden" name="trechos" value={JSON.stringify(trechosCompletos)} />
      <input
        type="hidden"
        name="paradas"
        value={JSON.stringify(paradasCompletas.map((p) => p.codigo))}
      />

      <div className="rounded-[var(--radius-painel)] border border-[var(--color-linha)] bg-[var(--color-superficie)] px-[22px] py-5">
        <div className="flex gap-0.5 rounded-[9px] bg-[#E2EADF] p-[3px] self-start w-fit">
          {(['aereo', 'carro'] as const).map((opcao) => (
            <button
              key={opcao}
              type="button"
              onClick={() => setTipo(opcao)}
              className={
                tipo === opcao
                  ? 'rounded-[7px] bg-[var(--color-superficie)] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--color-tinta)] shadow-[0_1px_3px_rgba(34,51,31,.1)]'
                  : 'rounded-[7px] px-3.5 py-1.5 text-[13px] text-[var(--color-apoio)] hover:text-[var(--color-tinta)]'
              }
            >
              {opcao === 'aereo' ? 'Avião' : 'Carro'}
            </button>
          ))}
        </div>

        <div className="mt-5 grid items-start gap-4 [&>*]:min-w-0 sm:grid-cols-2">
          <div>
            <label className={ROTULO} htmlFor="dataIda">
              Data de ida
            </label>
            <input
              id="dataIda"
              name="dataIda"
              type="date"
              required
              className={`${CAMPO} mt-1`}
              value={dataIda}
              onChange={(e) => setDataIda(e.target.value)}
            />
          </div>
          <div>
            <label className={ROTULO} htmlFor="dataVolta">
              Data de volta <span className="font-normal">(se houver)</span>
            </label>
            <input
              id="dataVolta"
              name="dataVolta"
              type="date"
              className={`${CAMPO} mt-1`}
              value={dataVolta}
              onChange={(e) => setDataVolta(e.target.value)}
            />
          </div>
        </div>

        {tipo === 'aereo' ? (
          <div className="mt-6">
            <p className="text-[13px] font-semibold text-[var(--color-tinta)]">Trechos</p>
            <p className="mt-0.5 mb-3 max-w-[62ch] text-[12px] text-[var(--color-apoio)]">
              Um trecho por voo. Escala conta separado — e emite mais que um voo direto
              equivalente, o que é parte do que este registro mostra.
            </p>

            {trechos.map((trecho, i) => (
              <div key={i} className="mb-3 flex flex-wrap items-end gap-3">
                <div className="min-w-[160px] flex-1">
                  <EscolherAeroporto
                    rotulo={`Trecho ${i + 1} — origem`}
                    valor={trecho.origem}
                    aeroportos={aeroportos}
                    aoEscolher={(iata) =>
                      setTrechos((atual) =>
                        atual.map((t, j) => (j === i ? { ...t, origem: iata } : t)),
                      )
                    }
                  />
                </div>
                <div className="min-w-[160px] flex-1">
                  <EscolherAeroporto
                    rotulo="Destino"
                    valor={trecho.destino}
                    aeroportos={aeroportos}
                    aoEscolher={(iata) =>
                      setTrechos((atual) =>
                        atual.map((t, j) => (j === i ? { ...t, destino: iata } : t)),
                      )
                    }
                  />
                </div>
                {trechos.length > 1 && (
                  <button
                    type="button"
                    className={BOTAO_FRACO}
                    onClick={() => setTrechos((atual) => atual.filter((_, j) => j !== i))}
                  >
                    Remover
                  </button>
                )}
              </div>
            ))}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={BOTAO_FRACO}
                onClick={() =>
                  setTrechos((atual) => [...atual, { origem: '', destino: '' }])
                }
              >
                Adicionar trecho
              </button>
              <button
                type="button"
                className={BOTAO_FRACO}
                disabled={trechosCompletos.length === 0}
                onClick={() =>
                  setTrechos((atual) => {
                    const completos = atual.filter(
                      (t) => t.origem !== '' && t.destino !== '',
                    )
                    if (completos.length === 0) return atual
                    return [
                      ...atual,
                      {
                        origem: completos[completos.length - 1].destino,
                        destino: completos[0].origem,
                      },
                    ]
                  })
                }
              >
                Gerar trecho de volta
              </button>
            </div>

            <div className="mt-6 max-w-[280px]">
              <label className={ROTULO} htmlFor="classeCabine">
                Classe da cabine
              </label>
              <select
                id="classeCabine"
                name="classeCabine"
                className={`${CAMPO} mt-1`}
                value={classeCabine}
                onChange={(e) => setClasseCabine(e.target.value)}
              >
                <option value="economica">Econômica</option>
                <option value="executiva">Executiva</option>
                <option value="primeira">Primeira</option>
              </select>
              <p className="mt-1 text-[12px] text-[var(--color-apoio)]">
                Entra na conta: executiva emite quase três vezes o da econômica no mesmo
                trecho, porque ocupa mais espaço no mesmo avião.
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <p className="text-[13px] font-semibold text-[var(--color-tinta)]">Trajeto</p>
            <p className="mt-0.5 mb-3 max-w-[62ch] text-[12px] text-[var(--color-apoio)]">
              Origem, paradas e destino, na ordem. A distância é rodoviária e sai da soma
              dos trechos consecutivos — nunca da linha reta, que em trajeto regional erra
              mais de um quarto.
            </p>

            {paradas.map((parada, i) => (
              <div key={i} className="mb-3 flex flex-wrap items-end gap-3">
                <EscolherMunicipio
                  rotulo={
                    i === 0
                      ? 'Origem'
                      : i === paradas.length - 1
                        ? 'Destino'
                        : `Parada ${i}`
                  }
                  valor={parada}
                  aoEscolher={(escolhida) =>
                    setParadas((atual) =>
                      atual.map((p, j) => (j === i ? escolhida : p)),
                    )
                  }
                />
                {paradas.length > 2 && (
                  <button
                    type="button"
                    className={BOTAO_FRACO}
                    onClick={() => setParadas((atual) => atual.filter((_, j) => j !== i))}
                  >
                    Remover
                  </button>
                )}
              </div>
            ))}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={BOTAO_FRACO}
                onClick={() => setParadas((atual) => [...atual, null])}
              >
                Adicionar parada
              </button>
              <button
                type="button"
                className={BOTAO_FRACO}
                disabled={paradas[0] === null}
                onClick={() =>
                  setParadas((atual) =>
                    atual[0] === null ? atual : [...atual, atual[0]],
                  )
                }
              >
                Retornar à origem
              </button>
            </div>

            <div className="mt-6 grid items-start gap-4 [&>*]:min-w-0 sm:grid-cols-3">
              <div>
                <label className={ROTULO} htmlFor="propriedadeVeiculo">
                  De quem é o veículo
                </label>
                <select
                  id="propriedadeVeiculo"
                  name="propriedadeVeiculo"
                  className={`${CAMPO} mt-1`}
                  value={propriedadeVeiculo}
                  onChange={(e) => setPropriedadeVeiculo(e.target.value)}
                >
                  <option value="proprio">Próprio</option>
                  <option value="frota">Da frota da empresa</option>
                  <option value="locado">Locado</option>
                </select>
              </div>
              <div>
                <label className={ROTULO} htmlFor="combustivel">
                  Combustível
                </label>
                <select
                  id="combustivel"
                  name="combustivel"
                  className={`${CAMPO} mt-1`}
                  value={combustivel}
                  onChange={(e) => setCombustivel(e.target.value)}
                >
                  <option value="gasolina">Gasolina</option>
                  <option value="etanol">Etanol</option>
                  <option value="diesel">Diesel</option>
                  <option value="flex">Flex</option>
                </select>
              </div>
              <div>
                <label className={ROTULO} htmlFor="ocupantes">
                  Ocupantes
                </label>
                <input
                  id="ocupantes"
                  name="ocupantes"
                  type="number"
                  min={1}
                  step={1}
                  className={`${CAMPO} mt-1`}
                  value={ocupantes}
                  onChange={(e) => setOcupantes(e.target.value)}
                />
              </div>
            </div>
            <p className="mt-2 max-w-[62ch] text-[12px] text-[var(--color-apoio)]">
              Os três entram na conta, e por isso são a exceção ao formulário curto. O
              veículo da frota é Escopo 1 da empresa; próprio e locado são Escopo 3.{' '}
              <strong className="font-medium text-[var(--color-tinta)]">
                A emissão é do veículo
              </strong>{' '}
              e é dividida pelos ocupantes ao ser atribuída a cada um — quem dá carona não
              dobra a emissão da viagem.
            </p>
          </div>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-4 border-t border-[var(--color-linha)] pt-5">
          <button type="submit" className={BOTAO_FORTE} disabled={!podeEnviar || enviando}>
            {enviando
              ? 'Calculando…'
              : editando === null
                ? 'Registrar viagem'
                : 'Salvar alterações'}
          </button>
          {tipo === 'carro' && (
            <p className="text-[12px] text-[var(--color-apoio)]">
              A distância rodoviária é consultada ao enviar, e fica guardada para a
              próxima pessoa que fizer o mesmo trajeto.
            </p>
          )}
        </div>

        {estado.situacao === 'erro' && (
          <div className="mt-4 rounded-[9px] border border-[#E4C9C9] bg-[#FBF0F0] px-4 py-3">
            <p className="max-w-[80ch] text-[13px] text-[#7A3B3B]">{estado.mensagem}</p>
          </div>
        )}
      </div>

      <Resultado estado={estado} />
    </form>
  )
}

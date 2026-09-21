/**
 * O botão fixo de informações da tela — CLAUDE.md §10.5.
 *
 * **Substitui a tela de Método**, que saiu em 19/09. O que ela declarava não
 * desapareceu: virou um resumo da própria tela, a um clique, num botão que fica
 * sempre no mesmo lugar.
 *
 * **Um botão por tela, e não um por painel.** A primeira versão pôs um botão em
 * cada cartão e cada painel, e a decisão do Gustavo foi outra: um só, fixo, com
 * tudo sobre aquela tela. O argumento é de leitura — oito botões numa tela são
 * oito coisas disputando atenção ao lado de oito títulos, e quem quer entender o
 * número não sabe qual abrir. Um lugar previsível responde antes de ser
 * procurado.
 *
 * **O conteúdo é muito resumido, de propósito.** Cada parâmetro é rótulo, valor
 * e uma linha; o que sustenta a decisão mora neste repositório, não na tela.
 * Telinha longa é tela de Método com outra roupa.
 *
 * **É `popover` nativo do HTML, sem uma linha de JavaScript.** Um botão com
 * `popovertarget` abre, `Esc` e o clique fora fecham, e o navegador cuida da
 * camada de cima e do foco. É a mesma regra das animações (§14, 15/09): o que
 * depende de script não pode ser o que sustenta o conteúdo.
 *
 * > **Num navegador sem suporte a `popover`, o conteúdo aparece aberto.** Quem
 * > esconde um popover fechado é a folha de estilo que vem junto do suporte,
 * > então onde ela não existe nada é escondido. Feio e correto, nesta ordem: o
 * > pior caso é a declaração visível demais, nunca inalcançável.
 *
 * > **A telinha é um bloco, e bloco não entra em `<p>` nem em título.** Ela é
 * > irmã do botão, e os dois ficam na raiz da tela — nunca dentro de um painel.
 * > Aninhada num parágrafo, o analisador de HTML fecha o parágrafo antes dela, o
 * > DOM deixa de bater com o que o React renderizou e **a hidratação falha**: a
 * > página inteira para de hidratar e todo botão vira enfeite (§14, 18/09).
 *
 * Nada aqui conhece Firestore ou papel. Recebe o que a camada já entregou.
 */
import type { Modulo } from '@/server/consultas/acesso'
import {
  NAO_DEFINIDO,
  type FatorDeclarado,
  type Metodo,
  type ParametroDeclarado,
} from '@/server/consultas/metodo'
import { Etiqueta } from './componentes'

/** Um só por tela — é também o `id` que liga o botão à telinha. */
const ID = 'sobre-esta-tela'

export function SobreATela({
  titulo,
  children,
}: {
  /** O nome da tela, para quem abre saber do que o resumo fala. */
  titulo: string
  children: React.ReactNode
}) {
  return (
    <>
      {/* **Fixo, e por isso a casca reserva o rodapé** (ver `casca.tsx`): botão
          flutuante que cobre a última linha de um painel é botão que esconde
          dado. */}
      <button
        type="button"
        popoverTarget={ID}
        className="fixed right-5 bottom-5 z-40 inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--color-linha)] bg-[var(--color-superficie)] py-2.5 pr-4 pl-3 text-[13px] font-medium text-[var(--color-tinta)] shadow-[0_6px_20px_rgba(34,51,31,.16)] transition-colors duration-150 hover:border-[var(--color-folha-700)] hover:bg-[var(--color-folha-300)] max-sm:right-4 max-sm:bottom-4"
      >
        <span
          aria-hidden
          className="inline-flex size-[19px] shrink-0 items-center justify-center rounded-full bg-[var(--color-folha-900)] text-[11px] leading-none font-semibold text-white"
        >
          i
        </span>
        Sobre esta tela
      </button>

      <div id={ID} popover="auto" className="telinha">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-[15px] font-semibold text-[var(--color-tinta)]">
            {titulo}
          </h2>
          <button
            type="button"
            popoverTarget={ID}
            popoverTargetAction="hide"
            aria-label="Fechar"
            className="-mt-1 -mr-1 shrink-0 cursor-pointer rounded px-2 py-1 text-[17px] leading-none text-[var(--color-apoio)] hover:text-[var(--color-tinta)]"
          >
            ×
          </button>
        </div>

        {/* **Duas colunas a partir de `sm`, por fluxo e não por grade.** Os
            blocos têm alturas muito diferentes — uma fonte de duas linhas ao
            lado de uma lista de dez parâmetros —, e numa grade isso vira linha
            com buraco. Em colunas o conteúdo escorre, e nenhum bloco se parte no
            meio. */}
        <div className="mt-3 sm:columns-2 sm:gap-7">{children}</div>
      </div>
    </>
  )
}

/**
 * Um bloco do resumo. Nunca se parte entre colunas: metade de uma lista de
 * parâmetros numa coluna e metade na outra é pior que uma coluna desigual.
 */
export function Bloco({
  titulo,
  children,
}: {
  titulo: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-5 break-inside-avoid">
      <h3 className="text-[11px] font-semibold tracking-[0.02em] text-[var(--color-apoio)] uppercase">
        {titulo}
      </h3>
      <div className="mt-1.5 text-[12.5px] text-[var(--color-tinta)]">{children}</div>
    </section>
  )
}

/**
 * Os parâmetros que esta tela declara, escolhidos por chave.
 *
 * **Por chave, e não por rótulo**: renomear um rótulo é edição de texto, e por
 * texto a ligação se desfaria em silêncio — a declaração sumiria da tela sem
 * nada quebrar, que é exatamente o risco que a §13 apontou nesta mudança. Chave
 * que não existe no método recebido é erro visível, não linha omitida.
 */
export function Parametros({
  parametros,
  chaves,
}: {
  parametros: ParametroDeclarado[]
  /** Sem chaves, mostra todos os do módulo, na ordem em que foram declarados. */
  chaves?: readonly string[]
}) {
  const porChave = new Map(parametros.map((p) => [p.chave, p]))
  const lista = chaves === undefined ? parametros.map((p) => p.chave) : chaves

  return (
    <dl className="space-y-2.5">
      {lista.map((chave) => {
        const p = porChave.get(chave)
        if (p === undefined) {
          return (
            <div key={chave}>
              <dt className="text-[12.5px] font-medium text-[var(--color-tinta)]">
                {chave}
              </dt>
              <dd className="mt-0.5">
                <Etiqueta tom="atencao">parâmetro não encontrado</Etiqueta>
              </dd>
            </div>
          )
        }
        return (
          <div key={chave}>
            <dt className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
              <span className="font-medium text-[var(--color-tinta)]">{p.rotulo}</span>
              {p.definido ? (
                <span className="text-[var(--color-folha-900)]">{p.valor}</span>
              ) : (
                <Etiqueta tom="atencao">{NAO_DEFINIDO}</Etiqueta>
              )}
            </dt>
            {p.observacao !== null && (
              <dd className="text-[11.5px] leading-[1.45] text-[var(--color-apoio)]">
                {p.observacao}
              </dd>
            )}
          </div>
        )
      })}
    </dl>
  )
}

/** Pares rótulo–valor, para contagem e proporção. */
export function Itens({ itens }: { itens: { rotulo: string; valor: string }[] }) {
  if (itens.length === 0) return null
  return (
    <dl className="space-y-1">
      {itens.map((i) => (
        <div key={i.rotulo} className="flex justify-between gap-3 text-[12.5px]">
          <dt className="text-[var(--color-apoio)]">{i.rotulo}</dt>
          <dd className="font-medium text-[var(--color-tinta)] tabular-nums">
            {i.valor}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * De onde vem o dado e quanto entrou.
 *
 * **Separado das sinalizações de propósito**, e a separação é de ordem de
 * leitura: o resumo conta de onde vem, como o número é feito e só então o que
 * ficou marcado. Alerta antes do cálculo é resposta antes da pergunta.
 */
export function Procedencia({ metodo, modulo }: { metodo: Metodo; modulo: Modulo }) {
  const fonte = metodo.fontes.find((f) => f.modulo === modulo)
  const qualidade = metodo.qualidade.find((q) => q.modulo === modulo)

  return (
    <>
      {fonte !== undefined && (
        <Bloco titulo="Fonte">
          {fonte.descricao}{' '}
          <span className="text-[var(--color-apoio)]">{fonte.situacao}</span>
        </Bloco>
      )}

      {qualidade !== undefined && qualidade.itens.length > 0 && (
        <Bloco titulo="O que entrou">
          <Itens itens={qualidade.itens} />
        </Bloco>
      )}

    </>
  )
}

/**
 * O que a carga marcou: exceção fora da média e alerta por tipo.
 *
 * **A descrição gravada de cada alerta continua fora daqui** (§3.1): ela cita
 * valor da linha — distância, matrícula, razão contra a mediana — e atravessaria
 * a anonimização por uma porta lateral. O que sai é o tipo e quantos documentos
 * ele afetou.
 */
export function Sinalizacoes({ metodo, modulo }: { metodo: Metodo; modulo: Modulo }) {
  const excecoes = metodo.excecoes.filter((e) => e.modulo === modulo)
  const alertas = metodo.alertas.filter((a) => a.modulo === modulo)

  return (
    <>
      {excecoes.length > 0 && (
        <Bloco titulo="Fora da média, como exceção">
          <Itens
            itens={excecoes.map((e) => ({ rotulo: e.motivo, valor: String(e.registros) }))}
          />
        </Bloco>
      )}

      {alertas.length > 0 && (
        <Bloco titulo="Marcado na carga">
          {/* **O código é o texto, e a regra sai da tela.** Cada alerta trazia
              aqui a frase que o levanta, e trinta e duas frases num resumo são o
              resumo virando de novo a tela que ele substituiu. Os códigos são
              descritivos — `geocodificacao_falhou`, `embarque_previsto`,
              `fator_ausente` —, e trocar o sublinhado por espaço basta para lê-los.
              A regra continua escrita junto do código e continua conferida pelo
              `verificar`, que recusa alerta no banco sem motivo declarado. */}
          <Itens
            itens={alertas.map((a) => ({
              rotulo: a.tipo.replace(/_/g, ' '),
              valor: String(a.ocorrencias),
            }))}
          />
        </Bloco>
      )}
    </>
  )
}

/**
 * Os fatores usados por um módulo, com fonte e vigência.
 *
 * **Fator muda de ano para ano, e todo documento de emissão guarda o que foi
 * usado** (§9.1): sem esta lista na tela, a única forma de saber com que fator
 * um número foi feito seria abrir o banco. Fator fora de vigência aparece
 * apagado, e não some — ele explica carga antiga.
 */
export function Fatores({
  fatores,
  categorias,
}: {
  fatores: FatorDeclarado[]
  /** Prefixos de categoria deste módulo. */
  categorias: readonly string[]
}) {
  const doModulo = fatores.filter((f) => categorias.some((c) => f.categoria.startsWith(c)))
  if (doModulo.length === 0) {
    return (
      <p className="text-[12px] text-[var(--color-apoio)]">
        Nenhum fator carregado; sem fator vigente o cálculo falha.
      </p>
    )
  }

  return (
    <ul className="space-y-1">
      {doModulo.map((f) => (
        <li
          key={`${f.categoria}-${f.chave}-${f.versao}-${f.vigenciaInicio}`}
          className={
            f.vigenteHoje
              ? 'flex items-baseline justify-between gap-3 text-[12px]'
              : 'flex items-baseline justify-between gap-3 text-[12px] opacity-55'
          }
        >
          <span className="font-mono text-[11px] text-[var(--color-tinta)]">
            {f.chave}
          </span>
          <span className="shrink-0 text-[var(--color-apoio)] tabular-nums">
            {f.valor} {f.unidade}
          </span>
        </li>
      ))}
      <li className="pt-1 text-[11px] text-[var(--color-apoio)]">
        {doModulo[0].fonte} {doModulo[0].versao}
      </li>
    </ul>
  )
}

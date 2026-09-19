/**
 * O mapa da tela de Emissões registradas — §10, item 7.
 *
 * **O desenho é compartilhado; o que mora aqui é o que é do programa.** O
 * componente em `../mapa-de-rotas` não conhece coleção nem consulta: recebe
 * lugares e ligações e desenha. Este arquivo escreve a legenda, que é onde as
 * duas telas precisam dizer coisas diferentes.
 *
 * **A unidade aqui é o lugar de verdade** — a cidade do aeroporto e o município
 * —, ao contrário do mapa do inventário, que agrega por região. Lá a agregação
 * existe por legibilidade, com centenas de trechos; aqui não há volume que a
 * peça nem supressão a satisfazer, e agregar esconderia de onde se foi sem
 * ganhar nada.
 *
 * **Nada aqui diz quem**, e o mapa mostra menos que a tabela da mesma tela.
 */
import { inteiro, proporcao } from '@/lib/formato'
import type { MapaDoPrograma } from '@/server/consultas/programa'
import { MapaDeRotasSvg, type TextosDoMapa } from '../mapa-de-rotas'

/**
 * O que foi registrado e não pôde ser desenhado.
 *
 * É dado faltando de verdade, e por isso é declarado: aeroporto fora do cadastro
 * e município sem centroide na malha — o IBGE cria o município no cadastro de
 * localidades antes de refazer a malha, então um lugar recém-criado pode ser
 * escolhido no formulário e ainda não ter ponto. **Nada some do total por causa
 * disso**; some do desenho.
 */
export function NaoDesenhadoNoPrograma({ mapa }: { mapa: MapaDoPrograma }) {
  if (mapa.semGeografia === 0) return null

  const total = mapa.co2KgDesenhado + mapa.co2KgSemGeografia

  return (
    <>
      {inteiro(mapa.semGeografia)}{' '}
      {mapa.semGeografia === 1
        ? 'trecho ficou fora do desenho'
        : 'trechos ficaram fora do desenho'}{' '}
      por falta de coordenada do lugar
      {total > 0 && `, somando ${proporcao(mapa.co2KgSemGeografia / total)} da emissão`}
      . O valor continua contando em todos os números desta tela.
    </>
  )
}

export function MapaDoProgramaSvg({ mapa }: { mapa: MapaDoPrograma }) {
  const textos: TextosDoMapa = {
    unidade: 'trajeto',
    aviso: (
      <>
        <strong className="font-medium text-[var(--color-tinta)]">
          Cada ponto é um lugar de verdade
        </strong>{' '}
        — a cidade do aeroporto no voo, o município no carro. Cada linha é um
        trajeto registrado, e a espessura acompanha a emissão.
      </>
    ),
    ressalva: (
      <>
        Ida e volta são a mesma linha, e trajeto que termina onde começou vira
        anel. A emissão desenhada é a atribuída a quem registrou, já dividida
        pelos ocupantes. Contorno pelo Natural Earth, divisas das regiões e
        municípios pelo IBGE. <NaoDesenhadoNoPrograma mapa={mapa} />
      </>
    ),
  }

  // Sem clique: a tela já lista as viagens logo abaixo, e um painel por lugar
  // repetiria o que a tabela diz — no inventário ele existe porque lá a lista
  // de viagens não pode existir (§3.1.2).
  return <MapaDeRotasSvg ligacoes={mapa.ligacoes} textos={textos} />
}

/**
 * (Re)classifica a região de todos os aeroportos cadastrados — §10.3.
 *
 * A região é gravada no documento, e não calculada na consulta, para poder ser
 * revisada e corrigida à mão. Este script existe para dois momentos: depois de
 * uma carga que trouxe aeroporto novo, e depois de uma mudança na regra de
 * classificação — quando a segunda acontece, o mapa **precisa** ser
 * reclassificado de propósito, em vez de mudar sozinho.
 *
 * Sem `--gravar`, apenas mostra o que mudaria.
 *
 * Uso:
 *   npx tsx scripts/classificar-aeroportos.ts [--gravar]
 */
import 'dotenv/config'

import { classificarRegiao } from '../src/lib/regiao'
import type { DocAeroporto } from '../src/server/documentos/tipos'
import { COLECAO } from '../src/server/firestore'
import { conectarFirestore, ehEntrada, executar, tituloDaEtapa } from './_comum'

async function principal(): Promise<void> {
  const gravar = process.argv.slice(2).includes('--gravar')
  const { db, encerrar } = conectarFirestore()

  try {
    tituloDaEtapa(
      gravar ? 'Região dos aeroportos' : 'Região dos aeroportos (simulação)',
    )

    const docs = (await db.collection(COLECAO.aeroporto).get()).docs
    const mudancas: { id: string; iata: string; de: string; para: string; criterio: string }[] = []
    const porCriterio = new Map<string, string[]>()

    for (const doc of docs) {
      const a = doc.data() as DocAeroporto
      const { regiao, criterio } = classificarRegiao(a)

      const lista = porCriterio.get(criterio) ?? []
      lista.push(a.iata)
      porCriterio.set(criterio, lista)

      if (a.regiao !== regiao || a.regiaoCriterio !== criterio) {
        mudancas.push({
          id: doc.id,
          iata: a.iata,
          de: a.regiao ?? '(sem região)',
          para: regiao,
          criterio,
        })
      }
    }

    for (const [criterio, iatas] of [...porCriterio.entries()].sort()) {
      console.log(`  por ${criterio}: ${iatas.length} — ${iatas.sort().join(' ')}`)
    }

    // A classificação por coordenada é a frágil: caixas retangulares sobre um
    // mundo que não é retangular. Ela aparece destacada para ser revisada.
    const porCoordenada = porCriterio.get('coordenada') ?? []
    if (porCoordenada.length > 0) {
      console.log(
        `\n  ${porCoordenada.length} aeroporto(s) classificados por coordenada, ` +
          'sem uf informado. Confira estes na tela de Método.',
      )
    }
    const indefinidos = porCriterio.get('indefinida') ?? []
    if (indefinidos.length > 0) {
      console.log(`  ATENÇÃO: sem região: ${indefinidos.join(' ')}`)
    }

    if (mudancas.length === 0) {
      console.log('\n  Nenhuma mudança: todos já estão classificados como a regra manda.')
      return
    }

    console.log(`\n  ${mudancas.length} mudança(s):`)
    for (const m of mudancas) {
      console.log(`    ${m.iata}: ${m.de} -> ${m.para} (por ${m.criterio})`)
    }

    if (!gravar) {
      console.log('\n  Simulação: nada foi gravado. Rode de novo com --gravar.')
      return
    }

    const lote = db.batch()
    for (const m of mudancas) {
      lote.set(
        db.collection(COLECAO.aeroporto).doc(m.id),
        { regiao: m.para, regiaoCriterio: m.criterio },
        { merge: true },
      )
    }
    await lote.commit()
    console.log(`\n  ${mudancas.length} aeroporto(s) atualizados.`)
  } finally {
    await encerrar()
  }
}

if (ehEntrada(import.meta.url)) {
  void executar('classificar-aeroportos', principal)
}

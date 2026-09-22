import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

import type { NextConfig } from 'next'

/**
 * Origens que podem alcançar os recursos de desenvolvimento do Next.
 *
 * **Vem do ambiente, não do código, e o motivo não é só higiene.** É um valor
 * de máquina — o IP da rede local de quem está desenvolvendo —, e IP de máquina
 * versionado é o mesmo erro de classe da coordenada da fábrica (§2.1): entra
 * como constante, segue no repositório público e deixa de valer no dia em que
 * o roteador entrega outro endereço.
 *
 * **Para que serve.** Abrir o sistema pelo IP da máquina, em vez de por
 * `localhost`, é o que permite testar num celular de verdade — e é a única
 * forma de conferir o comportamento que emulação de dispositivo não reproduz.
 * Sem esta lista o Next recusa servir `/_next/*` para essa origem, **o
 * JavaScript não carrega, a página não hidrata e toda a tela vira HTML inerte**:
 * botão que não responde, sem erro em lugar nenhum. O sintoma não se parece nada
 * com a causa, e foi exatamente assim que ele apareceu.
 *
 * Vale **só em desenvolvimento** — o Next ignora isto em produção, onde não há
 * recurso de desenvolvimento a servir.
 */
const origensDeDesenvolvimento = (process.env.DEV_ORIGENS_PERMITIDAS ?? '')
  .split(',')
  .map((origem) => origem.trim())
  .filter((origem) => origem !== '')

/**
 * **O build roda com webpack, não com Turbopack, e o motivo está aqui porque
 * `package.json` não aceita comentário** — a flag `--webpack` vive no script
 * `build` de lá, e flag sem motivo escrito é flag que alguém remove achando
 * que está modernizando.
 *
 * **O que acontece com Turbopack.** `firebase-admin` está na lista de externos
 * padrão do Next, então ele não é empacotado. O Turbopack o registra sob um
 * alias próprio — `firebase-admin-<hash>/auth` —, resolve o pacote pela
 * condição `import` do `exports` map, que aponta para `lib/esm`, e o runtime o
 * carrega com `require()`. Resolver por uma condição e carregar por outra dá
 * `ERR_REQUIRE_ESM`, e **toda página que toca o Firestore devolve 500**.
 *
 * Com webpack a referência é `import("firebase-admin/auth")`: nome real do
 * pacote, e carregamento coerente com a resolução.
 *
 * **Isto não aparece em `tsc`, em teste nem no próprio build** — os três
 * passam. Todas as páginas são dinâmicas, então o build compila sem renderizar
 * (§14), e o erro só existe quando alguém pede a página. Foi assim que ele
 * chegou à produção em 22/09 e não a nenhuma verificação anterior.
 *
 * Quando o Turbopack passar a carregar externo dual de forma coerente, a flag
 * pode sair — conferindo no build que a referência deixou de ser o alias com
 * hash, e depois **abrindo uma página de verdade**, que é a única prova.
 */
const nextConfig: NextConfig = {
  // Nenhum dado de base entra no bundle do cliente (CLAUDE.md §11.2):
  // toda leitura acontece em Server Component ou Route Handler.

  // A raiz é fixada aqui porque existe um lockfile em diretório acima; sem
  // isso o build pode inferir a raiz errada.
  turbopack: {
    root: dirname(fileURLToPath(import.meta.url)),
  },

  ...(origensDeDesenvolvimento.length > 0
    ? { allowedDevOrigins: origensDeDesenvolvimento }
    : {}),
}

export default nextConfig

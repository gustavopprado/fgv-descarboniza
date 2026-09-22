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

import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Nenhum dado de base entra no bundle do cliente (CLAUDE.md §11.2):
  // toda leitura acontece em Server Component ou Route Handler.

  // A raiz é fixada aqui porque existe um lockfile em diretório acima; sem
  // isso o build pode inferir a raiz errada.
  turbopack: {
    root: dirname(fileURLToPath(import.meta.url)),
  },
}

export default nextConfig

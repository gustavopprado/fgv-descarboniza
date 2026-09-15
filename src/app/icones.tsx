/**
 * Ícones do menu — os mesmos traços do protótipo.
 *
 * Desenho geométrico simples, em `currentColor`, herdando a cor do item de
 * menu. Ficam na camada de interface de propósito: o módulo de navegação
 * (`src/server/consultas/navegacao.ts`) decide **o que** cada perfil pode
 * abrir, e não deve saber como isso é desenhado.
 */
type Props = { className?: string }

const COMUM = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

function VisaoGeral({ className }: Props) {
  return (
    <svg {...COMUM} className={className}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  )
}

function Mobilidade({ className }: Props) {
  return (
    <svg {...COMUM} className={className}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    </svg>
  )
}

function Aviao({ className }: Props) {
  return (
    <svg {...COMUM} className={className}>
      <path d="M3 15l7-2 4-9 2 1-2 7 5-1.5 1-2.5 1.5.5-1 4 1 4-1.5.5-1-2.5-5-1.5 2 7-2 1-4-9-7-2z" />
    </svg>
  )
}

function Navio({ className }: Props) {
  return (
    <svg {...COMUM} className={className}>
      <path d="M3 18c1.5 1.3 3 1.3 4.5 0S10.5 16.7 12 18s3 1.3 4.5 0 3-1.3 4.5 0" />
      <path d="M5 14V8h14v6" />
      <path d="M12 8V4" />
    </svg>
  )
}

function Metodo({ className }: Props) {
  return (
    <svg {...COMUM} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8.5h.01" />
    </svg>
  )
}

function Mais({ className }: Props) {
  return (
    <svg {...COMUM} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function Lista({ className }: Props) {
  return (
    <svg {...COMUM} className={className}>
      <path d="M4 5h16M4 12h16M4 19h10" />
    </svg>
  )
}

/** Ícone de cada rota do menu. Rota sem ícone cai na lista. */
const POR_ROTA: Record<string, (props: Props) => React.ReactElement> = {
  '/': VisaoGeral,
  '/mobilidade': Mobilidade,
  '/viagens': Aviao,
  '/maritimo': Navio,
  '/metodo': Metodo,
  '/programa/registrar': Mais,
  '/programa/emissoes': Lista,
  '/programa/minhas-viagens': Lista,
}

export function IconeDaRota({
  href,
  className,
}: {
  href: string
  className?: string
}) {
  const Icone = POR_ROTA[href] ?? Lista
  return <Icone className={className} />
}

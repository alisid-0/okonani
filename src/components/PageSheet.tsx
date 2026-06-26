import type { ReactNode } from 'react'

type PageSheetProps = {
  children: ReactNode
  className?: string
}

export default function PageSheet({ children, className = '' }: PageSheetProps) {
  return <div className={`page-sheet${className ? ` ${className}` : ''}`}>{children}</div>
}

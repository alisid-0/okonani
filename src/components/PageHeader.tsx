import type { ReactNode } from 'react'
import { ReadableNumbers } from '../lib/readableNumbers'

type PageHeaderProps = {
  title: string
  subtitle?: ReactNode
}

export default function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-inner">
        <h1>{title}</h1>
        {subtitle && (
          <p className="page-header-lead">
            {typeof subtitle === 'string' ? <ReadableNumbers text={subtitle} /> : subtitle}
          </p>
        )}
      </div>
    </header>
  )
}

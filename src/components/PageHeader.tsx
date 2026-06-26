type PageHeaderProps = {
  title: string
  subtitle?: string
}

export default function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-inner">
        <span className="page-header-star" aria-hidden="true">
          ✦
        </span>
        <h1>{title}</h1>
        {subtitle && <p className="page-header-lead">{subtitle}</p>}
      </div>
    </header>
  )
}

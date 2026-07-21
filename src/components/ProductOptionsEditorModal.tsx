import { useEffect, useState } from 'react'
import AdminModal from './AdminModal'
import ProductOptionsEditor from './ProductOptionsEditor'
import type { ProductOptionGroup } from '../data/productOptions'

type ProductOptionsEditorModalProps = {
  open: boolean
  title?: string
  description?: string
  groups: ProductOptionGroup[]
  uploadKey?: string
  onClose: () => void
  onSave: (groups: ProductOptionGroup[]) => void
}

export default function ProductOptionsEditorModal({
  open,
  title = 'Edit options',
  description = 'Name each option type and add choices. Choices can include an image shoppers see when selecting.',
  groups,
  uploadKey,
  onClose,
  onSave,
}: ProductOptionsEditorModalProps) {
  const [draft, setDraft] = useState<ProductOptionGroup[]>(groups)

  useEffect(() => {
    if (open) {
      setDraft(
        groups.map((group) => ({
          ...group,
          choices: group.choices.map((choice) => ({ ...choice })),
        })),
      )
    }
  }, [open, groups])

  return (
    <AdminModal
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onSave(draft)
              onClose()
            }}
          >
            Done
          </button>
        </>
      }
    >
      <ProductOptionsEditor groups={draft} onChange={setDraft} uploadKey={uploadKey} />
    </AdminModal>
  )
}

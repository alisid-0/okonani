import { useEffect, useState } from 'react'
import AdminModal from './AdminModal'
import ProductOptionsEditor from './ProductOptionsEditor'
import type { ProductOptionGroup } from '../data/productOptions'
import type { ProductMedia } from '../data/products'
import { playUiSound, uiClick } from '../lib/uiSounds'

type ProductOptionsEditorModalProps = {
  open: boolean
  title?: string
  description?: string
  groups: ProductOptionGroup[]
  uploadKey?: string
  productMedia?: ProductMedia[]
  onClose: () => void
  onSave: (groups: ProductOptionGroup[]) => void
}

export default function ProductOptionsEditorModal({
  open,
  title = 'Edit options',
  description = 'Edit option types and choices. Tile image, gallery jump, and visibility are independent.',
  groups,
  uploadKey,
  productMedia,
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
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              uiClick('soft')
              onClose()
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onSave(draft)
              onClose()
              playUiSound('success')
            }}
          >
            Done
          </button>
        </>
      }
    >
      <ProductOptionsEditor
        groups={draft}
        onChange={setDraft}
        uploadKey={uploadKey}
        productMedia={productMedia}
      />
    </AdminModal>
  )
}

import { useEffect, useMemo, useState } from 'react'
import AdminModal from './AdminModal'
import ProductGallery from './ProductGallery'
import ProductOptionTiles from './ProductOptionTiles'
import {
  buildSelectedOptions,
  filterShopperOptionGroups,
  formatSelectedOptions,
  unitPriceWithOptions,
  validateSelectedOptions,
  type ProductOptionChoice,
  type ProductOptionGroup,
  type SelectedProductOption,
} from '../data/productOptions'
import { indexOfMediaId, type Product } from '../data/products'
import { Price } from '../lib/readableNumbers'
import { playUiSound, uiClick } from '../lib/uiSounds'

type ProductShopperPreviewModalProps = {
  open: boolean
  onClose: () => void
  productName: string
  basePriceCents: number
  description?: string
  media?: Product['media']
  groups: ProductOptionGroup[]
}

export default function ProductShopperPreviewModal({
  open,
  onClose,
  productName,
  basePriceCents,
  description,
  media = [],
  groups,
}: ProductShopperPreviewModalProps) {
  const shopperGroups = useMemo(() => filterShopperOptionGroups(groups), [groups])
  const [selectedByGroupId, setSelectedByGroupId] = useState<Record<string, string>>({})
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [addedNote, setAddedNote] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSelectedByGroupId({})
    setGalleryIndex(0)
    setError(null)
    setAddedNote(null)
  }, [open, groups])

  const selected = buildSelectedOptions(shopperGroups, selectedByGroupId)
  const totalCents = unitPriceWithOptions(basePriceCents, selected)
  const selectedLabel = formatSelectedOptions(selected)

  function selectChoice(groupId: string, choiceId: string, choice: ProductOptionChoice) {
    setSelectedByGroupId((prev) => ({ ...prev, [groupId]: choiceId }))
    setError(null)
    setAddedNote(null)
    const linkedIndex = indexOfMediaId(media, choice.linkedMediaId)
    if (linkedIndex >= 0) setGalleryIndex(linkedIndex)
  }

  function handlePreviewAdd() {
    const validationError = validateSelectedOptions(shopperGroups, selectedByGroupId)
    if (validationError) {
      setError(validationError)
      setAddedNote(null)
      playUiSound('soft')
      return
    }
    playUiSound('add')
    setAddedNote(
      shopperGroups.length === 0
        ? 'Preview only — in the real shop this would add the item to the cart.'
        : `Preview only — would add with: ${selectedLabel || 'no options'}.`,
    )
  }

  return (
    <AdminModal
      open={open}
      title="Shopper preview"
      description="Same layout as the product page: gallery beside options. Selecting a linked choice jumps the gallery. Nothing is added to a real cart."
      onClose={onClose}
      wide
      preview
      footer={
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            uiClick('soft')
            onClose()
          }}
        >
          Close preview
        </button>
      }
    >
      <div className="admin-shopper-preview">
        <aside className="admin-shopper-preview-media">
          {media.some((item) => item.url.trim()) ?
            <ProductGallery
              media={media}
              productName={productName || 'Product'}
              activeIndex={galleryIndex}
              onActiveIndexChange={setGalleryIndex}
            />
          : <div className="admin-shopper-preview-image is-placeholder" aria-hidden />}
        </aside>

        <div className="admin-shopper-preview-copy">
          <p className="admin-shopper-preview-eyebrow">What shoppers see</p>
          <h3>{productName || 'Untitled product'}</h3>
          {description?.trim() && <p className="admin-shopper-preview-lead">{description.trim()}</p>}
          <p className="admin-shopper-preview-price">
            <Price cents={totalCents} />
          </p>

          {shopperGroups.length === 0 ?
            <p className="admin-field-hint">
              No active options for shoppers on this product. Turn option types/choices On, or add
              some, to preview the picker.
            </p>
          : (
            <div className="admin-shopper-preview-options">
              <p className="admin-field-hint">
                Click a tile to select it — same interaction as the storefront.
              </p>
              <ProductOptionTiles
                groups={shopperGroups}
                selectedByGroupId={selectedByGroupId}
                onSelect={selectChoice}
              />
            </div>
          )}

          {error && <p className="form-error">{error}</p>}
          {addedNote && <p className="form-success">{addedNote}</p>}

          <button type="button" className="btn btn-primary" onClick={handlePreviewAdd}>
            Add to cart (preview)
          </button>
        </div>
      </div>
    </AdminModal>
  )
}

export type { SelectedProductOption, ProductOptionGroup }

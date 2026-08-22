import {
  type ProductOptionChoice,
  type ProductOptionGroup,
} from '../data/productOptions'
import { formatPrice } from '../data/products'
import { uiClick } from '../lib/uiSounds'

type ProductOptionTilesProps = {
  groups: ProductOptionGroup[]
  selectedByGroupId: Record<string, string>
  onSelect: (groupId: string, choiceId: string, choice: ProductOptionChoice) => void
}

function tileShowsImage(choice: ProductOptionChoice): boolean {
  return Boolean(choice.imageUrl.trim()) && choice.hideImageInOptions !== true
}

export default function ProductOptionTiles({
  groups,
  selectedByGroupId,
  onSelect,
}: ProductOptionTilesProps) {
  return (
    <div className="product-option-tiles-stack">
      {groups.map((group) => (
        <fieldset key={group.id} className="product-option-group">
          <legend>
            {group.name}
            {group.required ? '' : ' (optional)'}
          </legend>
          <div
            className="product-option-choices product-option-choices-tiles"
            role="radiogroup"
            aria-label={group.name}
          >
            {group.choices.map((choice) => {
              const checked = selectedByGroupId[group.id] === choice.id
              const showImage = tileShowsImage(choice)
              return (
                <button
                  key={choice.id}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  className={`product-option-tile ${checked ? 'is-selected' : ''} ${showImage ? 'has-image' : ''}`}
                  onClick={() => {
                    uiClick('tap')
                    onSelect(group.id, choice.id, choice)
                  }}
                >
                  {showImage ?
                    <img
                      src={choice.imageUrl}
                      alt=""
                      className="product-option-tile-image"
                      draggable={false}
                      onContextMenu={(event) => event.preventDefault()}
                    />
                  : null}
                  <span className="product-option-tile-copy">
                    <span className="product-option-tile-label">{choice.label}</span>
                    {choice.priceDeltaCents !== 0 && (
                      <span className="product-option-delta">
                        {choice.priceDeltaCents > 0 ? '+' : ''}
                        {formatPrice(choice.priceDeltaCents)}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </fieldset>
      ))}
    </div>
  )
}

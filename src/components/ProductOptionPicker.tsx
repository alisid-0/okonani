import type { ProductOptionGroup } from '../data/productOptions'
import { formatPrice } from '../data/products'

type ProductOptionPickerProps = {
  groups: ProductOptionGroup[]
  selectedByGroupId: Record<string, string>
  onChange: (selectedByGroupId: Record<string, string>) => void
}

export default function ProductOptionPicker({
  groups,
  selectedByGroupId,
  onChange,
}: ProductOptionPickerProps) {
  if (groups.length === 0) return null

  return (
    <div className="product-option-picker">
      {groups.map((group) => (
        <fieldset key={group.id} className="product-option-group">
          <legend>
            {group.name}
            {group.required ? '' : ' (optional)'}
          </legend>
          <div className="product-option-choices" role="radiogroup" aria-label={group.name}>
            {group.choices.map((choice) => {
              const checked = selectedByGroupId[group.id] === choice.id
              return (
                <label
                  key={choice.id}
                  className={`product-option-choice ${checked ? 'is-selected' : ''}`}
                >
                  <input
                    type="radio"
                    name={`option-${group.id}`}
                    value={choice.id}
                    checked={checked}
                    onChange={() =>
                      onChange({
                        ...selectedByGroupId,
                        [group.id]: choice.id,
                      })
                    }
                  />
                  <span>{choice.label}</span>
                  {choice.priceDeltaCents !== 0 && (
                    <span className="product-option-delta">
                      {choice.priceDeltaCents > 0 ? '+' : ''}
                      {formatPrice(choice.priceDeltaCents)}
                    </span>
                  )}
                </label>
              )
            })}
          </div>
        </fieldset>
      ))}
    </div>
  )
}

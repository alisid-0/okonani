import { type ChangeEvent, useState } from 'react'
import {
  emptyOptionChoice,
  emptyOptionGroup,
  type ProductOptionGroup,
} from '../data/productOptions'
import { formatPrice } from '../data/products'
import { uploadProductImages } from '../lib/storageUpload'

type ProductOptionsEditorProps = {
  groups: ProductOptionGroup[]
  onChange: (groups: ProductOptionGroup[]) => void
  disabled?: boolean
  /** Storage folder key for option choice images */
  uploadKey?: string
}

export default function ProductOptionsEditor({
  groups,
  onChange,
  disabled = false,
  uploadKey = '_option-images',
}: ProductOptionsEditorProps) {
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  function updateGroup(index: number, patch: Partial<ProductOptionGroup>) {
    onChange(groups.map((group, i) => (i === index ? { ...group, ...patch } : group)))
  }

  function updateChoice(
    groupIndex: number,
    choiceIndex: number,
    patch: Partial<ProductOptionGroup['choices'][number]>,
  ) {
    onChange(
      groups.map((group, i) => {
        if (i !== groupIndex) return group
        return {
          ...group,
          choices: group.choices.map((choice, j) =>
            j === choiceIndex ? { ...choice, ...patch } : choice,
          ),
        }
      }),
    )
  }

  async function handleUploadImage(
    groupIndex: number,
    choiceIndex: number,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const key = `${groupIndex}-${choiceIndex}`
    setUploadingKey(key)
    setUploadError(null)
    try {
      const group = groups[groupIndex]
      const choice = group?.choices[choiceIndex]
      const uploaded = await uploadProductImages(
        `${uploadKey}/${group?.id || 'group'}/${choice?.id || 'choice'}`,
        [file],
      )
      const url = uploaded[0]?.url
      if (!url) throw new Error('Upload did not return an image URL')
      updateChoice(groupIndex, choiceIndex, { imageUrl: url })
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not upload image')
    } finally {
      setUploadingKey(null)
    }
  }

  return (
    <div className="admin-options-editor">
      {groups.length === 0 && (
        <p className="admin-field-hint">
          No option types yet. Add named types like Color or Pair with, then list the choices
          shoppers can pick — optionally with an image for each choice.
        </p>
      )}

      {uploadError && <p className="admin-alert admin-alert-error">{uploadError}</p>}

      {groups.map((group, groupIndex) => (
        <div key={group.id} className="admin-option-group">
          <div className="admin-option-group-header">
            <label className="admin-option-type-name">
              Option type name
              <input
                value={group.name}
                onChange={(e) => updateGroup(groupIndex, { name: e.target.value })}
                placeholder="e.g. Color, Pair with, Size"
                disabled={disabled}
                required
              />
            </label>
            <label className="admin-toggle">
              <input
                type="checkbox"
                checked={group.required}
                onChange={(e) => updateGroup(groupIndex, { required: e.target.checked })}
                disabled={disabled}
              />
              <span>Required</span>
            </label>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={disabled}
              onClick={() => onChange(groups.filter((_, i) => i !== groupIndex))}
            >
              Remove type
            </button>
          </div>

          <p className="admin-field-hint">Choices for “{group.name.trim() || 'this option type'}”</p>

          <ul className="admin-option-choices">
            {group.choices.map((choice, choiceIndex) => {
              const uploadId = `${groupIndex}-${choiceIndex}`
              return (
                <li key={choice.id} className="admin-option-choice-row">
                  <div className="admin-option-choice-image">
                    {choice.imageUrl ?
                      <img src={choice.imageUrl} alt="" />
                    : <div className="admin-option-choice-image-empty" aria-hidden />}
                    <div className="admin-option-choice-image-actions">
                      <label className="btn btn-ghost btn-sm admin-home-upload-btn">
                        {uploadingKey === uploadId ? 'Uploading…' : choice.imageUrl ? 'Replace' : 'Image'}
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          disabled={disabled || uploadingKey === uploadId}
                          onChange={(e) => void handleUploadImage(groupIndex, choiceIndex, e)}
                        />
                      </label>
                      {choice.imageUrl && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={disabled}
                          onClick={() => updateChoice(groupIndex, choiceIndex, { imageUrl: '' })}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>

                  <label>
                    Choice
                    <input
                      value={choice.label}
                      onChange={(e) =>
                        updateChoice(groupIndex, choiceIndex, { label: e.target.value })
                      }
                      placeholder="e.g. Red, Gold charm"
                      disabled={disabled}
                      required
                    />
                  </label>
                  <label>
                    Extra $
                    <input
                      type="number"
                      step="0.01"
                      value={(choice.priceDeltaCents / 100).toFixed(2)}
                      onChange={(e) => {
                        const dollars = Number.parseFloat(e.target.value)
                        updateChoice(groupIndex, choiceIndex, {
                          priceDeltaCents: Number.isFinite(dollars) ? Math.round(dollars * 100) : 0,
                        })
                      }}
                      disabled={disabled}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={disabled || group.choices.length <= 1}
                    onClick={() =>
                      updateGroup(groupIndex, {
                        choices: group.choices.filter((_, i) => i !== choiceIndex),
                      })
                    }
                  >
                    Remove
                  </button>
                </li>
              )
            })}
          </ul>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={disabled}
            onClick={() =>
              updateGroup(groupIndex, { choices: [...group.choices, emptyOptionChoice()] })
            }
          >
            Add choice
          </button>
        </div>
      ))}

      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={disabled}
        onClick={() => onChange([...groups, emptyOptionGroup()])}
      >
        Add option type
      </button>

      {groups.some((group) => group.choices.some((choice) => choice.priceDeltaCents !== 0)) && (
        <p className="admin-field-hint">
          Extra amounts are added to the product price in cart (e.g. +
          {formatPrice(
            groups.flatMap((g) => g.choices).find((c) => c.priceDeltaCents !== 0)?.priceDeltaCents ??
              0,
          )}
          ).
        </p>
      )}
    </div>
  )
}

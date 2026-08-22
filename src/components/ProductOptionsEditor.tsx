import { type ChangeEvent, useState } from 'react'
import {
  emptyOptionChoice,
  emptyOptionGroup,
  type ProductOptionGroup,
} from '../data/productOptions'
import type { ProductMedia } from '../data/products'
import { uploadProductImages } from '../lib/storageUpload'
import { playUiSound, uiClick } from '../lib/uiSounds'

type ProductOptionsEditorProps = {
  groups: ProductOptionGroup[]
  onChange: (groups: ProductOptionGroup[]) => void
  disabled?: boolean
  uploadKey?: string
  /** When provided (product editor), choices can pick/link product gallery photos. */
  productMedia?: ProductMedia[]
}

export default function ProductOptionsEditor({
  groups,
  onChange,
  disabled = false,
  uploadKey = '_option-images',
  productMedia,
}: ProductOptionsEditorProps) {
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const galleryImages = (productMedia ?? []).filter(
    (item) => item.type === 'image' && item.url.trim() && item.id,
  )

  function updateGroup(index: number, patch: Partial<ProductOptionGroup>) {
    onChange(groups.map((group, i) => (i === index ? { ...group, ...patch } : group)))
  }

  function updateChoice(
    groupIndex: number,
    choiceIndex: number,
    patch: Partial<ProductOptionGroup['choices'][number]> & { linkedMediaId?: string | undefined },
  ) {
    onChange(
      groups.map((group, i) => {
        if (i !== groupIndex) return group
        return {
          ...group,
          choices: group.choices.map((choice, j) => {
            if (j !== choiceIndex) return choice
            const next = { ...choice, ...patch }
            if ('linkedMediaId' in patch && !patch.linkedMediaId) {
              delete next.linkedMediaId
            }
            return next
          }),
        }
      }),
    )
  }

  function removeGroup(groupIndex: number) {
    onChange(groups.filter((_, i) => i !== groupIndex))
  }

  function removeChoice(groupIndex: number, choiceIndex: number) {
    const group = groups[groupIndex]
    if (!group) return
    const nextChoices = group.choices.filter((_, i) => i !== choiceIndex)
    if (nextChoices.length === 0) {
      removeGroup(groupIndex)
      return
    }
    updateGroup(groupIndex, { choices: nextChoices })
  }

  /** Convenience: use a product photo as tile + gallery link (either can be cleared later). */
  function assignProductPhoto(
    groupIndex: number,
    choiceIndex: number,
    media: ProductMedia,
  ) {
    updateChoice(groupIndex, choiceIndex, {
      imageUrl: media.url,
      linkedMediaId: media.id,
    })
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
      playUiSound('success')
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not upload image')
      playUiSound('soft')
    } finally {
      setUploadingKey(null)
    }
  }

  return (
    <div className="admin-options-editor">
      <div className="admin-options-help">
        <p>
          <strong>Option types</strong> are groups shoppers pick from (Color, Pair with, …). Each
          type has <strong>choices</strong> shown as tappable tiles beside the product gallery.
        </p>
        <p>
          Tile image and gallery jump are independent: upload or pick a product photo for the tile,
          optionally link a (possibly different) gallery photo on select, and hide the tile image if
          the gallery jump is enough.
        </p>
      </div>

      {groups.length === 0 && (
        <p className="admin-options-empty">No option types yet. Add one below to get started.</p>
      )}

      {uploadError && <p className="admin-alert admin-alert-error">{uploadError}</p>}

      {groups.map((group, groupIndex) => {
        const groupOn = group.active !== false
        return (
          <section
            key={group.id}
            className={`admin-option-group ${groupOn ? '' : 'is-disabled'}`.trim()}
          >
            <header className="admin-option-group-top">
              <label className="admin-option-field admin-option-field-grow">
                <span className="admin-option-label">Option type name</span>
                <input
                  value={group.name}
                  onChange={(e) => updateGroup(groupIndex, { name: e.target.value })}
                  placeholder="e.g. Color"
                  disabled={disabled}
                  required
                />
              </label>

              <div className="admin-option-group-controls">
                <label className="admin-option-check">
                  <input
                    type="checkbox"
                    checked={group.required}
                    onChange={(e) => updateGroup(groupIndex, { required: e.target.checked })}
                    disabled={disabled}
                  />
                  Required
                </label>
                <label className="admin-option-check">
                  <input
                    type="checkbox"
                    checked={groupOn}
                    onChange={(e) => updateGroup(groupIndex, { active: e.target.checked })}
                    disabled={disabled}
                  />
                  Visible in shop
                </label>
                <button
                  type="button"
                  className="admin-option-text-btn is-danger"
                  disabled={disabled}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete option type “${group.name.trim() || 'Untitled'}” and all its choices?`,
                      )
                    ) {
                      uiClick('soft')
                      removeGroup(groupIndex)
                    }
                  }}
                >
                  Delete type
                </button>
              </div>
            </header>

            {!groupOn && (
              <p className="admin-option-banner">Hidden from shoppers (still editable here).</p>
            )}

            <ul className="admin-option-choices">
              {group.choices.map((choice, choiceIndex) => {
                const uploadId = `${groupIndex}-${choiceIndex}`
                const choiceOn = choice.active !== false
                const dollars = (choice.priceDeltaCents / 100).toFixed(2)
                const linkedMedia = galleryImages.find((item) => item.id === choice.linkedMediaId)

                return (
                  <li
                    key={choice.id}
                    className={`admin-option-choice ${choiceOn ? '' : 'is-disabled'}`.trim()}
                  >
                    <div className="admin-option-choice-thumb">
                      {choice.imageUrl && !choice.hideImageInOptions ?
                        <img src={choice.imageUrl} alt="" />
                      : choice.imageUrl && choice.hideImageInOptions ?
                        <div className="admin-option-choice-thumb-empty">Hidden on tiles</div>
                      : <div className="admin-option-choice-thumb-empty">No image</div>}
                    </div>

                    <div className="admin-option-choice-main">
                      <div className="admin-option-choice-grid">
                        <label className="admin-option-field">
                          <span className="admin-option-label">Choice label</span>
                          <input
                            value={choice.label}
                            onChange={(e) =>
                              updateChoice(groupIndex, choiceIndex, { label: e.target.value })
                            }
                            placeholder="e.g. Pink"
                            disabled={disabled}
                            required
                          />
                        </label>

                        <label className="admin-option-field admin-option-field-price">
                          <span className="admin-option-label">Extra price ($)</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={dollars}
                            onChange={(e) => {
                              const raw = e.target.value.trim()
                              const dollarsValue = Number.parseFloat(raw)
                              updateChoice(groupIndex, choiceIndex, {
                                priceDeltaCents: Number.isFinite(dollarsValue)
                                  ? Math.round(dollarsValue * 100)
                                  : 0,
                              })
                            }}
                            disabled={disabled}
                          />
                        </label>
                      </div>

                      <div className="admin-option-choice-toolbar">
                        <label className="admin-option-check">
                          <input
                            type="checkbox"
                            checked={choiceOn}
                            onChange={(e) =>
                              updateChoice(groupIndex, choiceIndex, { active: e.target.checked })
                            }
                            disabled={disabled}
                          />
                          Visible in shop
                        </label>

                        <label className="admin-option-check">
                          <input
                            type="checkbox"
                            checked={choice.hideImageInOptions === true}
                            onChange={(e) =>
                              updateChoice(groupIndex, choiceIndex, {
                                hideImageInOptions: e.target.checked,
                              })
                            }
                            disabled={disabled}
                          />
                          Hide image from options section
                        </label>

                        <label className="admin-option-text-btn">
                          {uploadingKey === uploadId ?
                            'Uploading…'
                          : choice.imageUrl ?
                            'Upload different image'
                          : 'Upload image'}
                          <input
                            type="file"
                            accept="image/*"
                            hidden
                            disabled={disabled || uploadingKey === uploadId}
                            onChange={(e) => void handleUploadImage(groupIndex, choiceIndex, e)}
                          />
                        </label>

                        {choice.imageUrl ?
                          <button
                            type="button"
                            className="admin-option-text-btn"
                            disabled={disabled}
                            onClick={() => {
                              uiClick('soft')
                              updateChoice(groupIndex, choiceIndex, { imageUrl: '' })
                            }}
                          >
                            Clear tile image
                          </button>
                        : null}

                        <button
                          type="button"
                          className="admin-option-text-btn is-danger"
                          disabled={disabled}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete choice “${choice.label.trim() || 'Untitled'}”?`,
                              )
                            ) {
                              uiClick('soft')
                              removeChoice(groupIndex, choiceIndex)
                            }
                          }}
                        >
                          Delete choice
                        </button>
                      </div>

                      {galleryImages.length > 0 && (
                        <div className="admin-option-media-tools">
                          <div className="admin-option-media-block">
                            <p className="admin-option-label">
                              Product photos — click to use as tile + gallery jump
                            </p>
                            <div className="admin-option-media-strip" role="list">
                              {galleryImages.map((media) => {
                                const isTile = choice.imageUrl === media.url
                                const isLinked = choice.linkedMediaId === media.id
                                return (
                                  <button
                                    key={media.id}
                                    type="button"
                                    role="listitem"
                                    className={`admin-option-media-thumb ${isTile || isLinked ? 'is-active' : ''}`}
                                    disabled={disabled}
                                    title="Use as tile image and gallery jump"
                                    onClick={() => {
                                      uiClick('soft')
                                      assignProductPhoto(groupIndex, choiceIndex, media)
                                    }}
                                  >
                                    <img src={media.url} alt="" />
                                    {(isTile || isLinked) && (
                                      <span className="admin-option-media-badge">
                                        {isTile && isLinked ? 'Both' : isTile ? 'Tile' : 'Jump'}
                                      </span>
                                    )}
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          <div className="admin-option-media-block">
                            <p className="admin-option-label">
                              Gallery jump only (can differ from tile)
                              {linkedMedia ? ` · linked` : ' · none'}
                            </p>
                            <div className="admin-option-media-strip" role="list">
                              {galleryImages.map((media) => {
                                const isLinked = choice.linkedMediaId === media.id
                                return (
                                  <button
                                    key={`link-${media.id}`}
                                    type="button"
                                    role="listitem"
                                    className={`admin-option-media-thumb ${isLinked ? 'is-linked' : ''}`}
                                    disabled={disabled}
                                    title="Jump gallery to this photo when selected"
                                    onClick={() => {
                                      uiClick('soft')
                                      updateChoice(groupIndex, choiceIndex, {
                                        linkedMediaId: isLinked ? undefined : media.id,
                                      })
                                    }}
                                  >
                                    <img src={media.url} alt="" />
                                  </button>
                                )
                              })}
                            </div>
                            {choice.linkedMediaId ?
                              <button
                                type="button"
                                className="admin-option-text-btn"
                                disabled={disabled}
                                onClick={() => {
                                  uiClick('soft')
                                  updateChoice(groupIndex, choiceIndex, {
                                    linkedMediaId: undefined,
                                  })
                                }}
                              >
                                Clear gallery jump
                              </button>
                            : null}
                          </div>

                          <div className="admin-option-media-block">
                            <p className="admin-option-label">Tile image only (no gallery jump)</p>
                            <div className="admin-option-media-strip" role="list">
                              {galleryImages.map((media) => {
                                const isTile = choice.imageUrl === media.url
                                return (
                                  <button
                                    key={`tile-${media.id}`}
                                    type="button"
                                    role="listitem"
                                    className={`admin-option-media-thumb ${isTile ? 'is-tile' : ''}`}
                                    disabled={disabled}
                                    title="Use as tile image only"
                                    onClick={() => {
                                      uiClick('soft')
                                      updateChoice(groupIndex, choiceIndex, {
                                        imageUrl: media.url,
                                      })
                                    }}
                                  >
                                    <img src={media.url} alt="" />
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>

            <button
              type="button"
              className="admin-option-secondary-btn"
              disabled={disabled}
              onClick={() => {
                uiClick('soft')
                updateGroup(groupIndex, { choices: [...group.choices, emptyOptionChoice()] })
              }}
            >
              + Add choice
            </button>
          </section>
        )
      })}

      <button
        type="button"
        className="admin-option-secondary-btn"
        disabled={disabled}
        onClick={() => {
          uiClick('tap')
          onChange([...groups, emptyOptionGroup()])
        }}
      >
        + Add option type
      </button>
    </div>
  )
}

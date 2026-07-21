import { type ImgHTMLAttributes, type SyntheticEvent } from 'react'

type ProtectedImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  /** Extra class for the wrapping span (blocks some drag/save gestures). */
  wrapClassName?: string
}

function blockContextMenu(event: SyntheticEvent) {
  event.preventDefault()
}

/**
 * Soft art protection: blocks right-click save and drag-to-desktop on storefront images.
 * Not DRM — determined users can still capture pixels another way.
 */
export default function ProtectedImage({
  wrapClassName,
  className,
  alt = '',
  draggable = false,
  onContextMenu,
  ...rest
}: ProtectedImageProps) {
  return (
    <span
      className={`protected-media ${wrapClassName ?? ''}`.trim()}
      onContextMenu={blockContextMenu}
    >
      <img
        {...rest}
        alt={alt}
        className={`protected-media-img ${className ?? ''}`.trim()}
        draggable={draggable}
        onContextMenu={(event) => {
          blockContextMenu(event)
          onContextMenu?.(event)
        }}
      />
    </span>
  )
}

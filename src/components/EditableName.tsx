type Variant = 'participant' | 'slot' | 'focus';

type Props = {
  value: string;
  onChange: (next: string) => void;
  variant: Variant;
  ariaLabel?: string;
};

/**
 * A borderless text input that shows its editable affordance on hover and
 * focus. Used for participant names in the setup list, match cards, and the
 * present/focus overlay.
 */
export function EditableName({ value, onChange, variant, ariaLabel }: Props) {
  return (
    <input
      type="text"
      className={`editable-name editable-name--${variant}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel ?? 'Edit name'}
    />
  );
}

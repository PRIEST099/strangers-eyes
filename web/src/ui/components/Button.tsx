// web/src/ui/components/Button.tsx: buttons and button-styled links. Every target is at least 44×44 px
// (min-h-11 min-w-11) and shows the global focus ring (index.css :focus-visible).
// Horizontal padding comes only from `size`, never from BASE: Tailwind orders utilities by its own rules, not by
// their order in `className`, so a `px-*` passed in `className` would not reliably beat a `px-*` in BASE.
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, Ref } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
/** md: text buttons · compact: tight text buttons (header) · icon: icon-only, exactly 44×44 px. */
export type ButtonSize = 'md' | 'compact' | 'icon';

const BASE =
  'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg text-sm font-medium ' +
  'transition-colors select-none disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50';
const SIZE: Record<ButtonSize, string> = {
  md: 'px-4',
  compact: 'px-2.5',
  icon: 'px-0',
};
const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:opacity-90',
  secondary: 'border border-line-strong bg-surface text-fg hover:bg-surface-2',
  ghost: 'text-fg hover:bg-surface-2',
  danger: 'bg-danger text-danger-fg hover:opacity-90',
};
/** `extra` is for layout and type classes (margins, self-*, font-*); padding goes through `size`. */
const buttonClass = (variant: ButtonVariant, size: ButtonSize, extra?: string) =>
  `${BASE} ${SIZE[size]} ${VARIANT[variant]}${extra ? ` ${extra}` : ''}`;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  ref?: Ref<HTMLButtonElement>;
};

export function Button({ variant = 'secondary', size = 'md', className, type = 'button', ref, ...rest }: ButtonProps) {
  return <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...rest} />;
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant; size?: ButtonSize; href: string };

/** In-app navigation is a real link to a hash route (`#/vault`), so it works with middle-click and keyboard. */
export function ButtonLink({ variant = 'secondary', size = 'md', className, ...rest }: LinkProps) {
  return <a className={buttonClass(variant, size, className)} {...rest} />;
}

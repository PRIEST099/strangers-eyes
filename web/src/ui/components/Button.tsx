// web/src/ui/components/Button.tsx: buttons and button-styled links. Every target is at least 44×44 px
// (min-h-11 min-w-11) and shows the global focus ring (index.css :focus-visible).
// Horizontal padding, height and type size come only from `size`, never from BASE: Tailwind orders utilities by its own
// rules, not by their order in `className`, so two classes for one property (px-*, min-h-*, text-*) would not reliably
// resolve the way they read.
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, Ref } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quietDanger';
/** md: text buttons · lg: the one main action of a step (48 px) · compact: tight text buttons (header) ·
 *  icon: icon-only, exactly 44×44 px. */
export type ButtonSize = 'md' | 'lg' | 'compact' | 'icon';

const BASE =
  'inline-flex min-w-11 items-center justify-center gap-2 rounded-lg ' +
  'transition-colors duration-150 select-none disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50';
const SIZE: Record<ButtonSize, string> = {
  md: 'min-h-11 px-4 text-sm font-medium',
  lg: 'min-h-12 px-6 text-body font-semibold',
  compact: 'min-h-11 px-2.5 text-sm font-medium',
  icon: 'min-h-11 px-0 text-sm font-medium',
};
const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-fg/90',
  secondary: 'border border-line-strong bg-surface text-fg hover:bg-surface-2',
  ghost: 'text-fg hover:bg-surface-2',
  danger: 'bg-danger text-danger-fg hover:opacity-90',
  /** A red outline for a destructive action that opens a confirmation (Burn vault). danger-line is ≥ 6:1. */
  quietDanger: 'border border-danger-line bg-transparent text-danger-line hover:bg-verdict-red-bg',
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

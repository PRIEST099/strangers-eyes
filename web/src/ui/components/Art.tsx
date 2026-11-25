// web/src/ui/components/Art.tsx: decorative illustrations (D-170). Generated with Figma's AI image tool for this app
// and credited in web/public/art/SOURCES.md: no real people, places or homes (CLAUDE.md invariant 9), no map, pin or
// dot for an attacker's guess (invariant 5), masks drawn as solid black (invariant 6).
// Not used on the Vault screen: that screen loads no image or other resource at all (vaultUi.test.ts guards it).
// They are DECORATION: alt="" and aria-hidden, because the copy next to each one already says what it shows. The art
// is painted on a near-black ground, so it sits in its own dark, rounded frame in both themes. Same-origin static files,
// so they work offline after the first load and never touch the Ledger.
// The hero illustration is drawn by HeroLoop (D-171), not here; the vault illustration is used in the video only.
export type ArtName = 'check' | 'gate';

const SRC: Record<ArtName, { src: string; srcSet?: string; w: number; h: number }> = {
  check: { src: '/art/check.webp', w: 800, h: 600 },
  gate: { src: '/art/gate.webp', w: 960, h: 720 },
};

export interface ArtProps {
  name: ArtName;
  className?: string;
  /** CSS `sizes` for the responsive source (hero only). */
  sizes?: string;
  /** Eager for above-the-fold art; lazy otherwise. */
  eager?: boolean;
}

export function Art({ name, className = '', sizes, eager = false }: ArtProps) {
  const a = SRC[name];
  return (
    <img
      src={a.src}
      srcSet={a.srcSet}
      sizes={a.srcSet ? sizes : undefined}
      width={a.w}
      height={a.h}
      alt=""
      aria-hidden="true"
      data-art={name}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      className={`block rounded-card bg-[#0b0b0f] object-cover ring-1 ring-line-strong ${className}`}
    />
  );
}

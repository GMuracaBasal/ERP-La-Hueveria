import { cn } from '../lib/utils';

/** Logo tipográfico basal. — punto proporcional al wordmark oficial (~22% del em) */
export function BasalLogo({
  className,
  size = 'sm',
}: {
  className?: string;
  size?: 'sm' | 'lg';
}) {
  const textClass = size === 'lg' ? 'text-2xl' : 'text-[13px]';

  return (
    <span
      className={cn('inline-flex items-baseline text-brand-dark', textClass, className)}
      aria-label="basal."
    >
      <span className="font-serif font-bold leading-none tracking-[-0.02em]">basal</span>
      <span
        className="ml-[0.12em] mb-[0.07em] h-[0.22em] w-[0.22em] shrink-0 rounded-full bg-brand-teja"
        aria-hidden="true"
      />
    </span>
  );
}

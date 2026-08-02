import { cn } from '../lib/utils';

/** Logo tipográfico basal. — espaciado del punto como en la guía de marca */
export function BasalLogo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-baseline', className)} aria-label="basal.">
      <span className="font-serif font-bold text-[13px] leading-none text-brand-dark tracking-[-0.02em]">
        basal
      </span>
      <span
        className="ml-[3px] mb-[1.5px] h-[5px] w-[5px] shrink-0 rounded-full bg-brand-teja"
        aria-hidden="true"
      />
    </span>
  );
}

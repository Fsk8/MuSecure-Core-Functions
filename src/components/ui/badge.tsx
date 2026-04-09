import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-emerald-500/30 bg-emerald-500 text-black",
        secondary:
          "border-surface-border bg-surface-overlay text-zinc-400",
        success:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
        warning:
          "border-amber-500/30 bg-amber-500/10 text-amber-500",
        danger:
          "border-red-500/30 bg-red-500/10 text-red-400",
        violet:
          "border-violet-500/30 bg-violet-500/10 text-violet-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };

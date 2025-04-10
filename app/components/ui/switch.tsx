"use client"

import * as React from "react"
import { cn } from "../../lib/utils"

interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, ...props }, ref) => {
    return (
      <label
        className={cn(
          "relative inline-flex items-center cursor-pointer",
          className
        )}
      >
        <input
          type="checkbox"
          className="sr-only"
          ref={ref}
          {...props}
        />
        <div className={cn(
          "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-lg after:transition-transform",
          "peer-checked:bg-primary peer-checked:after:translate-x-5 peer-checked:after:transform",
          "peer-unchecked:bg-input"
        )} />
      </label>
    );
  }
);

Switch.displayName = "Switch";

export { Switch } 
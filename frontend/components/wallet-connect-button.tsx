'use client'

import { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface WalletConnectButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
}

export function WalletConnectButton({
  variant = 'default',
  size = 'md',
  className,
  children = 'Connect Wallet',
  ...props
}: WalletConnectButtonProps) {
  const baseStyles = 'uppercase font-mono transition-colors ease-out duration-150'

  const variantStyles = {
    default: 'text-primary hover:text-primary/80',
    outline: 'border border-primary text-primary hover:bg-primary hover:text-black px-4 py-2 rounded',
    ghost: 'text-muted-foreground hover:text-foreground hover:bg-secondary px-4 py-2 rounded'
  }

  const sizeStyles = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  }

  return (
    <button
      className={cn(
        baseStyles,
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

'use client'

import Image from 'next/image'
import { useState } from 'react'

interface Product {
  id: number
  name: string
  price: number
  image: string
}

interface ProductCardProps {
  product: Product
}

export function ProductCard({ product }: ProductCardProps) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      className="group cursor-pointer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative aspect-square overflow-hidden bg-neutral-200">
        <Image
          src={product.image || "/placeholder.svg"}
          alt={product.name}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>
      <div className="mt-3 space-y-1">
        <h3 className="font-mono text-xs font-medium uppercase tracking-wider text-black md:text-sm">
          {product.name}
        </h3>
        <p className="font-mono text-xs text-neutral-600 md:text-sm">
          ${product.price}
        </p>
      </div>
    </div>
  )
}

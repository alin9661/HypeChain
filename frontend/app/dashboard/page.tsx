'use client'

import { useState, useMemo } from 'react'
import { Search, Grid3x3, LayoutGrid, Rows3, X, DollarSign } from 'lucide-react'
import Image from 'next/image'
import { AppLayout } from '@/components/app-layout'

interface Product {
  id: number
  name: string
  image: string
  price: number
  instantSell: number
  rarity: number
  traits: number
  backgroundColor: string
}

const products: Product[] = [
  {
    id: 1641,
    name: 'Yeezy Foam Runner Beige',
    image: '/beige-yeezy-foam-runner-shoe-on-neutral-background.jpg',
    price: 26.55,
    instantSell: 23.16,
    rarity: 5583,
    traits: 7,
    backgroundColor: '#FF6B6B'
  },
  {
    id: 3310,
    name: 'Yeezy Foam Runner Black',
    image: '/black-yeezy-foam-runner-shoe-on-neutral-background.jpg',
    price: 26.55,
    instantSell: 23.16,
    rarity: 5801,
    traits: 6,
    backgroundColor: '#C9A0DC'
  },
  {
    id: 9864,
    name: 'Yeezy 350 V2 Grey',
    image: '/grey-yeezy-350-v2-sneaker-on-neutral-background.jpg',
    price: 27.61,
    instantSell: 24.12,
    rarity: 4082,
    traits: 8,
    backgroundColor: '#FFB6C1'
  },
  {
    id: 2534,
    name: 'Yeezy Slide Beige',
    image: '/minimalist-beige-yeezy-slide-sandal-on-neutral-bac.jpg',
    price: 27.61,
    instantSell: 24.12,
    rarity: 4589,
    traits: 7,
    backgroundColor: '#FF8A80'
  },
  {
    id: 524,
    name: 'Yeezy 700 V3 White',
    image: '/white-yeezy-700-v3-sneaker-on-neutral-background.jpg',
    price: 28.49,
    instantSell: 24.87,
    rarity: 1980,
    traits: 9,
    backgroundColor: '#81D4FA'
  },
  {
    id: 7154,
    name: 'Yeezy QNTM Grey',
    image: '/grey-yeezy-qntm-basketball-sneaker-on-neutral-back.jpg',
    price: 28.50,
    instantSell: 24.89,
    rarity: 1820,
    traits: 8,
    backgroundColor: '#FFF9C4'
  },
  {
    id: 6797,
    name: 'Yeezy Slide White',
    image: '/white-yeezy-slide-sandal-on-neutral-background.jpg',
    price: 28.57,
    instantSell: 24.95,
    rarity: 1654,
    traits: 7,
    backgroundColor: '#FFCCBC'
  },
  {
    id: 3242,
    name: 'Yeezy 500 Taupe',
    image: '/taupe-yeezy-500-sneaker-on-neutral-background.jpg',
    price: 28.66,
    instantSell: 25.03,
    rarity: 3580,
    traits: 8,
    backgroundColor: '#FF6B6B'
  },
  {
    id: 8278,
    name: 'Yeezy Foam Runner Bone',
    image: '/beige-yeezy-foam-runner-shoe-on-neutral-background.jpg',
    price: 28.66,
    instantSell: 25.03,
    rarity: 5260,
    traits: 6,
    backgroundColor: '#FFB6C1'
  },
  {
    id: 6862,
    name: 'Yeezy 350 V2 Slate',
    image: '/grey-yeezy-350-v2-sneaker-on-neutral-background.jpg',
    price: 28.66,
    instantSell: 25.03,
    rarity: 7050,
    traits: 7,
    backgroundColor: '#FFB6C1'
  },
  {
    id: 6121,
    name: 'Yeezy 700 V3 Cream',
    image: '/white-yeezy-700-v3-sneaker-on-neutral-background.jpg',
    price: 28.66,
    instantSell: 25.03,
    rarity: 7427,
    traits: 8,
    backgroundColor: '#C9A0DC'
  },
  {
    id: 9032,
    name: 'Yeezy QNTM Onyx',
    image: '/grey-yeezy-qntm-basketball-sneaker-on-neutral-back.jpg',
    price: 28.66,
    instantSell: 25.03,
    rarity: 4923,
    traits: 9,
    backgroundColor: '#81D4FA'
  },
]

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'price-low' | 'price-high' | 'rarity-low' | 'rarity-high'>('price-low')
  const [viewMode, setViewMode] = useState<'grid-large' | 'grid-medium' | 'grid-small'>('grid-medium')
  const [showInstantSell, setShowInstantSell] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

  const filteredAndSortedProducts = useMemo(() => {
    let filtered = products.filter(product =>
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.id.toString().includes(searchQuery)
    )

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'price-low':
          return a.price - b.price
        case 'price-high':
          return b.price - a.price
        case 'rarity-low':
          return a.rarity - b.rarity
        case 'rarity-high':
          return b.rarity - a.rarity
        default:
          return 0
      }
    })

    return filtered
  }, [searchQuery, sortBy])

  const gridCols = {
    'grid-large': 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
    'grid-medium': 'grid-cols-2 md:grid-cols-4 lg:grid-cols-5',
    'grid-small': 'grid-cols-3 md:grid-cols-5 lg:grid-cols-6'
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-background font-mono">
      {/* Top Bar */}
      <div className="border-b border-border bg-card">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Search */}
            <div className="flex-1 max-w-md relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search NFTs by Name"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-input border border-border rounded-lg text-sm text-foreground font-mono placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Traits Filter */}
            <button className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg text-sm font-mono text-foreground hover:bg-accent transition">
              <span className="text-muted-foreground">🎨</span>
              Traits
            </button>

            {/* View Mode */}
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid-large')}
                className={`p-2 rounded ${viewMode === 'grid-large' ? 'bg-card shadow-sm' : 'hover:bg-accent'}`}
              >
                <Grid3x3 className="w-4 h-4 text-foreground" />
              </button>
              <button
                onClick={() => setViewMode('grid-medium')}
                className={`p-2 rounded ${viewMode === 'grid-medium' ? 'bg-card shadow-sm' : 'hover:bg-accent'}`}
              >
                <LayoutGrid className="w-4 h-4 text-foreground" />
              </button>
              <button
                onClick={() => setViewMode('grid-small')}
                className={`p-2 rounded ${viewMode === 'grid-small' ? 'bg-card shadow-sm' : 'hover:bg-accent'}`}
              >
                <Rows3 className="w-4 h-4 text-foreground" />
              </button>
            </div>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-4 py-2 bg-card border border-border rounded-lg text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="price-low">price (low to high)</option>
              <option value="price-high">price (high to low)</option>
              <option value="rarity-low">rarity (low to high)</option>
              <option value="rarity-high">rarity (high to low)</option>
            </select>

            {/* Close Button */}
            <button className="p-2 hover:bg-accent rounded-lg transition">
              <X className="w-5 h-5 text-foreground" />
            </button>
          </div>
        </div>
      </div>

      {/* Instant Sell Sidebar */}
      <div className={`fixed left-0 top-[73px] bottom-0 bg-card border-r border-border transition-all duration-300 ${showInstantSell ? 'w-48' : 'w-0'} overflow-hidden z-10`}>
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-5 h-5 text-primary" />
            <h3 className="font-semibold font-mono text-foreground">Instant sell</h3>
          </div>
          <p className="text-2xl font-bold font-mono text-foreground mb-2">23.16</p>
          <button className="w-full bg-primary text-primary-foreground py-2 rounded-lg font-medium font-mono hover:bg-primary/90 transition mb-2">
            SELL NOW
          </button>
          <button className="w-full border border-border py-2 rounded-lg font-medium font-mono text-foreground hover:bg-accent transition">
            ALL BIDS
          </button>
        </div>
      </div>

      {/* Products Grid */}
      <div className={`p-6 transition-all duration-300 ${showInstantSell ? 'ml-48' : 'ml-0'}`}>
        <div className={`grid ${gridCols[viewMode]} gap-4`}>
          {filteredAndSortedProducts.map((product) => (
            <div
              key={product.id}
              onClick={() => setSelectedProduct(product)}
              className="bg-card rounded-lg overflow-hidden border border-border hover:shadow-lg transition-all cursor-pointer group"
            >
              {/* Product Image with Background */}
              <div
                className="relative aspect-square overflow-hidden"
                style={{ backgroundColor: product.backgroundColor }}
              >
                <Image
                  src={product.image}
                  alt={product.name}
                  fill
                  className="object-contain p-4"
                  sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 20vw"
                />

                {/* Badges */}
                <div className="absolute top-2 left-2 flex flex-col gap-1">
                  <div className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
                    <span>{product.rarity}</span>
                  </div>
                  {product.traits && (
                    <div className="bg-gray-800/80 text-white text-xs px-2 py-1 rounded-full">
                      🎯 {product.traits}
                    </div>
                  )}
                </div>

                {/* ID Badge */}
                <div className="absolute top-2 right-2 bg-card/90 backdrop-blur-sm text-foreground text-xs px-2 py-1 rounded-full font-mono">
                  #{product.id}
                </div>

                {/* More Options */}
                <button className="absolute bottom-2 right-2 bg-card/90 backdrop-blur-sm p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition">
                  <span className="text-foreground font-mono">...</span>
                </button>
              </div>

              {/* Product Info */}
              <div className="p-3 border-t border-border">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground font-mono mb-0.5">SOL</p>
                    <p className="font-bold font-mono text-sm text-foreground">≡ {product.price.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedProduct(null)}
        >
          <div
            className="bg-card rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid md:grid-cols-2 gap-6 p-8">
              {/* Image */}
              <div
                className="aspect-square relative rounded-xl overflow-hidden"
                style={{ backgroundColor: selectedProduct.backgroundColor }}
              >
                <Image
                  src={selectedProduct.image}
                  alt={selectedProduct.name}
                  fill
                  className="object-contain p-8"
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              </div>

              {/* Details */}
              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-primary/20 text-primary text-xs px-3 py-1 rounded-full font-medium font-mono">
                      #{selectedProduct.id}
                    </span>
                    <span className="bg-muted text-muted-foreground text-xs px-3 py-1 rounded-full font-medium font-mono">
                      Rarity: {selectedProduct.rarity}
                    </span>
                  </div>
                  <h2 className="text-3xl font-bold font-mono text-foreground">{selectedProduct.name}</h2>
                </div>

                <div className="space-y-4 pt-4 border-t border-border">
                  <div>
                    <p className="text-sm text-muted-foreground font-mono mb-1">Current Price</p>
                    <p className="text-4xl font-bold font-mono text-foreground">{selectedProduct.price.toFixed(2)} SOL</p>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground font-mono mb-1">Instant Sell Price</p>
                    <p className="text-2xl font-bold font-mono text-foreground">{selectedProduct.instantSell.toFixed(2)} SOL</p>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground font-mono mb-1">Traits</p>
                    <p className="text-lg font-semibold font-mono text-foreground">{selectedProduct.traits} attributes</p>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button className="flex-1 px-6 py-4 bg-primary text-primary-foreground rounded-xl font-bold font-mono hover:bg-primary/90 transition text-lg">
                    Buy Now
                  </button>
                  <button className="flex-1 px-6 py-4 bg-muted text-foreground rounded-xl font-bold font-mono hover:bg-accent transition text-lg">
                    Make Offer
                  </button>
                </div>

                <button
                  onClick={() => setSelectedProduct(null)}
                  className="w-full px-6 py-3 border border-border text-muted-foreground rounded-xl font-medium font-mono hover:bg-accent transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Info Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border px-6 py-3 flex items-center justify-between text-xs text-muted-foreground font-mono">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span>Live</span>
          </div>
          <span>⭐</span>
          <span>⚙️</span>
          <span>🎬</span>
          <span className="bg-muted px-3 py-1 rounded">Lite 🌙 Pro</span>
        </div>

        <div className="flex items-center gap-6 font-mono">
          <span>24h Vol: 2,574</span>
          <span className="text-green-500">≡ $142.19</span>
          <span>TPS: 2,740</span>
        </div>
      </div>
      </div>
    </AppLayout>
  )
}

import { ProductCard } from '@/components/product-card'

const products = [
  {
    id: 1,
    name: 'YEEZY SLIDE BONE',
    price: 70,
    image: '/minimalist-beige-yeezy-slide-sandal-on-neutral-bac.jpg',
  },
  {
    id: 2,
    name: 'YEEZY FOAM RNNR ONYX',
    price: 90,
    image: '/black-yeezy-foam-runner-shoe-on-neutral-background.jpg',
  },
  {
    id: 3,
    name: 'YEEZY 350 V2 SLATE',
    price: 230,
    image: '/grey-yeezy-350-v2-sneaker-on-neutral-background.jpg',
  },
  {
    id: 4,
    name: 'YEEZY 700 V3 AZAEL',
    price: 200,
    image: '/white-yeezy-700-v3-sneaker-on-neutral-background.jpg',
  },
  {
    id: 5,
    name: 'YEEZY SLIDE PURE',
    price: 70,
    image: '/white-yeezy-slide-sandal-on-neutral-background.jpg',
  },
  {
    id: 6,
    name: 'YEEZY FOAM RNNR SAND',
    price: 90,
    image: '/beige-yeezy-foam-runner-shoe-on-neutral-background.jpg',
  },
  {
    id: 7,
    name: 'YEEZY 500 TAUPE LIGHT',
    price: 200,
    image: '/taupe-yeezy-500-sneaker-on-neutral-background.jpg',
  },
  {
    id: 8,
    name: 'YEEZY QNTM BARIUM',
    price: 250,
    image: '/grey-yeezy-qntm-basketball-sneaker-on-neutral-back.jpg',
  },
]

export function ProductGrid() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-8">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  )
}

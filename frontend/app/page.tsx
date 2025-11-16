import Image from 'next/image'
import { ProductGrid } from '@/components/product-grid'
import { Header } from '@/components/header'

export default function Home() {
  return (
    <div className="min-h-screen bg-neutral-100">
      <Header />
      <main>
        <ProductGrid />
      </main>
    </div>
  )
}

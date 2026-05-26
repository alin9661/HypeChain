# HypeChain Frontend - AI-Powered NFT Marketplace

A comprehensive Next.js frontend fully integrated with the HypeChain backend API. Create AI-verified NFT listings, view real-time marketplace updates, and manage Solana blockchain transactions.

![HypeChain Platform](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)
![Solana](https://img.shields.io/badge/Solana-DevNet-purple?style=for-the-badge&logo=solana)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript)
![Tests](https://img.shields.io/badge/Tests-Passing-green?style=for-the-badge)

## Features

### Complete Backend API Integration
- **All 4 backend endpoints integrated** (Health, API Info, Listing Info, Create Listing)
- **Centralized API client** with error handling and request interceptors
- **Custom React hooks** for all API operations
- **TypeScript interfaces** for all request/response types
- **Real-time WebSocket** integration for marketplace updates

### Reusable Components
- **CreateListingForm**: Complete NFT creation with image upload, validation, and wallet integration
- **NFTCard & NFTGrid**: Display NFTs with responsive grid layout and skeleton loaders
- **WalletConnect**: Solana wallet connection with Phantom support and demo fallback
- **ToastContainer**: Global notification system with auto-dismiss
- **ErrorBoundary**: Graceful error handling with fallback UI

### React Hooks
- **useCreateListing**: Create NFT listings with progress tracking
- **useHealthCheck**: Monitor backend server status
- **useImageUpload**: Handle image uploads with validation and preview
- **useWebSocket**: Real-time updates and event subscriptions
- **useListings, useWallet, useNotifications**: Global state management

### Pages

#### 1. Landing (`/`)
- WebGL particle-field hero with wallet-connect ripple + keyboard-focus hover
- Scroll-told product story below the hero in four sections:
  - **Verify Flow** — sticky-pinned cinematic scrub through Intake → AI Examination → Mint (static-stacked fallback for mobile and reduced-motion)
  - **Evidence Locker** — the three signature design moves (Case-File Ribbon, Redaction Bars with typewriter unredact, Mint Certificate)
  - **Marketplace Proof** — live KPI strip + recent verified rows via `useListings()`, with an empty-state fallback
  - **Final CTA** — brass bullion + outline buttons mirroring the hero
- Reduced-motion + small-viewport users get the same story without scroll choreography

#### 2. **Marketplace (`/marketplace`)** NEW
- **NFT grid with real backend listings**
- Create NFT listing with AI verification
- Search and filter functionality
- Sort by price or recency
- NFT detail modals
- Real-time updates via WebSocket

#### 3. **API Documentation (`/api-docs`)** NEW
- Live backend health monitoring
- Complete endpoint documentation
- Request/response examples
- Code snippets for integration
- Environment variables guide

#### 4. Recent Activities (`/activities`)
- **Live Solana DevNet transactions**
- Real-time auto-refresh (every 30 seconds)
- Advanced filtering (All, Success, Failed)
- Search by signature or address
- Transaction explorer links

#### 5. Chat (`/chat`)
- Real-time messaging interface
- Conversation list with unread indicators
- Message bubbles with timestamps
- WebSocket-ready architecture

#### 6. Settings (`/settings`)
- Profile management
- Wallet connection
- Notification preferences
- Theme selection (Light/Dark/System)

### Form Validation
- **react-hook-form** with **Zod schemas**
- Client-side validation for all inputs
- Real-time error feedback
- Image format and size validation

### State Management
- **Context API** for global state (listings, wallet, notifications)
- Optimized with useCallback and useMemo
- TypeScript-safe actions and selectors
- Convenience hooks (useListings, useWallet, useNotifications)

### Testing
- **Jest** with React Testing Library
- Unit tests for API client
- Component tests for NFTCard
- Mock setup for Next.js environment
- 15+ passing test cases

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **UI**: React 19, TypeScript, Tailwind CSS 4
- **Blockchain**: @solana/web3.js, @metaplex-foundation/umi
- **Components**: Radix UI, Lucide Icons
- **Forms**: react-hook-form, zod
- **Testing**: Jest, React Testing Library
- **Theme**: next-themes
- **Date**: date-fns
- **State**: React Context API

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Environment Setup

Create `.env.local` in the frontend directory:

```bash
# Backend API
NEXT_PUBLIC_API_URL=http://localhost:3001

# WebSocket URL
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws

# Solana Network
NEXT_PUBLIC_SOLANA_NETWORK=devnet
```

**Note:** Make sure the backend is running on port 3001 before starting the frontend.

### 3. Run Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

### 4. Build for Production

```bash
pnpm build
pnpm start
```

## Project Structure

```
frontend/
├── app/
│   ├── layout.tsx                  # Root layout with providers
│   ├── page.tsx                    # Dashboard
│   ├── marketplace/page.tsx        # NFT marketplace
│   ├── api-docs/page.tsx          # API documentation
│   ├── chat/page.tsx              # Chat interface
│   ├── activities/page.tsx        # Transaction viewer
│   ├── settings/page.tsx          # Settings page
│   └── globals.css                # Global styles
│
├── components/
│   ├── sidebar.tsx                # Sidebar navigation
│   ├── top-header.tsx             # Top header
│   ├── app-layout.tsx             # Layout wrapper
│   ├── theme-provider.tsx         # Theme context
│   ├── create-listing-form.tsx    # NFT creation form
│   ├── nft-card.tsx              # NFT card component
│   ├── nft-grid.tsx              # NFT grid layout
│   ├── wallet-connect.tsx         # Wallet connection
│   ├── toast.tsx                  # Toast notifications
│   ├── error-boundary.tsx         # Error handling
│   └── landing/                   # Landing-page scroll-story sections
│       ├── verify-flow-section.tsx       # Sticky-pinned Intake → AI → Mint scrub + static fallback
│       ├── evidence-moves-section.tsx    # Three signature design moves
│       ├── marketplace-proof-section.tsx # Live KPIs + verified rows / empty-state
│       ├── final-cta-section.tsx         # Closing CTA band
│       ├── landing-section-data.ts       # Copy + pure scrub-math helpers
│       └── reveal.tsx                    # SSR-safe tri-state one-shot scroll reveal
│
├── contexts/
│   └── AppContext.tsx             # Global state management
│
├── hooks/
│   ├── useApi.ts                  # API integration hooks
│   ├── useWebSocket.ts            # WebSocket hooks
│   ├── useReducedMotion.ts        # Respect prefers-reduced-motion
│   ├── useInView.ts               # IntersectionObserver wrapper for one-shot reveals
│   └── useScrollProgress.ts       # 0..1 progress for sticky-pinned scrub sections
│
├── lib/
│   ├── api-client.ts              # HTTP API client
│   ├── solana.ts                  # Solana blockchain service
│   ├── websocket.ts               # WebSocket service
│   └── utils.ts                   # Utilities
│
├── __tests__/
│   ├── setup.ts                   # Jest configuration
│   ├── api-client.test.ts         # API client tests
│   ├── nft-card.test.tsx          # Component tests
│   └── landing-section-data.test.ts # Pure scrub-math helpers (clamp01, progressToStep, subProgress)
│
├── jest.config.js                 # Jest setup
└── package.json

* = Newly created/integrated files
```

## Design System

### Color Palette (Dark Mode)

- **Background**: `rgb(2, 6, 23)` - Very dark blue
- **Foreground**: `rgb(248, 250, 252)` - Light slate
- **Primary**: `rgb(59, 130, 246)` - Blue
- **Card**: `rgb(15, 23, 42)` - Dark slate
- **Border**: `rgb(30, 41, 59)` - Slate gray

### Typography

- **Font**: Geist Sans & Geist Mono
- **Headings**: Bold, white text
- **Body**: Regular, slate-400
- **Code**: Monospace, blue-400

## API Integration

### Using the API Client

```typescript
import { apiClient } from '@/lib/api-client';

// Health check
const health = await apiClient.healthCheck();

// Create NFT listing
const result = await apiClient.createListing({
  userWallet: 'YOUR_WALLET_ADDRESS',
  productImage: 'data:image/jpeg;base64,...',
  optionalPriceSol: 0.5
});

if (result.success) {
  console.log('NFT Mint:', result.data.nft_mint_address);
  console.log('IPFS URL:', result.data.nft_image_url);
}
```

### Using React Hooks

```typescript
import { useCreateListing, useHealthCheck } from '@/hooks/useApi';

function MyComponent() {
  const { createListing, loading, error, progress } = useCreateListing();
  const { data: health } = useHealthCheck();

  const handleCreate = async () => {
    const result = await createListing({
      userWallet: wallet.address,
      productImage: base64Image,
      optionalPriceSol: 0.5
    });
  };

  return (
    <div>
      {loading && <p>Progress: {progress}</p>}
      {error && <p>Error: {error}</p>}
    </div>
  );
}
```

### Solana Blockchain

```typescript
import { SolanaService } from '@/lib/solana';

const solanaService = new SolanaService();

// Get recent transactions
const transactions = await solanaService.getRecentTransactions(50);

// Get wallet balance
const balance = await solanaService.getBalance('YOUR_WALLET_ADDRESS');
```

## WebSocket Integration

Real-time updates are automatically handled via the `useWebSocket` hook:

```typescript
import { useWebSocket } from '@/hooks/useWebSocket';

function MyComponent() {
  const { sendMessage, isConnected } = useWebSocket();

  // Automatically receives:
  // - new_listing events → adds to marketplace
  // - marketplace_update events → shows notifications

  return (
    <div>
      Status: {isConnected() ? 'Connected' : 'Disconnected'}
    </div>
  );
}
```

Manual WebSocket usage:

```typescript
import { WebSocketService } from '@/lib/websocket';

const ws = WebSocketService.getInstance();

// Connect
ws.connect();

// Subscribe to events
ws.subscribe('custom_event', (data) => {
  console.log('Event received:', data);
});

// Send messages
ws.send({ type: 'custom_event', payload: { message: 'Hello!' } });
```

## Responsive Breakpoints

- **Mobile**: < 640px
- **Tablet**: 640px - 1024px
- **Desktop**: > 1024px

### Mobile Features
- Hamburger menu for navigation
- Scrollable tables
- Responsive grid layouts
- Touch-optimized interactions

## Accessibility

- Full keyboard navigation support
- ARIA labels on all interactive elements
- Screen reader optimized
- Focus management
- Semantic HTML

## Performance

- Route-based code splitting
- Optimized images with Next.js Image
- React Server Components
- Automatic static optimization
- Lazy loading

## Scripts

```bash
pnpm dev       # Start development server
pnpm build     # Build for production
pnpm start     # Start production server
pnpm lint      # Run ESLint
pnpm test      # Run Jest unit tests
```

## Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch

# Run specific test
npm test api-client.test.ts
```

### Test Coverage

Current test coverage:
- API Client (healthCheck, createListing, validation)
- NFTCard component (rendering, interactions, IPFS links)
- Mock setup for Next.js environment

More tests in `__tests__/` directory.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | `http://localhost:3001` |
| `NEXT_PUBLIC_WS_URL` | WebSocket server URL | `ws://localhost:3001/ws` |
| `NEXT_PUBLIC_SOLANA_NETWORK` | Solana network (devnet/mainnet-beta) | `devnet` |

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Troubleshooting

### Build Errors

If you encounter build errors, try:

```bash
rm -rf .next node_modules
pnpm install
pnpm build
```

### TypeScript Errors

Make sure you're using TypeScript 5.1.0 or higher:

```bash
pnpm add -D typescript@latest
```

### Styling Issues

Clear the cache and rebuild:

```bash
rm -rf .next
pnpm dev
```

## Documentation

### Complete Guides

1. **[FRONTEND_INTEGRATION_SUMMARY.md](../FRONTEND_INTEGRATION_SUMMARY.md)** - Comprehensive integration documentation
2. **[DEPLOYMENT_GUIDE.md](../DEPLOYMENT_GUIDE.md)** - Full deployment instructions
3. **[DEMO_INSTRUCTIONS.md](../DEMO_INSTRUCTIONS.md)** - Demo walkthrough and scripts
4. **[API Documentation](http://localhost:3000/api-docs)** - Interactive API docs (when running)

### Key Features

#### 1. NFT Creation Workflow

1. User uploads product image
2. AI verifies authenticity (liveness score > 50)
3. AI generates marketing image
4. Images uploaded to IPFS
5. NFT minted on Solana blockchain
6. Listed in marketplace
7. Real-time update to all connected clients

#### 2. State Management

Global state managed via Context API:
- NFT listings
- Wallet connection
- UI preferences
- Toast notifications

#### 3. Error Handling

- Error boundaries for React errors
- Toast notifications for user feedback
- Comprehensive error messages
- Development mode stack traces

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Solana Web3.js](https://solana-labs.github.io/solana-web3.js/)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Radix UI](https://www.radix-ui.com/)
- [React Hook Form](https://react-hook-form.com/)
- [Zod Validation](https://zod.dev/)

## Demo

To demo the application:

1. Start backend: `cd backend && npm run dev`
2. Start frontend: `cd frontend && npm run dev`
3. Visit http://localhost:3000/marketplace
4. Click "Create Listing"
5. Upload a product image
6. Watch the AI verification process
7. View your NFT in the marketplace!

See [DEMO_INSTRUCTIONS.md](../DEMO_INSTRUCTIONS.md) for detailed demo script.

## Support

For issues or questions:
- GitHub Issues: https://github.com/alin9661/HypeChain/issues
- Documentation: See guides listed above

---

Built for HackNYU 2025

**Features:**
- Complete backend API integration
- Real-time WebSocket updates
- Solana blockchain NFTs
- AI-powered verification
- Responsive design
- Unit tests
- TypeScript
- Error handling
- Form validation
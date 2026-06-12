# HypeChain Frontend - AI-Powered NFT Marketplace

A comprehensive Next.js frontend fully integrated with the HypeChain backend API. Create AI-verified NFT listings, view real-time marketplace updates, and manage Solana blockchain transactions.

![HypeChain Platform](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)
![Solana](https://img.shields.io/badge/Solana-DevNet-purple?style=for-the-badge&logo=solana)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript)
![Tests](https://img.shields.io/badge/Tests-Passing-green?style=for-the-badge)

## Features

### Complete Backend API Integration
- **All backend endpoints integrated** (Health, API Info, Listing Info, Create Listing, payments incl. co-sign purchase)
- **Centralized API client** with error handling and request interceptors
- **Custom React hooks** for all API operations
- **TypeScript interfaces** for all request/response types
- **Real-time WebSocket** integration for marketplace updates

### Reusable Components

**Navigation & auth**
- **Navigation** (`navigation.tsx`): Top nav with Privy-driven wallet state
- **PrivyProviderWrapper** (`privy-provider-wrapper.tsx`): App-root auth provider
- **WalletDropdown** (`wallet-dropdown.tsx`): Wallet ID display with redact/reveal cycle

**Evidence Locker primitives** (per `DESIGN.md`)
- **CaseFileRibbon** (`case-file-ribbon.tsx`): Top status bar on app pages (not marketing)
- **RedactedField** (`redacted-field.tsx`): Typewriter-reveal redaction primitive
- **Pill** (`pill.tsx`): Polygon clip-path chips, intent radio-pills

**Listings & purchase**
- **CreateListingForm** (`create-listing-form.tsx`): NFT creation with image upload, validation, wallet
- **NFTCard & NFTGrid**: Responsive grid with skeleton loaders
- **PurchaseButton** (`purchase-button.tsx`): Buy flow with on-chain transaction state. With `NEXT_PUBLIC_USE_ANCHOR_PURCHASE=1`, runs the Anchor co-sign path: fetches a server-co-signed `purchase_evidence` transaction from `/api/payments/cosign-purchase`, verifies the tx bytes client-side (`assertCosignedInstructions` in `lib/purchase-helpers.ts`), then buyer-signs and sends

**Global**
- **ToastContainer** (`toast.tsx`): Notification system with auto-dismiss
- **ErrorBoundary** (`error-boundary.tsx`): Graceful error handling
- **FloatingChatButton** + **ChatOverlay**: Embedded chat affordance

> The legacy `sidebar.tsx`, `top-header.tsx`, `app-layout.tsx`, and `hero-section.tsx` files predate the navigation rebuild and are no longer wired into `app/layout.tsx`. They will be removed in a follow-up cleanup.

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

#### 7. Waitlist (`/waitlist`)
- Sentient-italic hero ("built for verified records.")
- Intent radio-pill row (Collect / Trade / Verify / Build) replacing SaaS select dropdown
- Case-file-style receipt with `dl` rows, mono labels, dashed hairlines
- Three intake states: idle form / submitting / receipt
- Submission IDs in `HC-W-NNNNNN` format (mirrors listings detail `HC-YYYY-NNNNNN`)
- Hairline-bordered queue rail with tabular-nums counters
- Posts to `/api/waitlist` (stub) — form shape: `name / email / walletAddress / interest`

#### 8. Listings detail (`/listings/[id]`)
- Evidence Locker primitives (Case-File Ribbon, Redacted Field, Mint Certificate)
- Renders for the wallet-connected reveal/redact cycle

#### 9. Sold (`/sold`)
- Marketing surface showcasing completed verifications (no Case-File Ribbon per `DESIGN.md`)

#### 10. Collections (`/collections`)
- Grouped listings by verified series

### Design System

All UI decisions are sourced from [`frontend/DESIGN.md`](./DESIGN.md). See it before changing any visual element.

- **Aesthetic:** Verified Yellow + Evidence Chrome ("Notarized Cypherpunk"). The memorable thing: *"It looks like a financial terminal, not a JPEG mall."*
- **Accent:** evidence-locker brass `#EBC658` (retoned from caution-yellow `#FFC700` via `#D4A82C`, brightened 2026-05-19 — see Decisions Log in `DESIGN.md`).
- **Typography:** Sentient italic display, Geist body, Geist Mono UPPERCASE for UI/labels/data with `tabular-nums`.
- **Signature primitives:** Case-File Ribbon, Redacted Field (`<RedactedField>`), Mint Certificate. Marketing surfaces (`/`, `/waitlist`, `/sold`) intentionally omit the ribbon.

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
- Unit tests for API client (incl. cosign-purchase), purchase helpers, anchor-client program-ID guard, and landing scrub-math helpers
- Component tests for NFTCard, PurchaseButton, the theme provider (including the pre-paint init script), and the Privy provider config
- Mock setup for Next.js environment
- 9 suites / 80 passing tests

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **UI**: React 19, TypeScript, Tailwind CSS 4
- **Blockchain**: @solana/web3.js, @metaplex-foundation/umi
- **Components**: Radix UI, Lucide Icons
- **Forms**: react-hook-form, zod
- **Testing**: Jest, React Testing Library
- **Theme**: first-party provider (`components/theme-provider.tsx`), dark by default
- **Date**: date-fns
- **State**: React Context API

## Quick Start

### 1. Install Dependencies

```bash
bun install
```

### 2. Environment Setup

Create `.env.local` in the frontend directory:

```bash
# Backend API (trailing slashes are normalized away)
NEXT_PUBLIC_API_URL=http://localhost:3001

# WebSocket URL
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws

# Solana Network
NEXT_PUBLIC_SOLANA_NETWORK=devnet

# Evidence Locker program ID — required in production builds (throws at
# import when unset or still the scaffold placeholder)
NEXT_PUBLIC_HYPECHAIN_PROGRAM_ID=2pTtzWXELYNXAsXkWq3zgErbYnJTANfq5LmBptdk5uiF

# Optional: enable the Anchor co-sign purchase flow
NEXT_PUBLIC_USE_ANCHOR_PURCHASE=1

# Optional: route payment writes to a separately deployed write service
# NEXT_PUBLIC_WRITE_API_URL=https://write.example.com
```

**Note:** Make sure the backend is running on port 3001 before starting the frontend.

### 3. Run Development Server

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000)

### 4. Build for Production

```bash
bun run build
bun start
```

## Project Structure

```
frontend/
├── app/
│   ├── layout.tsx                  # Root layout with providers
│   ├── page.tsx                    # Landing (WebGL particle hero)
│   ├── marketplace/page.tsx        # NFT marketplace
│   ├── api-docs/page.tsx           # API documentation
│   ├── chat/page.tsx               # Chat interface
│   ├── activities/page.tsx         # Transaction viewer
│   ├── settings/page.tsx           # Settings page
│   ├── waitlist/page.tsx           # Waitlist intake (case-file receipt)
│   ├── listings/page.tsx           # Evidence Intake Bay
│   ├── listings/[id]/page.tsx      # Listing detail (Evidence Locker primitives)
│   ├── sold/page.tsx               # Completed verifications
│   ├── collections/page.tsx        # Grouped listings
│   └── globals.css                 # Global styles (design tokens)
│
├── components/
│   ├── navigation.tsx              # Top navigation (Privy-aware)
│   ├── privy-provider-wrapper.tsx  # App-root auth provider
│   ├── wallet-dropdown.tsx         # Wallet ID with redact/reveal
│   ├── case-file-ribbon.tsx        # Evidence Locker: top status bar
│   ├── redacted-field.tsx          # Evidence Locker: typewriter reveal
│   ├── pill.tsx                    # Polygon-corner chips & radio-pills
│   ├── purchase-button.tsx         # Buy flow with transaction state
│   ├── create-listing-form.tsx     # NFT creation form
│   ├── nft-card.tsx                # NFT card component
│   ├── nft-grid.tsx                # NFT grid layout
│   ├── floating-chat-button.tsx    # Embedded chat affordance
│   ├── chat-overlay.tsx            # Chat overlay panel
│   ├── theme-provider.tsx          # First-party theme provider (dark default, pre-paint script, useTheme/resolvedTheme)
│   ├── toast.tsx                   # Toast notifications
│   ├── error-boundary.tsx          # Error handling
│   ├── landing/                    # Landing-page scroll-story sections
│   │   ├── verify-flow-section.tsx       # Sticky-pinned Intake → AI → Mint scrub + static fallback
│   │   ├── evidence-moves-section.tsx    # Three signature design moves
│   │   ├── marketplace-proof-section.tsx # Live KPIs + verified rows / empty-state
│   │   ├── final-cta-section.tsx         # Closing CTA band
│   │   ├── landing-section-data.ts       # Copy + pure scrub-math helpers
│   │   └── reveal.tsx                    # SSR-safe tri-state one-shot scroll reveal
│   ├── ui/                         # Primitive UI atoms (button, etc.)
│   └── gl/                         # WebGL particle pipeline (RTF)
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
│   ├── api-client.ts              # HTTP API client (cosign endpoint, write-URL override)
│   ├── anchor-client.ts           # Evidence Locker Anchor client (fail-closed program ID)
│   ├── purchase-helpers.ts        # Co-signed tx verification (assertCosignedInstructions)
│   ├── solana.ts                  # Solana blockchain service
│   ├── websocket.ts               # WebSocket service
│   └── utils.ts                   # Utilities
│
├── __tests__/
│   ├── setup.ts                   # Jest configuration
│   ├── api-client.test.ts         # API client tests
│   ├── api-client-cosign.test.ts  # Cosign-purchase API client tests
│   ├── anchor-client-program-id.test.ts # Production program-ID guard
│   ├── purchase-button.test.tsx   # Buy flow incl. Anchor co-sign path
│   ├── purchase-helpers.test.ts   # Co-signed tx byte verification
│   ├── nft-card.test.tsx          # Component tests
│   ├── theme-provider.test.tsx    # Theme provider + header toggle (init script, resolvedTheme, cross-tab sync)
│   ├── privy-provider-wrapper.test.tsx # Privy config memoization + production appId guard
│   └── landing-section-data.test.ts # Pure scrub-math helpers (clamp01, progressToStep, subProgress)
│
├── jest.config.js                 # Jest setup
└── package.json

* = Newly created/integrated files
```

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
bun dev          # Start development server
bun run build    # Build for production
bun start        # Start production server
bun run lint     # Run ESLint
bun test         # Run Jest unit tests
```

## Testing

Run the test suite:

```bash
# Run all tests
bun test

# Run with coverage
bun test --coverage

# Watch mode
bun test --watch

# Run specific test
bun test api-client.test.ts
```

### Test Coverage

Current test coverage (9 suites / 80 tests):
- API Client (healthCheck, createListing, validation, cosign-purchase)
- Purchase flow (PurchaseButton Anchor co-sign path, purchase-helpers tx verification, anchor-client program-ID guard)
- NFTCard component (rendering, interactions, IPFS links)
- Theme provider (pre-paint init script execution, `resolvedTheme`, system-preference tracking, cross-tab sync) and the header theme toggle
- Privy provider (config identity across re-renders, per-chain embedded-wallet shape, production app-ID guard)
- Landing scrub-math helpers (clamp01, progressToStep, subProgress)
- Mock setup for Next.js environment

More tests in `__tests__/` directory.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API URL (trailing slashes normalized) | `http://localhost:3001` |
| `NEXT_PUBLIC_WS_URL` | WebSocket server URL | `ws://localhost:3001/ws` |
| `NEXT_PUBLIC_SOLANA_NETWORK` | Solana network (devnet/mainnet-beta) | `devnet` |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy app ID for wallet auth. **Required in production** — production builds throw at startup if unset. | dev/test placeholder |
| `NEXT_PUBLIC_HYPECHAIN_PROGRAM_ID` | Evidence Locker program ID. **Required in production** — production builds throw at import if unset or still the scaffold placeholder. | dev/test placeholder |
| `NEXT_PUBLIC_USE_ANCHOR_PURCHASE` | Set to `1` to enable the on-chain Anchor co-sign purchase flow (default: legacy SOL-transfer flow) | off |
| `NEXT_PUBLIC_WRITE_API_URL` | Optional override: base URL for payment writes when the write service is deployed separately | falls back to `NEXT_PUBLIC_API_URL` |

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
bun install
bun run build
```

### TypeScript Errors

Make sure you're using TypeScript 5.1.0 or higher:

```bash
bun add -d typescript@latest
```

### Styling Issues

Clear the cache and rebuild:

```bash
rm -rf .next
bun dev
```

## Documentation

### Complete Guides

1. **[FRONTEND_INTEGRATION_SUMMARY.md](../docs/implementation/FRONTEND_INTEGRATION_SUMMARY.md)** - Comprehensive integration documentation
2. **[DEPLOYMENT_GUIDE.md](../docs/guides/DEPLOYMENT_GUIDE.md)** - Full deployment instructions
3. **[DEMO_INSTRUCTIONS.md](../docs/guides/DEMO_INSTRUCTIONS.md)** - Demo walkthrough and scripts
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

1. Start backend: `cd backend && bun dev`
2. Start frontend: `cd frontend && bun dev`
3. Visit http://localhost:3000/marketplace
4. Click "Create Listing"
5. Upload a product image
6. Watch the AI verification process
7. View your NFT in the marketplace!

See [DEMO_INSTRUCTIONS.md](../docs/guides/DEMO_INSTRUCTIONS.md) for detailed demo script.

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
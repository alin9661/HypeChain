# HypeChain Frontend Guide

## Overview

The HypeChain frontend is a modern, responsive blockchain platform built with Next.js 16, featuring a sidebar navigation layout, real-time chat, and Solana DevNet transaction tracking.

## Features

### 1. Sidebar Navigation
- **Fixed left sidebar** with collapsible menu
- **Mobile-responsive** with hamburger menu
- **Dark mode** support with theme toggle
- **Active page** highlighting
- **Smooth animations** and transitions

### 2. Pages

#### Dashboard (`/`)
- Overview of platform statistics
- Recent activity feed
- Quick action buttons
- Solana DevNet network status
- Real-time metrics display

#### Recent Activities (`/activities`)
- Live Solana DevNet transactions
- Real-time auto-refresh (every 30 seconds)
- Advanced filtering (All, Success, Failed)
- Search by signature or address
- Transaction details with external explorer links
- Pagination support

#### Chat (`/chat`)
- Real-time messaging interface
- Conversation list with unread indicators
- Message bubbles with timestamps
- Read receipts
- Typing indicators
- Emoji support (placeholder)
- WebSocket-ready architecture

#### Settings (`/settings`)
- Profile management
- Wallet connection
- Notification preferences
- Theme selection (Light/Dark/System)
- Accessibility options

## Technology Stack

### Core
- **Next.js 16** - React framework with App Router
- **React 19** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS 4** - Styling

### Blockchain
- **@solana/web3.js** - Solana blockchain interaction
- **@metaplex-foundation/umi** - NFT minting
- Connects to Solana DevNet

### UI Components
- **Radix UI** - Accessible component primitives
- **Lucide React** - Icon library
- **next-themes** - Theme management
- **date-fns** - Date formatting

## Color Palette

### Dark Mode (Default)
- **Background**: `rgb(2, 6, 23)` - Very dark blue
- **Foreground**: `rgb(248, 250, 252)` - Light slate
- **Primary**: `rgb(59, 130, 246)` - Blue
- **Card**: `rgb(15, 23, 42)` - Dark slate
- **Border**: `rgb(30, 41, 59)` - Slate

### Light Mode
- **Background**: `rgb(248, 250, 252)` - Light slate
- **Foreground**: `rgb(15, 23, 42)` - Dark slate
- **Primary**: `rgb(59, 130, 246)` - Blue

## Project Structure

```
frontend/
├── app/
│   ├── layout.tsx              # Root layout with theme provider
│   ├── page.tsx                # Dashboard page
│   ├── chat/
│   │   └── page.tsx           # Chat page
│   ├── activities/
│   │   └── page.tsx           # Recent activities page
│   ├── settings/
│   │   └── page.tsx           # Settings page
│   └── globals.css            # Global styles
│
├── components/
│   ├── sidebar.tsx            # Sidebar navigation
│   ├── top-header.tsx         # Top header with search
│   ├── app-layout.tsx         # Main layout wrapper
│   └── theme-provider.tsx     # Theme context provider
│
├── lib/
│   ├── solana.ts             # Solana blockchain service
│   ├── websocket.ts          # WebSocket service
│   └── utils.ts              # Utility functions
│
└── package.json
```

## Setup & Installation

### 1. Install Dependencies

```bash
cd frontend
pnpm install
```

### 2. Environment Variables

Create `.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 3. Run Development Server

```bash
pnpm dev
```

The app runs on `http://localhost:3000`

## Key Components

### Sidebar Navigation

```tsx
import { Sidebar } from '@/components/sidebar'

// Features:
// - Collapsible on desktop
// - Hamburger menu on mobile
// - Active page highlighting
// - Smooth animations
```

### Top Header

```tsx
import { TopHeader } from '@/components/top-header'

// Features:
// - Global search
// - Theme toggle
// - Notifications
// - User profile
```

### App Layout

```tsx
import { AppLayout } from '@/components/app-layout'

export default function Page() {
  return (
    <AppLayout>
      {/* Your page content */}
    </AppLayout>
  )
}
```

## Solana Integration

### Fetching Transactions

```tsx
import { solanaService } from '@/lib/solana'

// Get recent transactions
const transactions = await solanaService.getRecentTransactions(50)

// Get transactions by address
const userTxs = await solanaService.getTransactionsByAddress(
  'YOUR_WALLET_ADDRESS',
  20
)

// Get current slot
const slot = await solanaService.getCurrentSlot()
```

### Transaction Data Structure

```typescript
interface SolanaTransaction {
  signature: string
  blockTime: number | null
  slot: number
  fee: number
  status: 'success' | 'failed'
  from: string
  to: string[]
  amount: number
  type: string
}
```

## WebSocket Integration

The WebSocket service is ready for real-time updates. To use it:

### 1. Subscribe to Events

```tsx
import { websocketService } from '@/lib/websocket'
import { useEffect } from 'react'

useEffect(() => {
  const handleMessage = (data) => {
    console.log('New message:', data)
  }

  websocketService.subscribe('message', handleMessage)

  return () => {
    websocketService.unsubscribe('message', handleMessage)
  }
}, [])
```

### 2. Send Messages

```tsx
websocketService.send('message', {
  content: 'Hello!',
  recipientId: '123'
})
```

### 3. Backend WebSocket Server

To enable real-time features, implement a WebSocket server in your backend:

```javascript
// backend/src/websocket.js
const WebSocket = require('ws')

const wss = new WebSocket.Server({ port: 3001, path: '/ws' })

wss.on('connection', (ws) => {
  console.log('Client connected')

  ws.on('message', (message) => {
    const data = JSON.parse(message)
    // Handle message types
    if (data.type === 'message') {
      // Broadcast to other clients
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'message',
            payload: data.payload
          }))
        }
      })
    }
  })

  ws.on('close', () => {
    console.log('Client disconnected')
  })
})
```

## Responsive Design

### Breakpoints

- **Mobile**: < 640px
- **Tablet**: 640px - 1024px
- **Desktop**: > 1024px

### Mobile Features

- Sidebar collapses into hamburger menu
- Tables become scrollable
- Stats grid adjusts to single column
- Touch-optimized interactions

## Accessibility

### Keyboard Navigation

- **Tab**: Navigate through interactive elements
- **Enter**: Activate buttons and links
- **Escape**: Close modals and menus
- **Arrow keys**: Navigate within lists

### Screen Reader Support

- ARIA labels on all interactive elements
- Semantic HTML structure
- Proper heading hierarchy
- Alt text on images

### Focus Management

- Visible focus indicators
- Focus trap in modals
- Focus restoration on close

## Performance Optimizations

### Code Splitting

- Automatic route-based code splitting
- Dynamic imports for heavy components
- Lazy loading for images

### Caching

- React Server Components for static content
- SWR for client-side data fetching
- Browser caching for assets

### Optimizations

```tsx
// Use React.memo for expensive components
const MemoizedComponent = React.memo(ExpensiveComponent)

// Use useMemo for expensive calculations
const filteredData = useMemo(
  () => data.filter(item => item.active),
  [data]
)

// Use useCallback for event handlers
const handleClick = useCallback(() => {
  // Handle click
}, [dependencies])
```

## Deployment

### Build for Production

```bash
pnpm build
pnpm start
```

### Environment Variables

Set these in your production environment:

```bash
NEXT_PUBLIC_API_URL=https://api.yourapp.com
```

### Hosting Options

- **Vercel** (Recommended for Next.js)
- **Netlify**
- **AWS Amplify**
- **Docker** container

## Common Tasks

### Adding a New Page

1. Create page file: `app/your-page/page.tsx`
2. Add to sidebar navigation: `components/sidebar.tsx`
3. Use AppLayout wrapper

```tsx
// app/your-page/page.tsx
'use client'

import { AppLayout } from '@/components/app-layout'

export default function YourPage() {
  return (
    <AppLayout>
      <h1>Your Page</h1>
    </AppLayout>
  )
}
```

### Customizing Theme Colors

Edit `app/globals.css`:

```css
.dark {
  --primary: 59 130 246; /* Change to your color */
}
```

### Adding New Icons

```tsx
import { YourIcon } from 'lucide-react'

<YourIcon className="h-5 w-5 text-blue-500" />
```

## Troubleshooting

### Issue: Styles not applying

**Solution**: Make sure Tailwind classes are in the safelist or use arbitrary values

### Issue: WebSocket not connecting

**Solution**: Check that your backend WebSocket server is running on the correct port

### Issue: Theme not persisting

**Solution**: Check browser localStorage permissions and cookie settings

### Issue: Transactions not loading

**Solution**: Verify Solana DevNet connection and check browser console for errors

## Future Enhancements

- [ ] Wallet integration (Phantom, Solflare)
- [ ] Real-time transaction notifications
- [ ] Advanced charting and analytics
- [ ] NFT gallery view
- [ ] User authentication
- [ ] Push notifications
- [ ] Mobile app (React Native)
- [ ] Multi-language support

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Solana Web3.js](https://solana-labs.github.io/solana-web3.js/)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Radix UI](https://www.radix-ui.com/)
- [Solana Explorer](https://explorer.solana.com/?cluster=devnet)

## Support

For questions or issues:
- Check the documentation
- Review the code comments
- Open a GitHub issue
- Contact the development team

---

Built with ❤️ for HackNYU 2025

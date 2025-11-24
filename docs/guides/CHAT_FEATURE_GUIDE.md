# Floating Chat Feature Guide

Complete guide for the floating chat button and overlay system in HypeChain.

## Overview

The floating chat feature provides a modern, accessible, and fully responsive chat interface that appears on all pages of the application. It includes real-time messaging, typing indicators, message history, and seamless mobile/desktop support.

---

## Features

### 🎨 Design Features

- **Floating Button**: Circular chat icon with gradient background
- **Hover Effects**: Scale animation and pulse ring on hover
- **Tooltip**: Helpful "Chat with us" tooltip on hover
- **Unread Badge**: Red badge showing unread message count (with 9+ overflow)
- **Smooth Animations**: Slide-in, fade-in, and scale transitions
- **Modern Styling**: Gradient headers, rounded corners, shadows

### 💬 Chat Features

- **Real-time Messaging**: WebSocket integration for live chat
- **Typing Indicators**: Shows when agent is typing
- **Message Status**: Sending/Sent/Failed indicators for user messages
- **Auto-scroll**: Automatically scrolls to newest messages
- **Quick Replies**: Pre-defined quick response buttons
- **Character Limit**: 500 character limit with counter
- **Emoji Support**: Emoji button (ready for emoji picker integration)
- **File Attachments**: Attachment button (ready for file upload)

### 📱 Responsive Design

- **Desktop**: Fixed bottom-right corner (96px width, 650px height)
- **Mobile**: Full-screen overlay with backdrop
- **Breakpoint**: Adaptive layout at 768px (md breakpoint)
- **Safe Areas**: Proper margin handling for mobile notches

### ♿ Accessibility Features

- **ARIA Labels**: All interactive elements properly labeled
- **Keyboard Navigation**: Full keyboard support (Enter to send, Esc to close)
- **Screen Reader**: Semantic HTML and proper roles
- **Focus Management**: Auto-focus on input when opened
- **High Contrast**: Works with system theme preferences

### 🔄 States

1. **Closed**: Only floating button visible
2. **Open**: Full chat overlay displayed
3. **Minimized**: Compact bar at bottom-right
4. **Typing**: Shows typing indicator animation

---

## File Structure

```
frontend/components/
├── floating-chat-button.tsx    # Main floating button component
└── chat-overlay.tsx            # Chat interface overlay
```

### Components

#### 1. FloatingChatButton

**File**: [floating-chat-button.tsx](frontend/components/floating-chat-button.tsx)

**Responsibilities:**
- Renders floating button
- Manages open/closed/minimized states
- Tracks unread message count
- Renders minimized chat bar
- Conditionally renders ChatOverlay

**Props**: None (self-contained)

**State:**
- `isOpen` - Whether chat is open
- `isMinimized` - Whether chat is minimized
- `unreadCount` - Number of unread messages

#### 2. ChatOverlay

**File**: [chat-overlay.tsx](frontend/components/chat-overlay.tsx)

**Responsibilities:**
- Full chat interface
- Message display and history
- Input handling
- WebSocket integration
- Typing indicators
- Auto-responses

**Props:**
```typescript
interface ChatOverlayProps {
  onClose: () => void;
  onMinimize: () => void;
  onUnreadChange: (count: number) => void;
}
```

**State:**
- `messages` - Array of chat messages
- `inputValue` - Current input text
- `isTyping` - User is typing
- `agentTyping` - Agent is typing

---

## Usage

### Basic Integration

The floating chat is automatically integrated into the global layout:

```tsx
// app/layout.tsx
import { FloatingChatButton } from '@/components/floating-chat-button';

<AppProvider>
  {children}
  <FloatingChatButton />
</AppProvider>
```

### Customization

#### Change Position

Edit `floating-chat-button.tsx`:

```tsx
// From bottom-right to bottom-left
className="fixed bottom-6 left-6 z-50 group"
```

#### Change Colors

Edit gradient in `floating-chat-button.tsx`:

```tsx
// Main button gradient
className="bg-gradient-to-br from-purple-500 to-purple-600"

// Header gradient in chat-overlay.tsx
className="bg-gradient-to-r from-purple-500 to-purple-600"
```

#### Change Size

Edit dimensions in `floating-chat-button.tsx`:

```tsx
// Larger button: 16 -> 20
<div className="w-20 h-20 ...">
  <MessageCircle className="w-10 h-10 ..." />
</div>
```

Edit chat size in `chat-overlay.tsx`:

```tsx
// Wider chat: max-w-md -> max-w-lg
className="... max-w-lg ..."
```

---

## Message Structure

```typescript
interface Message {
  id: string;                              // Unique message ID
  content: string;                         // Message text
  sender: 'user' | 'bot' | 'agent';       // Who sent it
  timestamp: string;                       // ISO timestamp
  status?: 'sending' | 'sent' | 'failed'; // Delivery status
}
```

### Message Senders

- **user**: Messages sent by the current user (right-aligned, blue)
- **bot**: Automated bot responses (left-aligned, bot icon)
- **agent**: Human support agent (left-aligned, bot icon)

---

## WebSocket Integration

The chat integrates with the existing WebSocket service:

```typescript
import { useWebSocket } from '@/hooks/useWebSocket';

const { sendMessage, isConnected } = useWebSocket();

// Send message
sendMessage('chat_message', {
  content: inputValue,
  timestamp: new Date().toISOString(),
});

// Connection status
{isConnected() ? 'Online' : 'Connecting...'}
```

### Backend Integration

To receive messages from backend, update `useWebSocket` hook to subscribe to chat events:

```typescript
// In hooks/useWebSocket.ts
ws.subscribe('chat_response', (data) => {
  // Add message to chat
  addChatMessage(data);
});
```

---

## Features Deep Dive

### 1. Typing Indicators

**User Typing** (not shown to user):
```typescript
const [isTyping, setIsTyping] = useState(false);

// Debounced typing indicator
const handleInputChange = (e) => {
  setInputValue(e.target.value);
  setIsTyping(true);

  clearTimeout(typingTimeoutRef.current);
  typingTimeoutRef.current = setTimeout(() => {
    setIsTyping(false);
  }, 1000);
};
```

**Agent Typing** (animated dots):
```tsx
{agentTyping && (
  <div className="flex gap-1">
    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
         style={{ animationDelay: '0ms' }} />
    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
         style={{ animationDelay: '150ms' }} />
    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
         style={{ animationDelay: '300ms' }} />
  </div>
)}
```

### 2. Auto-scroll

Messages automatically scroll to bottom:

```typescript
const messagesEndRef = useRef<HTMLDivElement>(null);

const scrollToBottom = () => {
  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
};

useEffect(() => {
  scrollToBottom();
}, [messages]);
```

### 3. Quick Replies

Pre-defined quick responses for common questions:

```tsx
{['How does this work?', 'Create NFT', 'Support'].map((reply) => (
  <button
    onClick={() => {
      setInputValue(reply);
      setTimeout(handleSend, 100);
    }}
  >
    {reply}
  </button>
))}
```

### 4. Minimize State

Minimized view shows compact bar:

```tsx
{isOpen && isMinimized && (
  <div className="... min-w-[280px]">
    <div className="w-10 h-10 bg-gradient ...">
      <MessageCircle />
    </div>
    <div>
      <p>Chat Support</p>
      <p>Click to expand</p>
    </div>
    {unreadCount > 0 && <Badge />}
  </div>
)}
```

### 5. Message Status

Visual indicators for message delivery:

```tsx
{isUser && message.status && (
  <span>
    {message.status === 'sending' && '○'}  // Empty circle
    {message.status === 'sent' && '✓'}     // Checkmark
    {message.status === 'failed' && '✗'}   // X mark
  </span>
)}
```

---

## Animations

### Button Animations

```css
/* Hover scale */
group-hover:scale-110 transition-all duration-300

/* Pulse ring */
group-hover:opacity-30 group-hover:scale-150 transition-all duration-500

/* Badge pulse */
animate-pulse
```

### Overlay Animations

```css
/* Slide in from bottom */
animate-in slide-in-from-bottom-8 duration-300

/* Fade in backdrop */
animate-in fade-in duration-200
```

### Typing Dots

```css
/* Bouncing dots with staggered delay */
animate-bounce
style={{ animationDelay: '0ms' }}
style={{ animationDelay: '150ms' }}
style={{ animationDelay: '300ms' }}
```

---

## Mobile Optimizations

### Full Screen on Mobile

```tsx
// Backdrop overlay (mobile only)
<div className="fixed inset-0 ... md:hidden" onClick={onClose} />

// Responsive dimensions
className="w-full max-w-md md:w-96 h-[600px] md:h-[650px]"
```

### Touch-Friendly

- Large tap targets (minimum 44px)
- Proper spacing for thumbs
- Backdrop dismiss on mobile
- No hover effects on mobile

### Safe Area Margins

```tsx
className="mx-6 md:mx-0"  // Margin on mobile, none on desktop
className="max-h-[calc(100vh-48px)]"  // Accounts for mobile chrome
```

---

## Keyboard Shortcuts

- **Enter**: Send message
- **Shift + Enter**: New line (if textarea used)
- **Esc**: Close chat (can be implemented)

```tsx
const handleKeyPress = (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
};
```

---

## Advanced Features

### 1. Persistent Chat History

Store messages in localStorage:

```typescript
// Save messages
useEffect(() => {
  localStorage.setItem('chat_messages', JSON.stringify(messages));
}, [messages]);

// Load messages on mount
useEffect(() => {
  const saved = localStorage.getItem('chat_messages');
  if (saved) {
    setMessages(JSON.parse(saved));
  }
}, []);
```

### 2. File Upload

Implement file attachment:

```tsx
const handleFileUpload = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  // Add file message to chat
};
```

### 3. Emoji Picker

Integrate emoji picker library:

```tsx
import EmojiPicker from 'emoji-picker-react';

const [showEmojiPicker, setShowEmojiPicker] = useState(false);

<button onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
  <Smile />
</button>

{showEmojiPicker && (
  <EmojiPicker onEmojiClick={(emoji) => {
    setInputValue(prev => prev + emoji.emoji);
  }} />
)}
```

### 4. Message Search

Add search functionality:

```tsx
const [searchQuery, setSearchQuery] = useState('');

const filteredMessages = messages.filter(msg =>
  msg.content.toLowerCase().includes(searchQuery.toLowerCase())
);
```

### 5. Chat Analytics

Track chat metrics:

```typescript
// Track sent messages
const trackMessage = (message: string) => {
  analytics.track('chat_message_sent', {
    length: message.length,
    timestamp: new Date().toISOString(),
  });
};

// Track chat opens
const handleOpen = () => {
  analytics.track('chat_opened');
  setIsOpen(true);
};
```

---

## Styling Customization

### Tailwind Classes Reference

**Button:**
```css
w-16 h-16              /* Size */
bg-gradient-to-br      /* Gradient direction */
from-blue-500          /* Gradient start */
to-blue-600            /* Gradient end */
rounded-full           /* Circular shape */
shadow-lg              /* Shadow depth */
hover:shadow-2xl       /* Hover shadow */
hover:scale-110        /* Hover scale */
transition-all         /* Smooth transitions */
duration-300           /* Animation duration */
```

**Chat Container:**
```css
max-w-md               /* Max width */
h-[650px]             /* Fixed height */
bg-card               /* Theme-aware background */
border border-border  /* Theme-aware border */
rounded-xl            /* Rounded corners */
shadow-2xl            /* Large shadow */
```

**Messages:**
```css
rounded-2xl           /* Message bubble shape */
rounded-tl-none       /* Remove top-left radius */
rounded-tr-none       /* Remove top-right radius */
max-w-[80%]          /* Maximum width */
break-words          /* Word wrapping */
```

---

## Browser Support

- ✅ Chrome (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Edge (latest)
- ✅ Mobile Safari (iOS 14+)
- ✅ Mobile Chrome (Android 9+)

---

## Performance Optimizations

### 1. Debounced Typing

Prevents excessive WebSocket messages:

```typescript
const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

if (typingTimeoutRef.current) {
  clearTimeout(typingTimeoutRef.current);
}

typingTimeoutRef.current = setTimeout(() => {
  setIsTyping(false);
}, 1000);
```

### 2. Lazy Loading

Chat only renders when opened:

```tsx
{isOpen && !isMinimized && <ChatOverlay />}
```

### 3. Virtualized Messages

For long chat histories, use virtualization:

```tsx
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={500}
  itemCount={messages.length}
  itemSize={80}
>
  {({ index, style }) => (
    <div style={style}>
      <MessageBubble message={messages[index]} />
    </div>
  )}
</FixedSizeList>
```

---

## Troubleshooting

### Chat Button Not Appearing

Check:
1. FloatingChatButton imported in layout.tsx
2. No z-index conflicts with other elements
3. Component is inside AppProvider (for theme support)

### Messages Not Scrolling

Check:
1. messagesEndRef is attached to bottom element
2. scrollToBottom() is called in useEffect
3. Parent container has `overflow-y-auto`

### WebSocket Not Connecting

Check:
1. Backend WebSocket server is running
2. NEXT_PUBLIC_WS_URL is set correctly
3. useWebSocket hook is being called
4. Browser console for connection errors

### Mobile Layout Issues

Check:
1. Responsive classes are correct (md: breakpoint)
2. Viewport meta tag is set in layout
3. Safe area margins are applied
4. Touch events are not blocked

---

## Future Enhancements

### Planned Features

1. **Voice Messages**: Record and send audio
2. **Video Chat**: Integrate video calling
3. **Screen Sharing**: Share screen for support
4. **Canned Responses**: Admin-defined quick replies
5. **Chat Routing**: Route to different departments
6. **Offline Messages**: Queue messages when offline
7. **Read Receipts**: Show when agent read message
8. **Rich Media**: Images, GIFs, videos in chat
9. **Code Snippets**: Syntax-highlighted code blocks
10. **Sentiment Analysis**: Detect user mood

### Integration Ideas

1. **CRM Integration**: Sync with Salesforce, HubSpot
2. **Ticketing System**: Create support tickets from chat
3. **Knowledge Base**: Auto-suggest articles
4. **Translation**: Multi-language support
5. **Chatbot AI**: GPT-powered responses
6. **Analytics Dashboard**: Chat metrics and insights

---

## Testing

### Manual Testing Checklist

- [ ] Button appears on all pages
- [ ] Hover effects work smoothly
- [ ] Unread badge shows correctly
- [ ] Chat opens with smooth animation
- [ ] Messages send successfully
- [ ] Typing indicator appears
- [ ] Auto-scroll works
- [ ] Quick replies function
- [ ] Minimize button works
- [ ] Close button works
- [ ] Minimized bar can be re-opened
- [ ] Mobile backdrop dismisses chat
- [ ] Keyboard shortcuts work
- [ ] WebSocket reconnects on disconnect
- [ ] Character limit enforced
- [ ] Mobile layout responsive

### Automated Tests

```typescript
// Example Jest test
describe('FloatingChatButton', () => {
  it('should render button', () => {
    render(<FloatingChatButton />);
    expect(screen.getByLabelText('Open chat')).toBeInTheDocument();
  });

  it('should open chat on click', () => {
    render(<FloatingChatButton />);
    fireEvent.click(screen.getByLabelText('Open chat'));
    expect(screen.getByText('HypeChain Support')).toBeInTheDocument();
  });
});
```

---

## Support

For issues or questions about the chat feature:
- Check this documentation
- Review component code
- Test in different browsers
- Check browser console for errors

---

**Last Updated**: 2025-11-16
**Version**: 1.0.0
**Maintainer**: HypeChain Team

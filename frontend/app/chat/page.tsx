'use client'

import { useState, useRef, useEffect } from 'react'
import { AppLayout } from '@/components/app-layout'
import { Send, Smile, Paperclip, MoreVertical, Check, CheckCheck, Phone, Video } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface Message {
  id: string
  content: string
  sender: 'user' | 'other'
  timestamp: Date
  read: boolean
  senderName?: string
  senderAvatar?: string
}

interface Conversation {
  id: string
  name: string
  avatar: string
  lastMessage: string
  timestamp: Date
  unread: number
  online: boolean
}

// Mock data
const mockConversations: Conversation[] = [
  {
    id: '1',
    name: 'Alice Johnson',
    avatar: '👩‍💼',
    lastMessage: 'Hey, did you check the latest NFT drop?',
    timestamp: new Date(Date.now() - 1000 * 60 * 5),
    unread: 2,
    online: true
  },
  {
    id: '2',
    name: 'Bob Smith',
    avatar: '👨‍💻',
    lastMessage: 'The transaction went through successfully',
    timestamp: new Date(Date.now() - 1000 * 60 * 30),
    unread: 0,
    online: true
  },
  {
    id: '3',
    name: 'Carol White',
    avatar: '👩‍🎨',
    lastMessage: 'Thanks for the help!',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
    unread: 0,
    online: false
  }
]

const mockMessages: Record<string, Message[]> = {
  '1': [
    {
      id: '1',
      content: 'Hey! How are you doing?',
      sender: 'other',
      timestamp: new Date(Date.now() - 1000 * 60 * 10),
      read: true,
      senderName: 'Alice Johnson',
      senderAvatar: '👩‍💼'
    },
    {
      id: '2',
      content: 'I\'m good! Just checking out the new NFT collection.',
      sender: 'user',
      timestamp: new Date(Date.now() - 1000 * 60 * 8),
      read: true
    },
    {
      id: '3',
      content: 'Hey, did you check the latest NFT drop?',
      sender: 'other',
      timestamp: new Date(Date.now() - 1000 * 60 * 5),
      read: true,
      senderName: 'Alice Johnson',
      senderAvatar: '👩‍💼'
    }
  ],
  '2': [
    {
      id: '1',
      content: 'I just sent you 5 SOL',
      sender: 'other',
      timestamp: new Date(Date.now() - 1000 * 60 * 35),
      read: true,
      senderName: 'Bob Smith',
      senderAvatar: '👨‍💻'
    },
    {
      id: '2',
      content: 'Received! Thank you so much!',
      sender: 'user',
      timestamp: new Date(Date.now() - 1000 * 60 * 32),
      read: true
    },
    {
      id: '3',
      content: 'The transaction went through successfully',
      sender: 'other',
      timestamp: new Date(Date.now() - 1000 * 60 * 30),
      read: true,
      senderName: 'Bob Smith',
      senderAvatar: '👨‍💻'
    }
  ]
}

export default function ChatPage() {
  const [conversations] = useState<Conversation[]>(mockConversations)
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(
    mockConversations[0]
  )
  const [messages, setMessages] = useState<Message[]>(mockMessages['1'] || [])
  const [newMessage, setNewMessage] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleSendMessage = () => {
    if (!newMessage.trim() || !selectedConversation) return

    const message: Message = {
      id: Date.now().toString(),
      content: newMessage,
      sender: 'user',
      timestamp: new Date(),
      read: false
    }

    setMessages([...messages, message])
    setNewMessage('')

    // Simulate typing indicator
    setIsTyping(true)
    setTimeout(() => {
      setIsTyping(false)
      // Simulate response
      const response: Message = {
        id: (Date.now() + 1).toString(),
        content: 'Thanks for your message! I\'ll get back to you soon.',
        sender: 'other',
        timestamp: new Date(),
        read: false,
        senderName: selectedConversation.name,
        senderAvatar: selectedConversation.avatar
      }
      setMessages(prev => [...prev, response])
    }, 2000)
  }

  const handleConversationSelect = (conversation: Conversation) => {
    setSelectedConversation(conversation)
    setMessages(mockMessages[conversation.id] || [])
  }

  return (
    <AppLayout className="p-0">
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
        {/* Conversations List */}
        <div className="w-full border-r border-slate-700 bg-slate-900 sm:w-80">
          <div className="border-b border-slate-700 p-4">
            <h2 className="text-xl font-bold text-white">Messages</h2>
          </div>

          <div className="overflow-y-auto" style={{ height: 'calc(100% - 4rem)' }}>
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => handleConversationSelect(conversation)}
                className={`w-full border-b border-slate-700 p-4 text-left transition-colors hover:bg-slate-800 ${
                  selectedConversation?.id === conversation.id ? 'bg-slate-800' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="relative">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 text-2xl">
                      {conversation.avatar}
                    </div>
                    {conversation.online && (
                      <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-slate-900 bg-green-500" />
                    )}
                  </div>

                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-white">{conversation.name}</h3>
                      <span className="text-xs text-slate-400">
                        {formatDistanceToNow(conversation.timestamp, { addSuffix: true })}
                      </span>
                    </div>
                    <p className="truncate text-sm text-slate-400">{conversation.lastMessage}</p>
                  </div>

                  {conversation.unread > 0 && (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                      {conversation.unread}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        {selectedConversation ? (
          <div className="flex flex-1 flex-col">
            {/* Chat Header */}
            <div className="flex items-center justify-between border-b border-slate-700 bg-slate-900 p-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 text-xl">
                    {selectedConversation.avatar}
                  </div>
                  {selectedConversation.online && (
                    <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-slate-900 bg-green-500" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-white">{selectedConversation.name}</h3>
                  <p className="text-xs text-slate-400">
                    {selectedConversation.online ? 'Online' : 'Offline'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
                  <Phone className="h-5 w-5" />
                </button>
                <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
                  <Video className="h-5 w-5" />
                </button>
                <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
                  <MoreVertical className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto bg-slate-950 p-4">
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`flex max-w-[70%] gap-2 ${
                        message.sender === 'user' ? 'flex-row-reverse' : 'flex-row'
                      }`}
                    >
                      {message.sender === 'other' && (
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 text-sm">
                          {message.senderAvatar}
                        </div>
                      )}

                      <div>
                        <div
                          className={`rounded-2xl px-4 py-2 ${
                            message.sender === 'user'
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-800 text-slate-100'
                          }`}
                        >
                          <p className="text-sm">{message.content}</p>
                        </div>
                        <div
                          className={`mt-1 flex items-center gap-1 text-xs text-slate-500 ${
                            message.sender === 'user' ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          <span>{formatDistanceToNow(message.timestamp, { addSuffix: true })}</span>
                          {message.sender === 'user' && (
                            message.read ? (
                              <CheckCheck className="h-3 w-3 text-blue-400" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {isTyping && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-2xl bg-slate-800 px-4 py-2">
                      <div className="flex gap-1">
                        <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
                        <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '0.1s' }} />
                        <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '0.2s' }} />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Message Input */}
            <div className="border-t border-slate-700 bg-slate-900 p-4">
              <div className="flex items-center gap-2">
                <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
                  <Paperclip className="h-5 w-5" />
                </button>

                <input
                  ref={inputRef}
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />

                <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
                  <Smile className="h-5 w-5" />
                </button>

                <button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim()}
                  className="rounded-lg bg-blue-600 p-2 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Send className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center bg-slate-950">
            <p className="text-slate-400">Select a conversation to start messaging</p>
          </div>
        )}
      </div>
    </AppLayout>
  )
}

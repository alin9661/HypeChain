'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Minus,
  Send,
  Paperclip,
  Smile,
  MoreVertical,
  User,
  Bot,
} from 'lucide-react';
import { formatDistance } from 'date-fns';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'bot' | 'agent';
  timestamp: string;
  status?: 'sending' | 'sent' | 'failed';
}

interface ChatOverlayProps {
  onClose: () => void;
  onMinimize: () => void;
  onUnreadChange: (count: number) => void;
}

export function ChatOverlay({
  onClose,
  onMinimize,
  onUnreadChange,
}: ChatOverlayProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: 'Hello! Welcome to HypeChain support. How can I help you today?',
      sender: 'bot',
      timestamp: new Date().toISOString(),
      status: 'sent',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(true); // Static connected state
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll to bottom on new messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Simulate agent typing
  const simulateAgentResponse = (userMessage: string) => {
    setAgentTyping(true);

    setTimeout(() => {
      const responses = [
        "I understand you're asking about " + userMessage + ". Let me help you with that!",
        "That's a great question! For NFT-related queries, you can check our marketplace.",
        "I can help you with that. Would you like me to connect you with a specialist?",
        "Thanks for reaching out! Our team will get back to you shortly.",
      ];

      const randomResponse =
        responses[Math.floor(Math.random() * responses.length)];

      const newMessage: Message = {
        id: Date.now().toString(),
        content: randomResponse,
        sender: 'agent',
        timestamp: new Date().toISOString(),
        status: 'sent',
      };

      setMessages((prev) => [...prev, newMessage]);
      setAgentTyping(false);
    }, 2000);
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      content: inputValue,
      sender: 'user',
      timestamp: new Date().toISOString(),
      status: 'sending',
    };

    setMessages((prev) => [...prev, newMessage]);
    setInputValue('');

    // Update status to sent
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === newMessage.id ? { ...msg, status: 'sent' } : msg
        )
      );
    }, 500);

    // Simulate agent response
    simulateAgentResponse(inputValue);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);

    // Emit typing indicator
    setIsTyping(true);

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 1000);
  };

  return (
    <>
      {/* Backdrop for mobile */}
      <div
        className="fixed inset-0 bg-black/50 z-40 md:hidden animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Chat Container */}
      <div className="fixed bottom-6 right-6 z-50 w-full max-w-md md:w-96 h-[600px] md:h-[650px] max-h-[calc(100vh-48px)] bg-card border border-border rounded-xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-8 duration-300 mx-6 md:mx-0">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-gradient-to-r from-blue-500 to-blue-600 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
            </div>
            <div>
              <h3 className="font-semibold text-white">HypeChain Support</h3>
              <p className="text-xs text-white/80">
                {isConnected ? 'Online' : 'Connecting...'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onMinimize}
              className="p-2 hover:bg-white/10 rounded-lg transition"
              aria-label="Minimize chat"
            >
              <Minus className="w-5 h-5 text-white" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition"
              aria-label="Close chat"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/30">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {/* Typing Indicator */}
          {agentTyping && (
            <div className="flex items-start gap-2">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="bg-card border border-border rounded-2xl rounded-tl-none px-4 py-3 max-w-[80%]">
                <div className="flex gap-1">
                  <div
                    className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
                    style={{ animationDelay: '0ms' }}
                  />
                  <div
                    className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
                    style={{ animationDelay: '150ms' }}
                  />
                  <div
                    className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
                    style={{ animationDelay: '300ms' }}
                  />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Connection Status */}
        {!isConnected && (
          <div className="px-4 py-2 bg-yellow-500/10 border-t border-yellow-500/20">
            <p className="text-xs text-yellow-600 dark:text-yellow-500">
              Reconnecting to chat server...
            </p>
          </div>
        )}

        {/* Input Area */}
        <div className="p-4 border-t border-border bg-card rounded-b-xl">
          <div className="flex items-end gap-2">
            <button
              className="p-2 hover:bg-muted rounded-lg transition flex-shrink-0"
              aria-label="Attach file"
            >
              <Paperclip className="w-5 h-5 text-muted-foreground" />
            </button>

            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                placeholder="Type a message..."
                className="w-full px-4 py-2 bg-muted border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                maxLength={500}
              />
              {inputValue.length > 400 && (
                <span className="absolute right-2 bottom-2 text-xs text-muted-foreground">
                  {inputValue.length}/500
                </span>
              )}
            </div>

            <button
              className="p-2 hover:bg-muted rounded-lg transition flex-shrink-0"
              aria-label="Add emoji"
            >
              <Smile className="w-5 h-5 text-muted-foreground" />
            </button>

            <button
              onClick={handleSend}
              disabled={!inputValue.trim()}
              className="p-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              aria-label="Send message"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Replies */}
          <div className="flex gap-2 mt-3 flex-wrap">
            {['How does this work?', 'Create NFT', 'Support'].map((reply) => (
              <button
                key={reply}
                onClick={() => {
                  setInputValue(reply);
                  setTimeout(handleSend, 100);
                }}
                className="px-3 py-1 text-xs bg-muted hover:bg-muted/80 rounded-full transition"
              >
                {reply}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.sender === 'user';

  return (
    <div className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
          isUser ? 'bg-primary' : 'bg-blue-500'
        }`}
      >
        {isUser ? (
          <User className="w-5 h-5 text-white" />
        ) : (
          <Bot className="w-5 h-5 text-white" />
        )}
      </div>

      {/* Message Content */}
      <div
        className={`flex flex-col max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}
      >
        <div
          className={`px-4 py-2 rounded-2xl ${
            isUser
              ? 'bg-primary text-primary-foreground rounded-tr-none'
              : 'bg-card border border-border rounded-tl-none'
          }`}
        >
          <p className="text-sm break-words">{message.content}</p>
        </div>

        {/* Timestamp & Status */}
        <div
          className={`flex items-center gap-1 mt-1 ${isUser ? 'flex-row-reverse' : ''}`}
        >
          <span className="text-xs text-muted-foreground">
            {formatDistance(new Date(message.timestamp), new Date(), {
              addSuffix: true,
            })}
          </span>
          {isUser && message.status && (
            <span className="text-xs text-muted-foreground">
              {message.status === 'sending' && '○'}
              {message.status === 'sent' && '✓'}
              {message.status === 'failed' && '✗'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

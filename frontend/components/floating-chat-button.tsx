'use client';

import React, { useState } from 'react';
import { MessageCircle, X, Minus } from 'lucide-react';
import { ChatOverlay } from './chat-overlay';

export function FloatingChatButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const handleOpen = () => {
    setIsOpen(true);
    setIsMinimized(false);
    setUnreadCount(0);
  };

  const handleClose = () => {
    setIsOpen(false);
    setIsMinimized(false);
  };

  const handleMinimize = () => {
    setIsMinimized(true);
  };

  const handleMaximize = () => {
    setIsMinimized(false);
  };

  return (
    <>
      {/* Floating Chat Button */}
      {!isOpen && (
        <button
          onClick={handleOpen}
          className="fixed bottom-6 right-6 z-50 group"
          aria-label="Open chat"
        >
          <div className="relative">
            {/* Main Button */}
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full shadow-lg group-hover:shadow-2xl group-hover:scale-110 transition-all duration-300 flex items-center justify-center">
              <MessageCircle className="w-8 h-8 text-white" />
            </div>

            {/* Unread Badge */}
            {unreadCount > 0 && (
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </div>
            )}

            {/* Pulse Ring Animation */}
            <div className="absolute inset-0 rounded-full bg-blue-500 opacity-0 group-hover:opacity-30 group-hover:scale-150 transition-all duration-500" />
          </div>

          {/* Tooltip */}
          <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
            Chat with us
            <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900" />
          </div>
        </button>
      )}

      {/* Minimized Chat Bar */}
      {isOpen && isMinimized && (
        <div
          onClick={handleMaximize}
          className="fixed bottom-6 right-6 z-50 cursor-pointer group"
        >
          <div className="bg-card border border-border rounded-lg shadow-xl px-4 py-3 flex items-center gap-3 hover:shadow-2xl transition-all duration-300 min-w-[280px]">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">Chat Support</p>
              <p className="text-xs text-muted-foreground">Click to expand</p>
            </div>
            {unreadCount > 0 && (
              <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-xs font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Chat Overlay */}
      {isOpen && !isMinimized && (
        <ChatOverlay
          onClose={handleClose}
          onMinimize={handleMinimize}
          onUnreadChange={setUnreadCount}
        />
      )}
    </>
  );
}

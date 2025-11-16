'use client';

import React from 'react';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useNotifications, Notification } from '@/contexts/AppContext';

const iconMap = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const colorMap = {
  success: 'bg-green-500/10 border-green-500/20 text-green-500',
  error: 'bg-red-500/10 border-red-500/20 text-red-500',
  info: 'bg-blue-500/10 border-blue-500/20 text-blue-500',
  warning: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500',
};

function ToastItem({ notification }: { notification: Notification }) {
  const { removeNotification } = useNotifications();
  const Icon = iconMap[notification.type];

  return (
    <div
      className={`flex items-start gap-3 p-4 border rounded-lg shadow-lg backdrop-blur-sm ${
        colorMap[notification.type]
      } animate-in slide-in-from-right duration-300`}
    >
      <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" />
      <p className="flex-1 text-sm font-medium text-foreground">
        {notification.message}
      </p>
      <button
        onClick={() => removeNotification(notification.id)}
        className="text-muted-foreground hover:text-foreground transition flex-shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { notifications } = useNotifications();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-md">
      {notifications.map((notification) => (
        <ToastItem key={notification.id} notification={notification} />
      ))}
    </div>
  );
}

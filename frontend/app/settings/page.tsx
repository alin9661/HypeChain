'use client'

import { AppLayout } from '@/components/app-layout'
import { User, Bell, Shield, Wallet, Moon, Sun } from 'lucide-react'
import { useTheme } from '@/components/theme-provider'

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white">Settings</h1>
          <p className="mt-2 text-slate-400">Manage your account and preferences</p>
        </div>

        {/* Settings Sections */}
        <div className="space-y-6">
          {/* Profile Settings */}
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
            <div className="mb-4 flex items-center gap-3">
              <User className="h-5 w-5 text-blue-500" />
              <h2 className="text-xl font-bold text-white">Profile</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-400">
                  Display Name
                </label>
                <input
                  type="text"
                  defaultValue="User"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-400">Email</label>
                <input
                  type="email"
                  defaultValue="user@example.com"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Wallet Settings */}
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
            <div className="mb-4 flex items-center gap-3">
              <Wallet className="h-5 w-5 text-blue-500" />
              <h2 className="text-xl font-bold text-white">Wallet</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/50 p-4">
                <div>
                  <p className="font-medium text-white">Connected Wallet</p>
                  <p className="text-sm text-slate-400">
                    <code>Not connected</code>
                  </p>
                </div>
                <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  Connect Wallet
                </button>
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
            <div className="mb-4 flex items-center gap-3">
              <Bell className="h-5 w-5 text-blue-500" />
              <h2 className="text-xl font-bold text-white">Notifications</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-white">Transaction Updates</p>
                  <p className="text-sm text-slate-400">Get notified about your transactions</p>
                </div>
                <button className="relative h-6 w-11 rounded-full bg-blue-600 transition-colors">
                  <div className="absolute right-0.5 top-0.5 h-5 w-5 rounded-full bg-white" />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-white">New Messages</p>
                  <p className="text-sm text-slate-400">Get notified about new chat messages</p>
                </div>
                <button className="relative h-6 w-11 rounded-full bg-blue-600 transition-colors">
                  <div className="absolute right-0.5 top-0.5 h-5 w-5 rounded-full bg-white" />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-white">NFT Activity</p>
                  <p className="text-sm text-slate-400">Get notified about NFT marketplace activity</p>
                </div>
                <button className="relative h-6 w-11 rounded-full bg-slate-700 transition-colors">
                  <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white" />
                </button>
              </div>
            </div>
          </div>

          {/* Appearance */}
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
            <div className="mb-4 flex items-center gap-3">
              <Moon className="h-5 w-5 text-blue-500" />
              <h2 className="text-xl font-bold text-white">Appearance</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-400">Theme</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setTheme('light')}
                    className={`rounded-lg border p-3 transition-colors ${
                      theme === 'light'
                        ? 'border-blue-500 bg-blue-600/10'
                        : 'border-slate-700 bg-slate-900/50 hover:border-slate-600'
                    }`}
                  >
                    <Sun className="mx-auto h-5 w-5 text-slate-400" />
                    <p className="mt-2 text-sm text-white">Light</p>
                  </button>

                  <button
                    onClick={() => setTheme('dark')}
                    className={`rounded-lg border p-3 transition-colors ${
                      theme === 'dark'
                        ? 'border-blue-500 bg-blue-600/10'
                        : 'border-slate-700 bg-slate-900/50 hover:border-slate-600'
                    }`}
                  >
                    <Moon className="mx-auto h-5 w-5 text-slate-400" />
                    <p className="mt-2 text-sm text-white">Dark</p>
                  </button>

                  <button
                    onClick={() => setTheme('system')}
                    className={`rounded-lg border p-3 transition-colors ${
                      theme === 'system'
                        ? 'border-blue-500 bg-blue-600/10'
                        : 'border-slate-700 bg-slate-900/50 hover:border-slate-600'
                    }`}
                  >
                    <Shield className="mx-auto h-5 w-5 text-slate-400" />
                    <p className="mt-2 text-sm text-white">System</p>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end gap-4">
            <button className="rounded-lg border border-slate-700 px-6 py-2 font-medium text-white hover:bg-slate-800">
              Cancel
            </button>
            <button className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700">
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

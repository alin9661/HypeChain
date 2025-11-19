'use client';

import React, { useEffect } from 'react';
import { useApiInfo, useListingEndpointInfo, useHealthCheck } from '@/hooks/useApi';
import { CheckCircle, XCircle, Loader2, Code, Book } from 'lucide-react';

export default function ApiDocsPage() {
  const { data: apiInfo, loading: apiLoading, execute: fetchApiInfo } = useApiInfo();
  const { data: listingInfo, loading: listingLoading, execute: fetchListingInfo } = useListingEndpointInfo();
  const { data: health, loading: healthLoading, execute: checkHealth } = useHealthCheck();

  useEffect(() => {
    fetchApiInfo();
    fetchListingInfo();
    checkHealth();
  }, []);

  return (
    <div className="min-h-screen p-6 space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Book className="w-8 h-8 text-primary" />
          <h1 className="text-4xl font-bold">API Documentation</h1>
        </div>
        <p className="text-lg text-muted-foreground">
          Complete reference for HypeChain Backend API endpoints
        </p>
      </div>

      {/* Health Status */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-4">Backend Status</h2>
        {healthLoading ? (
          <div className="flex items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Checking backend status...</span>
          </div>
        ) : health ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="font-medium text-green-500">Backend is healthy</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <p className="font-mono text-sm">{health.status}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Environment</p>
                <p className="font-mono text-sm">{health.environment}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Uptime</p>
                <p className="font-mono text-sm">{health.uptime.toFixed(2)}s</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-red-500">
            <XCircle className="w-5 h-5" />
            <span>Backend is offline or unreachable</span>
          </div>
        )}
      </div>

      {/* API Info */}
      {apiInfo && (
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-2xl font-bold mb-4">API Information</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Name</p>
              <p className="text-lg font-medium">{apiInfo.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Version</p>
              <p className="text-lg font-mono">{apiInfo.version}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Description</p>
              <p className="text-lg">{apiInfo.description}</p>
            </div>
            {apiInfo.documentation && (
              <div>
                <p className="text-sm text-muted-foreground">Documentation</p>
                <a
                  href={apiInfo.documentation}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {apiInfo.documentation}
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Endpoints Documentation */}
      <div className="space-y-6">
        <h2 className="text-3xl font-bold">Available Endpoints</h2>

        {/* Health Check Endpoint */}
        <EndpointCard
          method="GET"
          path="/health"
          description="Server health verification"
          requestExample={null}
          responseExample={{
            status: 'healthy',
            timestamp: '2025-11-16T...',
            uptime: 123.45,
            environment: 'development',
          }}
        />

        {/* API Info Endpoint */}
        <EndpointCard
          method="GET"
          path="/"
          description="Get API information and available endpoints"
          requestExample={null}
          responseExample={apiInfo}
        />

        {/* Listing Info Endpoint */}
        <EndpointCard
          method="GET"
          path="/api/create-listing"
          description="Get detailed information about the create-listing endpoint"
          requestExample={null}
          responseExample={listingInfo}
        />

        {/* Create Listing Endpoint */}
        <EndpointCard
          method="POST"
          path="/api/create-listing"
          description="Create a new NFT listing with AI verification, image generation, and blockchain minting"
          requestExample={{
            userWallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
            productImage: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
            optionalPriceSol: 0.5,
          }}
          responseExample={{
            success: true,
            nft_mint_address: 'ABC123xyz...',
            nft_image_url: 'https://ipfs.io/ipfs/...',
            product_name: 'Nike Air Jordan 1 Retro High OG',
            listing_price_sol: 0.5,
          }}
          requestFields={[
            {
              name: 'userWallet',
              type: 'string',
              required: true,
              description: 'Valid Solana public key (32-44 characters)',
            },
            {
              name: 'productImage',
              type: 'string',
              required: true,
              description:
                'Base64 encoded image with data URI prefix (max 5MB, JPEG/PNG/WebP)',
            },
            {
              name: 'optionalPriceSol',
              type: 'number',
              required: false,
              description: 'Price in SOL (defaults to 0)',
            },
          ]}
          processingSteps={[
            'Validate Solana wallet address and image format',
            'AI verification using GLM-4-Plus vision model - extracts item name (liveness score > 50 required)',
            'Generate NFTified artwork using item name with GPT-5-Image-Mini (digital art, blockchain aesthetic)',
            'Upload images to IPFS via nft.storage',
            'Mint NFT on Solana blockchain using Metaplex',
            'List item on marketplace smart contract (if configured)',
          ]}
        />
      </div>

      {/* Integration Guide */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-4">Integration Guide</h2>
        <div className="space-y-4">
          <Section title="1. Install Dependencies">
            <CodeBlock
              code={`npm install @solana/web3.js @metaplex-foundation/umi nft.storage`}
            />
          </Section>

          <Section title="2. Initialize API Client">
            <CodeBlock
              code={`import { apiClient } from '@/lib/api-client';

// Check backend health
const health = await apiClient.healthCheck();

// Create NFT listing
const result = await apiClient.createListing({
  userWallet: 'YOUR_WALLET_ADDRESS',
  productImage: 'data:image/jpeg;base64,...',
  optionalPriceSol: 0.5
});`}
            />
          </Section>

          <Section title="3. Handle Responses">
            <CodeBlock
              code={`if (result.success && result.data) {
  console.log('NFT Mint Address:', result.data.nft_mint_address);
  console.log('IPFS URL:', result.data.nft_image_url);
  console.log('Product Name:', result.data.product_name);
} else {
  console.error('Error:', result.error);
}`}
            />
          </Section>

          <Section title="4. Error Handling">
            <div className="space-y-2">
              <p className="text-sm">Common error responses:</p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Invalid Solana wallet address (400)</li>
                <li>Image size exceeds 5MB (400)</li>
                <li>Authenticity check failed - liveness score {'<'} 50 (400)</li>
                <li>Server error during processing (500)</li>
              </ul>
            </div>
          </Section>
        </div>
      </div>

      {/* Environment Variables */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-4">Environment Variables</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-2">Variable</th>
                <th className="text-left p-2">Type</th>
                <th className="text-left p-2">Required</th>
                <th className="text-left p-2">Description</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              <tr className="border-b border-border">
                <td className="p-2">NEXT_PUBLIC_API_URL</td>
                <td className="p-2">string</td>
                <td className="p-2">No</td>
                <td className="p-2">Backend API URL (default: http://localhost:3001)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="p-2">NEXT_PUBLIC_WS_URL</td>
                <td className="p-2">string</td>
                <td className="p-2">No</td>
                <td className="p-2">WebSocket URL (default: ws://localhost:3001/ws)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function EndpointCard({
  method,
  path,
  description,
  requestExample,
  responseExample,
  requestFields,
  processingSteps,
}: {
  method: string;
  path: string;
  description: string;
  requestExample: any;
  responseExample: any;
  requestFields?: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
  processingSteps?: string[];
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-6 space-y-4">
      <div className="flex items-start gap-4">
        <span
          className={`px-3 py-1 rounded font-mono text-sm font-bold ${
            method === 'GET'
              ? 'bg-blue-500/10 text-blue-500'
              : 'bg-green-500/10 text-green-500'
          }`}
        >
          {method}
        </span>
        <div className="flex-1">
          <h3 className="text-xl font-mono font-bold">{path}</h3>
          <p className="text-muted-foreground mt-1">{description}</p>
        </div>
      </div>

      {requestFields && (
        <Section title="Request Fields">
          <div className="space-y-2">
            {requestFields.map((field) => (
              <div key={field.name} className="flex items-start gap-2">
                <code className="text-sm bg-muted px-2 py-1 rounded">
                  {field.name}
                </code>
                <span className="text-xs text-muted-foreground">
                  ({field.type}) {field.required && <span className="text-red-500">*</span>}
                </span>
                <span className="text-sm text-muted-foreground flex-1">
                  {field.description}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {processingSteps && (
        <Section title="Processing Pipeline">
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            {processingSteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </Section>
      )}

      {requestExample && (
        <Section title="Request Example">
          <CodeBlock code={JSON.stringify(requestExample, null, 2)} />
        </Section>
      )}

      {responseExample && (
        <Section title="Response Example">
          <CodeBlock code={JSON.stringify(responseExample, null, 2)} />
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="font-medium mb-2 flex items-center gap-2">
        <Code className="w-4 h-4" />
        {title}
      </h4>
      {children}
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = React.useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <button
        onClick={copy}
        className="absolute top-2 right-2 px-2 py-1 bg-muted hover:bg-muted/80 rounded text-xs transition"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/**
 * Unit tests for NFTCard component
 * Run with: npm test
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NFTCard } from '@/components/nft-card';
import { NFTListing } from '@/contexts/AppContext';

// Mock Next.js Image component
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

// Mock date-fns
jest.mock('date-fns', () => ({
  formatDistance: () => '2 hours ago',
}));

describe('NFTCard', () => {
  const mockListing: NFTListing = {
    id: 'test-id',
    success: true,
    nft_mint_address: 'ABC123xyz789',
    nft_image_url: 'https://ipfs.io/ipfs/test',
    product_name: 'Nike Air Jordan 1',
    listing_price_sol: 0.5,
    createdAt: new Date().toISOString(),
    userWallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  };

  it('should render NFT card with correct information', () => {
    render(<NFTCard listing={mockListing} />);

    expect(screen.getByText('Nike Air Jordan 1')).toBeInTheDocument();
    expect(screen.getByText('0.5 SOL')).toBeInTheDocument();
    expect(screen.getByText(/ABC123xyz789/)).toBeInTheDocument();
    expect(screen.getByText('Listed 2 hours ago')).toBeInTheDocument();
  });

  it('should display truncated wallet address', () => {
    render(<NFTCard listing={mockListing} />);

    expect(screen.getByText(/7xKX\.\.\.gAsU/)).toBeInTheDocument();
  });

  it('should call onClick handler when clicked', () => {
    const handleClick = jest.fn();
    render(<NFTCard listing={mockListing} onClick={handleClick} />);

    const card = screen.getByText('Nike Air Jordan 1').closest('div');
    if (card) {
      fireEvent.click(card);
      expect(handleClick).toHaveBeenCalledTimes(1);
    }
  });

  it('should display price in USD when price is greater than 0', () => {
    render(<NFTCard listing={mockListing} />);

    expect(screen.getByText(/\$50\.00/)).toBeInTheDocument();
  });

  it('should not display USD price when listing price is 0', () => {
    const freeListing = { ...mockListing, listing_price_sol: 0 };
    render(<NFTCard listing={freeListing} />);

    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it('should render image with correct src', () => {
    render(<NFTCard listing={mockListing} />);

    const image = screen.getByAlt('Nike Air Jordan 1');
    expect(image).toHaveAttribute('src', 'https://ipfs.io/ipfs/test');
  });

  it('should have IPFS link that opens in new tab', () => {
    render(<NFTCard listing={mockListing} />);

    const link = screen.getByText('View on IPFS').closest('a');
    expect(link).toHaveAttribute('href', 'https://ipfs.io/ipfs/test');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('should prevent event propagation on IPFS link click', () => {
    const handleClick = jest.fn();
    render(<NFTCard listing={mockListing} onClick={handleClick} />);

    const link = screen.getByText('View on IPFS');
    fireEvent.click(link);

    // Should not trigger card onClick
    expect(handleClick).not.toHaveBeenCalled();
  });
});

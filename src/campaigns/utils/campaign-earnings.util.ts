/**
 * Clipster-style earnings: views × payout rate per unit.
 * Example: $1,500 / 1M views × 300k views = $450
 */
export function calculateCampaignEarnings(
  views: number,
  payRate: number,
  payUnit: string,
): number {
  const unit = payUnit.toUpperCase().replace(/\s+/g, '');

  if (
    unit.includes('1M') ||
    unit.includes('1000000') ||
    unit === 'PER_MILLION_VIEWS' ||
    unit === 'MILLION_VIEWS'
  ) {
    return (views / 1_000_000) * payRate;
  }

  if (unit === 'CPM' || unit.includes('1K') || unit.includes('1000')) {
    return (views / 1000) * payRate;
  }

  if (unit === 'VIEW' || unit === 'PERVIEW' || unit === 'PER_VIEW') {
    return views * payRate;
  }

  return 0;
}

export function formatPayRate(payRate: number, payUnit: string): string {
  const unit = payUnit.toUpperCase().replace(/\s+/g, '');

  if (
    unit.includes('1M') ||
    unit.includes('1000000') ||
    unit === 'PER_MILLION_VIEWS' ||
    unit === 'MILLION_VIEWS'
  ) {
    return `$${payRate.toLocaleString('en-US')} / 1M views`;
  }

  if (unit === 'CPM' || unit.includes('1K') || unit.includes('1000')) {
    return `$${payRate.toLocaleString('en-US')} / 1K views`;
  }

  return `$${payRate.toLocaleString('en-US')} / ${payUnit.replace(/_/g, ' ').toLowerCase()}`;
}

export function parseRequirementItems(
  requirements: string,
  requirementItems?: string[] | null,
): string[] {
  if (requirementItems?.length) {
    return requirementItems;
  }

  return requirements
    .split(/\||•|\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatCampaignStatus(status: string): string {
  return status
    .toLowerCase()
    .split('_')
    .join(' ');
}

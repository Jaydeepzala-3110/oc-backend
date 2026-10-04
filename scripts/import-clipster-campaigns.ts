/**
 * Import Clipster-style campaign JSON (src/main.json) into the database.
 *
 * Maps each Clipster campaign onto our Campaign model + typeConfig so the
 * clip validation pipeline runs with that campaign's exact thresholds.
 *
 * Usage: npm run campaigns:import [-- path/to/file.json]
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { CampaignType, Platform, PrismaClient, UserRole } from '@prisma/client';

function loadEnv(): void {
  const envPath = resolve(__dirname, '../.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const prisma = new PrismaClient();

interface ClipsterCampaign {
  id: string;
  name: string;
  description: string;
  max_earnings?: string;
  max_earnings_per_user?: string;
  max_earnings_per_submission?: string;
  rate_per_one_thousand_views?: string;
  thumbnail_url?: string;
  status: string;
  type: string;
  guidelines?: { kind: 'DO' | 'DONT'; content: string }[];
  minimum_views_for_approval?: number | null;
  minimum_views_for_earnings?: number | null;
  max_submission_count_per_social_media_account?: number | null;
  minimum_submission_duration_seconds?: number | null;
  minimum_engagement_percentage?: number | null;
  ends_at?: string;
  sounds?: {
    sound_platform: string;
    sound_id: string;
    sound_name?: string;
    sound_url?: string;
  }[];
  allowed_platforms?: string[];
}

const TYPE_MAP: Record<string, CampaignType> = {
  CAMPAIGN_TYPE_CLIPPING: CampaignType.CLIP,
  CAMPAIGN_TYPE_UGC: CampaignType.UGC,
  CAMPAIGN_TYPE_SONG_PROMOTION: CampaignType.MUSIC_PROMO,
  CAMPAIGN_TYPE_MUSIC: CampaignType.MUSIC_PROMO,
};

const PLATFORM_MAP: Record<string, Platform> = {
  SOCIAL_MEDIA_PLATFORM_INSTAGRAM: Platform.INSTAGRAM,
  SOCIAL_MEDIA_PLATFORM_TIKTOK: Platform.TIKTOK,
  SOCIAL_MEDIA_PLATFORM_YOUTUBE: Platform.YOUTUBE,
  SOCIAL_MEDIA_PLATFORM_TWITTER: Platform.TWITTER,
  SOCIAL_MEDIA_PLATFORM_FACEBOOK: Platform.FACEBOOK,
};

function num(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function buildTypeConfig(c: ClipsterCampaign) {
  return {
    minimumViewsForApproval: num(c.minimum_views_for_approval),
    minimumViewsForEarnings: num(c.minimum_views_for_earnings),
    minimumDurationSeconds: num(c.minimum_submission_duration_seconds),
    minimumEngagementPercent: num(c.minimum_engagement_percentage),
    maxSubmissionsPerAccount: num(
      c.max_submission_count_per_social_media_account,
    ),
    maxEarningsPerSubmission: num(c.max_earnings_per_submission),
    maxEarningsPerUser: num(c.max_earnings_per_user),
    sounds: (c.sounds ?? []).map((s) => ({
      platform: PLATFORM_MAP[s.sound_platform] ?? s.sound_platform,
      soundId: s.sound_id,
      soundName: s.sound_name,
      soundUrl: s.sound_url || undefined,
    })),
    guidelines: c.guidelines ?? [],
    clipsterId: c.id,
  };
}

async function main() {
  const fileArg = process.argv[2] ?? resolve(__dirname, '../src/main.json');
  const raw = JSON.parse(readFileSync(fileArg, 'utf8')) as {
    data?: { campaigns?: ClipsterCampaign[] };
  };
  const campaigns: ClipsterCampaign[] = raw?.data?.campaigns ?? [];

  if (!campaigns.length) {
    console.error(`No campaigns found in ${fileArg}`);
    process.exit(1);
  }

  let client = await prisma.users.findFirst({
    where: {
      role: { in: [UserRole.CLIENT, UserRole.ADMIN, UserRole.SUPER_ADMIN] },
    },
    orderBy: { id: 'asc' },
  });
  if (!client) {
    client = await prisma.users.findFirst({ orderBy: { id: 'asc' } });
    if (client) {
      console.warn(
        `No CLIENT/ADMIN user found — assigning campaigns to user #${client.id} (${client.email}).`,
      );
    }
  }
  if (!client) {
    console.error('No users in the database. Create a user first.');
    process.exit(1);
  }

  let created = 0;
  let skipped = 0;

  for (const c of campaigns) {
    if (c.status !== 'CAMPAIGN_STATUS_ACTIVE') {
      skipped++;
      continue;
    }

    const existing = await prisma.campaign.findFirst({
      where: {
        typeConfig: { path: ['clipsterId'], equals: c.id },
      },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const platforms = (c.allowed_platforms ?? [])
      .map((p) => PLATFORM_MAP[p])
      .filter(Boolean);

    const payRate = num(c.rate_per_one_thousand_views) ?? 1;
    const budget = num(c.max_earnings) ?? 0;

    await prisma.campaign.create({
      data: {
        clientId: client.id,
        title: c.name,
        description: c.description,
        requirements: c.description,
        requirementItems: (c.guidelines ?? []).map(
          (g) => `${g.kind === 'DONT' ? "DON'T: " : ''}${g.content}`,
        ),
        type: TYPE_MAP[c.type] ?? CampaignType.CLIP,
        typeConfig: buildTypeConfig(c),
        status: 'ACTIVE',
        platforms: platforms.length ? platforms : [Platform.INSTAGRAM],
        startDate: new Date(),
        endDate: c.ends_at
          ? new Date(c.ends_at)
          : new Date(Date.now() + 90 * 86400000),
        payRate,
        payUnit: '1K views',
        budget,
        image: c.thumbnail_url ?? null,
      },
    });

    created++;
    console.log(`Created: ${c.name} (${TYPE_MAP[c.type] ?? 'CLIP'})`);
  }

  console.log(
    `\nDone. Created ${created}, skipped ${skipped} (inactive or already imported).`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InitSocialAccountDto, SocialPlatform } from './dto/init-social-account.dto';
import { VerifySocialAccountDto } from './dto/verify-social-account.dto';
import { Platform } from '@prisma/client';
import { ConfigService } from '../config/config.service';
import { parseInstagramUsername } from './utils/instagram-username.util';
import {
  bioContainsVerificationCode,
  extractVerificationCodesFromBio,
} from './utils/verification-code.util';
import {
  buildAccountAvatarUrl,
  resolveStoredAvatarUrl,
} from './utils/avatar-url.util';

@Injectable()
export class SocialAccountsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService
  ) { }

  private generateVerificationCode(): string {
    const uniqueId = Math.floor(10000 + Math.random() * 90000);
    return `OC-${uniqueId}`;
  }

  /** One pending Instagram row per handle; removes duplicate pending rows. */
  private async consolidatePendingInstagramAccount(
    userId: number,
    username: string,
  ) {
    const pending = await this.prisma.socialAccount.findMany({
      where: {
        userId,
        platform: Platform.INSTAGRAM,
        isVerified: false,
      },
      orderBy: { createdAt: 'desc' },
    });

    const matching = pending.filter((acc) => {
      try {
        return parseInstagramUsername(acc.username) === username;
      } catch {
        return false;
      }
    });

    if (matching.length === 0) return null;

    const [keeper, ...duplicates] = matching;

    if (duplicates.length > 0) {
      await this.prisma.socialAccount.deleteMany({
        where: { id: { in: duplicates.map((d) => d.id) } },
      });
    }

    if (keeper.username !== username) {
      return this.prisma.socialAccount.update({
        where: { id: keeper.id },
        data: { username },
      });
    }

    return keeper;
  }

  async initVerification(userId: number, dto: InitSocialAccountDto) {
    if (dto.platform !== SocialPlatform.INSTAGRAM) {
      throw new BadRequestException('Only Instagram verification is supported at this time.');
    }

    const username = parseInstagramUsername(dto.username);

    const verified = await this.prisma.socialAccount.findFirst({
      where: {
        userId,
        platform: Platform.INSTAGRAM,
        username,
        isVerified: true,
      },
    });

    if (verified) {
      throw new BadRequestException('This account is already verified.');
    }

    const consolidated = await this.consolidatePendingInstagramAccount(
      userId,
      username,
    );

    if (consolidated) {
      return {
        message: 'Verification already initiated',
        code: consolidated.verificationCode,
        verificationCode: consolidated.verificationCode,
        accountId: consolidated.id,
        username,
        instruction: `Add "${consolidated.verificationCode}" to the Instagram bio for @${username}, then click Verify Now.`,
      };
    }

    const verificationCode = this.generateVerificationCode();

    const account = await this.prisma.socialAccount.create({
      data: {
        userId,
        platform: Platform[dto.platform],
        username,
        verificationCode,
        isVerified: false,
      },
    });

    return {
      message: 'Verification initiated',
      code: verificationCode,
      verificationCode,
      accountId: account.id,
      username,
      instruction: `Add "${verificationCode}" to the Instagram bio for @${username}, then click Verify Now.`,
    };
  }

  async verifyAccount(userId: number, dto: VerifySocialAccountDto) {
    let account = await this.prisma.socialAccount.findUnique({
      where: { id: dto.accountId },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    if (account.userId !== userId) {
      throw new BadRequestException('Unauthorized access to this account');
    }

    if (account.isVerified) {
      return { message: 'Account already verified', success: true };
    }

    const instagramUsername = parseInstagramUsername(account.username);

    const accountForCode = await this.prisma.socialAccount.findFirst({
      where: {
        userId,
        platform: Platform.INSTAGRAM,
        verificationCode: dto.code,
        isVerified: false,
      },
    });

    if (accountForCode) {
      account = accountForCode;
    } else if (account.verificationCode !== dto.code) {
      throw new BadRequestException(
        `Verification code mismatch. Use the code shown in this app (${account.verificationCode}), not ${dto.code}. Generate a new code if needed.`,
      );
    }

    if (parseInstagramUsername(account.username) !== instagramUsername) {
      throw new BadRequestException(
        'This verification code does not belong to the Instagram account you are connecting.',
      );
    }

    if (account.username !== instagramUsername) {
      await this.prisma.socialAccount.update({
        where: { id: account.id },
        data: { username: instagramUsername },
      });
    }

    let bioContainsCode = false;
    let biography = '';
    const avatarUrl = buildAccountAvatarUrl(instagramUsername);

    try {
      const response = await fetch(
        'https://instagram120.p.rapidapi.com/api/instagram/profile',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-rapidapi-host': 'instagram120.p.rapidapi.com',
            'x-rapidapi-key': this.config.rapidAPIkey,
          },
          body: JSON.stringify({ username: instagramUsername }),
        },
      );

      if (!response.ok) {
        throw new Error(`Instagram API HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data?.success === false) {
        const apiMessage =
          data?.message ||
          data?.response_type ||
          'Instagram profile could not be loaded.';
        throw new BadRequestException(
          `Instagram profile not found for @${instagramUsername}. ${apiMessage} Ensure the username is correct and the profile is public.`,
        );
      }

      const profile = data?.result ?? data?.data ?? data?.user;
      if (!profile) {
        throw new BadRequestException(
          `Could not read Instagram profile for @${instagramUsername}. Try again in a few minutes.`,
        );
      }

      biography = profile.biography ?? profile.bio ?? '';

      if (!account.verificationCode) {
        throw new BadRequestException('No verification code found for this account.');
      }

      bioContainsCode = bioContainsVerificationCode(biography, dto.code);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error('Error verifying Instagram bio:', error);
      throw new BadRequestException(
        'Could not reach Instagram verification service. Please try again later.',
      );
    }

    if (!bioContainsCode) {
      const codesInBio = extractVerificationCodesFromBio(biography);
      const bioHint =
        codesInBio.length > 0
          ? ` Your bio shows ${codesInBio.join(', ')} but we need ${dto.code}.`
          : '';

      throw new BadRequestException(
        `Verification code "${dto.code}" was not found in @${instagramUsername}'s bio.${bioHint} Copy the code from this page, update your Instagram bio, save, wait about a minute, then try again.`,
      );
    }

    const updated = await this.prisma.socialAccount.update({
      where: { id: account.id },
      data: {
        isVerified: true,
        verifiedAt: new Date(),
        avatarUrl,
        username: instagramUsername,
      },
    });

    return {
      message: 'Account verified successfully!',
      success: true,
      account: updated
    };
  }

  async getUserAccounts(userId: number) {
    const accounts = await this.prisma.socialAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return accounts.map(({ accessToken, ...account }) => ({
      ...account,
      avatarUrl: resolveStoredAvatarUrl(account.username, account.avatarUrl),
      instagramConnected: Boolean(accessToken),
    }));
  }

  async removeAccount(userId: number, accountId: number) {
    const account = await this.prisma.socialAccount.findUnique({ where: { id: accountId } });
    if (!account || account.userId !== userId) {
      throw new NotFoundException('Account not found');
    }
    return this.prisma.socialAccount.delete({ where: { id: accountId } });
  }
}

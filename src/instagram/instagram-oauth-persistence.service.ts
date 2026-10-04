import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Platform } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  InstagramOAuthTokens,
  InstagramProfile,
} from './instagram-oauth.service';
import { buildAccountAvatarUrl } from '../social-accounts/utils/avatar-url.util';

@Injectable()
export class InstagramOAuthPersistenceService {
  constructor(private readonly prisma: PrismaService) {}

  async linkInstagramAccount(
    userId: number,
    profile: InstagramProfile,
    tokens: InstagramOAuthTokens,
  ): Promise<{ userId: number; username: string }> {
    if (!Number.isFinite(userId) || userId <= 0) {
      throw new BadRequestException('Invalid userId in OAuth state');
    }

    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const username = profile.username.toLowerCase();
    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);

    const existingForOtherUser = await this.prisma.socialAccount.findFirst({
      where: {
        platform: Platform.INSTAGRAM,
        OR: [{ username }, { instagramUserId: profile.id }],
        NOT: { userId },
      },
    });

    if (existingForOtherUser) {
      throw new ConflictException(
        'This Instagram account is already linked to another user',
      );
    }

    const existingForUser = await this.prisma.socialAccount.findFirst({
      where: {
        userId,
        platform: Platform.INSTAGRAM,
        username,
      },
    });

    const verificationCode =
      existingForUser?.verificationCode ??
      `OC-${Math.floor(10000 + Math.random() * 90000)}`;

    const data = {
      username,
      profileUrl: `https://instagram.com/${username}`,
      avatarUrl: buildAccountAvatarUrl(username),
      instagramUserId: profile.id,
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: expiresAt,
      isVerified: true,
      verifiedAt: new Date(),
    };

    if (existingForUser) {
      await this.prisma.socialAccount.update({
        where: { id: existingForUser.id },
        data,
      });
    } else {
      await this.prisma.socialAccount.create({
        data: {
          userId,
          platform: Platform.INSTAGRAM,
          verificationCode,
          ...data,
        },
      });
    }

    return { userId, username };
  }
}

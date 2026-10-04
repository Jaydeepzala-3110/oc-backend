import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export enum SocialPlatform {
    INSTAGRAM = 'INSTAGRAM',
    TIKTOK = 'TIKTOK',
    YOUTUBE = 'YOUTUBE',
    TWITTER = 'TWITTER',
    FACEBOOK = 'FACEBOOK',
}

export class InitSocialAccountDto {
    @IsString()
    @IsNotEmpty()
    username: string;

    @IsEnum(SocialPlatform)
    @IsNotEmpty()
    platform: SocialPlatform;
}

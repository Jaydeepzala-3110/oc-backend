import { IsNotEmpty, IsString, IsOptional, IsEnum, IsInt, IsArray, IsNumber, IsDateString, IsUrl, IsObject } from 'class-validator';
import { CampaignStatus, CampaignType, Platform } from '@prisma/client';

export class CreateCampaignDto {
    @IsInt()
    @IsNotEmpty()
    clientId: number;

    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsNotEmpty()
    description: string;

    @IsString()
    @IsOptional()
    image?: string;

    @IsString()
    @IsNotEmpty()
    requirements: string;

    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    requirementItems?: string[];

    @IsEnum(CampaignStatus)
    @IsOptional()
    status?: CampaignStatus;

    @IsEnum(CampaignType)
    @IsOptional()
    type?: CampaignType;

    /** Type-specific config (e.g. ClipCampaignConfig for CLIP campaigns). */
    @IsObject()
    @IsOptional()
    typeConfig?: Record<string, any>;

    @IsArray()
    @IsEnum(Platform, { each: true })
    platforms: Platform[];

    @IsDateString()
    @IsNotEmpty()
    startDate: string;

    @IsDateString()
    @IsNotEmpty()
    endDate: string;

    @IsDateString()
    @IsOptional()
    minimumPostDate?: string;

    @IsNumber()
    @IsNotEmpty()
    payRate: number;

    @IsString()
    @IsNotEmpty()
    payUnit: string;

    @IsNumber()
    @IsNotEmpty()
    budget: number;

    @IsUrl()
    @IsOptional()
    campaignLink?: string;

    @IsUrl()
    @IsOptional()
    telegramGroupLink?: string;

    @IsOptional()
    validationRules?: any;
}

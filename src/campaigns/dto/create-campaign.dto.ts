import { IsNotEmpty, IsString, IsOptional, IsEnum, IsInt, IsArray, IsNumber, IsDateString } from 'class-validator';
import { CampaignStatus, Platform } from '@prisma/client';

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

    @IsEnum(CampaignStatus)
    @IsOptional()
    status?: CampaignStatus;

    @IsArray()
    @IsEnum(Platform, { each: true })
    platforms: Platform[];

    @IsDateString()
    @IsNotEmpty()
    startDate: string;

    @IsDateString()
    @IsNotEmpty()
    endDate: string;

    @IsNumber()
    @IsNotEmpty()
    payRate: number;

    @IsString()
    @IsNotEmpty()
    payUnit: string;

    @IsNumber()
    @IsNotEmpty()
    budget: number;

    @IsOptional()
    validationRules?: any;
}

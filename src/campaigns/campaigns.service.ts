import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { SubmitContentDto } from './dto/submit-content.dto';
import { GameValidationService } from './game-validation.service';

@Injectable()
export class CampaignsService {
    constructor(
        private prisma: PrismaService,
        private gameValidationService: GameValidationService
    ) { }

    async getCampaigns(userId?: number) {
        const campaigns = await this.prisma.campaign.findMany({
            include: {
                client: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    }
                },
                participations: userId ? {
                    where: { clipperId: userId }
                } : false
            }
        });

        if (userId) {
            return campaigns.map(campaign => ({
                ...campaign,
                isJoined: campaign.participations.length > 0
            }));
        }

        return campaigns;
    }

    async createCampaign(createCampaignDto: CreateCampaignDto) {
        return this.prisma.campaign.create({
            data: {
                ...createCampaignDto,
                startDate: new Date(createCampaignDto.startDate),
                endDate: new Date(createCampaignDto.endDate),
            },
        });
    }

    async getCampaignById(id: number, userId?: number) {
        const campaign = await this.prisma.campaign.findUnique({
            where: { id },
            include: {
                client: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    }
                },
                participations: userId ? {
                    where: { clipperId: userId }
                } : false
            }
        });

        if (!campaign) {
            throw new NotFoundException('Campaign not found');
        }

        if (userId) {
            return {
                ...campaign,
                isJoined: campaign.participations.length > 0,
                participation: campaign.participations[0] || null
            };
        }

        return campaign;
    }

    async joinCampaign(campaignId: number, userId: number) {
        // Check if campaign exists and is active
        const campaign = await this.prisma.campaign.findUnique({
            where: { id: campaignId },
        });

        if (!campaign) {
            throw new NotFoundException('Campaign not found');
        }

        if (campaign.status !== 'ACTIVE') {
            throw new BadRequestException('Campaign is not active');
        }

        // Check if already joined
        const existingParticipation = await this.prisma.participation.findFirst({
            where: {
                campaignId,
                clipperId: userId,
            },
        });

        if (existingParticipation) {
            throw new ConflictException('Already joined this campaign');
        }

        return this.prisma.participation.create({
            data: {
                campaignId,
                clipperId: userId,
            },
        });
    }

    async submitContent(campaignId: number, userId: number, dto: SubmitContentDto) {
        // 1. Check participation
        const participation = await this.prisma.participation.findFirst({
            where: { campaignId, clipperId: userId },
            include: { campaign: true }
        });

        if (!participation) {
            throw new BadRequestException('You must join the campaign before submitting content');
        }

        // 2. Perform Automated Rule Verification (Using the new GameValidationService)
        // For demo: passing a static path since scraper is not yet full implemented
        const verificationResult = await this.gameValidationService.validateReel(
            '/Users/jaydeepzala/Dev/Projects/only-creators/oc-backend/scripts/image.png',
            participation.campaign
        );

        // 3. Update participation with submission data (Storing as JSON for now)
        return this.prisma.participation.update({
            where: { id: participation.id },
            data: {
                submissionUrl: dto.url,
                submissionStatus: verificationResult.allPassed ? 'VERIFIED' : 'REJECTED',
                submissionDetails: verificationResult as any, // Store detailed pass/fail
                submittedAt: new Date()
            }
        });
    }
}
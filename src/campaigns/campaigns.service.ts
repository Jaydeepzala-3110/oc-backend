import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { CampaignType } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { SubmitContentDto } from './dto/submit-content.dto';
import { ReviewCheckDto } from './dto/review-check.dto';
import { ClipHandler } from './types/clip/clip.handler';
import {
    SubmissionStatus,
    ValidationCheck,
} from './validation/validation-types';
import {
    calculateCampaignEarnings,
    formatPayRate,
    parseRequirementItems,
} from './utils/campaign-earnings.util';

@Injectable()
export class CampaignsService {
    constructor(
        private prisma: PrismaService,
        private clipHandler: ClipHandler,
    ) { }

    private enrichCampaign(campaign: any, userId?: number) {
        const requirementItems = parseRequirementItems(
            campaign.requirements,
            campaign.requirementItems,
        );
        const payRateLabel = formatPayRate(campaign.payRate, campaign.payUnit);
        const canJoin = campaign.status === 'ACTIVE';

        const participation = userId && campaign.participations?.length
            ? {
                ...campaign.participations[0],
                projectedEarnings: calculateCampaignEarnings(
                    campaign.participations[0].views || 0,
                    campaign.payRate,
                    campaign.payUnit,
                ),
            }
            : null;

        return {
            ...campaign,
            requirementItems,
            payRateLabel,
            canJoin,
            isJoined: Boolean(userId && campaign.participations?.length > 0),
            participation,
            participations: undefined,
        };
    }

    async getCampaigns(userId?: number) {
        const campaigns = await this.prisma.campaign.findMany({
            orderBy: { createdAt: 'desc' },
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

        return campaigns.map((campaign) => this.enrichCampaign(campaign, userId));
    }

    async createCampaign(createCampaignDto: CreateCampaignDto) {
        const requirementItems = createCampaignDto.requirementItems?.length
            ? createCampaignDto.requirementItems
            : parseRequirementItems(createCampaignDto.requirements);

        return this.prisma.campaign.create({
            data: {
                ...createCampaignDto,
                requirementItems,
                startDate: new Date(createCampaignDto.startDate),
                endDate: new Date(createCampaignDto.endDate),
                minimumPostDate: createCampaignDto.minimumPostDate
                    ? new Date(createCampaignDto.minimumPostDate)
                    : undefined,
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

        return this.enrichCampaign(campaign, userId);
    }

    async joinCampaign(campaignId: number, userId: number) {
        const campaign = await this.prisma.campaign.findUnique({
            where: { id: campaignId },
        });

        if (!campaign) {
            throw new NotFoundException('Campaign not found');
        }

        if (campaign.status !== 'ACTIVE') {
            throw new BadRequestException(
                'Only active campaigns are open for clippers to join',
            );
        }

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
        const participation = await this.prisma.participation.findFirst({
            where: { campaignId, clipperId: userId },
            include: { campaign: true },
        });

        if (!participation) {
            throw new BadRequestException('You must join the campaign before submitting content');
        }

        const campaign = participation.campaign;

        if (campaign.type !== CampaignType.CLIP) {
            throw new BadRequestException(
                `${campaign.type} campaign submissions are not supported yet`,
            );
        }

        const { validation, earnings } = await this.clipHandler.handleSubmission(
            campaign,
            userId,
            dto.url,
        );

        return this.prisma.participation.update({
            where: { id: participation.id },
            data: {
                submissionUrl: dto.url,
                submissionStatus: validation.status,
                submissionDetails: {
                    source: 'instagram_graph_api',
                    username: validation.username,
                    mediaId: validation.mediaId,
                    permalink: validation.permalink,
                    mediaType: validation.mediaType,
                    timestamp: validation.postedAt,
                    metrics: validation.metrics as any,
                    checks: validation.checks as any,
                    rejectionCode: validation.rejectionCode,
                    rejectionReason: validation.rejectionReason,
                },
                views: validation.metrics.views,
                earnings,
                submittedAt: new Date(),
                lastMetricsSync:
                    validation.status === SubmissionStatus.REJECTED ? null : new Date(),
            },
        });
    }

    /** Admin: dashboard KPIs. */
    async adminOverview() {
        const [campaigns, byStatus, totals, recent] = await Promise.all([
            this.prisma.campaign.groupBy({ by: ['status'], _count: true }),
            this.prisma.participation.groupBy({
                by: ['submissionStatus'],
                where: { submissionUrl: { not: null } },
                _count: true,
            }),
            this.prisma.participation.aggregate({
                where: { submissionUrl: { not: null } },
                _sum: { views: true, earnings: true },
            }),
            this.prisma.participation.findMany({
                where: { submissionUrl: { not: null } },
                orderBy: { submittedAt: 'desc' },
                take: 8,
                include: {
                    campaign: { select: { id: true, title: true, type: true } },
                    clipper: { select: { id: true, firstName: true, lastName: true, email: true } },
                },
            }),
        ]);

        return {
            campaigns: Object.fromEntries(campaigns.map((c) => [c.status, c._count])),
            submissions: Object.fromEntries(
                byStatus.map((s) => [s.submissionStatus ?? 'NONE', s._count]),
            ),
            totalViews: totals._sum.views ?? 0,
            totalEarnings: totals._sum.earnings ?? 0,
            recentSubmissions: recent.map((p) => this.toAdminSubmission(p)),
        };
    }

    /** Admin: all campaigns with participation counts. */
    async adminListCampaigns() {
        const campaigns = await this.prisma.campaign.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                _count: { select: { participations: true } },
                participations: {
                    where: { submissionUrl: { not: null } },
                    select: { submissionStatus: true, views: true, earnings: true },
                },
            },
        });

        return campaigns.map((c) => {
            const submitted = c.participations;
            const { participations, _count, ...rest } = c;
            return {
                ...rest,
                participantCount: _count.participations,
                submissionCount: submitted.length,
                pendingCount: submitted.filter((p) => p.submissionStatus === 'PENDING').length,
                verifiedCount: submitted.filter((p) => p.submissionStatus === 'VERIFIED').length,
                rejectedCount: submitted.filter((p) => p.submissionStatus === 'REJECTED').length,
                totalViews: submitted.reduce((sum, p) => sum + (p.views || 0), 0),
                totalEarnings: submitted.reduce((sum, p) => sum + (p.earnings || 0), 0),
            };
        });
    }

    /** Admin: submissions list, optionally filtered by status / campaign. */
    async adminListSubmissions(status?: string, campaignId?: number) {
        const participations = await this.prisma.participation.findMany({
            where: {
                submissionUrl: { not: null },
                ...(status ? { submissionStatus: status } : {}),
                ...(campaignId ? { campaignId } : {}),
            },
            orderBy: { submittedAt: 'desc' },
            include: {
                campaign: { select: { id: true, title: true, type: true, payRate: true, payUnit: true } },
                clipper: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
        });

        return participations.map((p) => this.toAdminSubmission(p));
    }

    private toAdminSubmission(p: any) {
        const details =
            typeof p.submissionDetails === 'object' && p.submissionDetails !== null
                ? p.submissionDetails
                : {};
        const checks: ValidationCheck[] = Array.isArray(details.checks) ? details.checks : [];
        return {
            id: p.id,
            campaign: p.campaign,
            clipper: p.clipper,
            submissionUrl: p.submissionUrl,
            submissionStatus: p.submissionStatus,
            submittedAt: p.submittedAt,
            views: p.views,
            earnings: p.earnings,
            lastMetricsSync: p.lastMetricsSync,
            username: details.username ?? null,
            permalink: details.permalink ?? null,
            rejectionCode: details.rejectionCode ?? null,
            rejectionReason: details.rejectionReason ?? null,
            metrics: details.metrics ?? null,
            checks,
            needsReview: checks.some((c) => c.passed === null),
            reviewedAt: details.reviewedAt ?? null,
        };
    }

    /**
     * Admin resolution of an "in review" check (passed: null) — sound match,
     * duration, AI content rules. Failing a check rejects the submission;
     * passing one keeps the normal PENDING/VERIFIED lifecycle.
     */
    async reviewSubmissionCheck(participationId: number, dto: ReviewCheckDto) {
        const participation = await this.prisma.participation.findUnique({
            where: { id: participationId },
        });
        if (!participation?.submissionUrl) {
            throw new NotFoundException('Submission not found');
        }

        const details =
            typeof participation.submissionDetails === 'object' &&
                participation.submissionDetails !== null
                ? (participation.submissionDetails as Record<string, any>)
                : {};
        const checks: ValidationCheck[] = Array.isArray(details.checks)
            ? (details.checks as ValidationCheck[])
            : [];

        const check = checks.find((c) => c.id === dto.checkId);
        if (!check) {
            throw new BadRequestException(
                `Check "${dto.checkId}" not found on this submission`,
            );
        }

        check.passed = dto.passed;
        check.detail = dto.note ?? (dto.passed ? 'Approved by admin review' : 'Failed admin review');

        const rejected = !dto.passed;

        return this.prisma.participation.update({
            where: { id: participationId },
            data: {
                submissionStatus: rejected
                    ? SubmissionStatus.REJECTED
                    : participation.submissionStatus,
                earnings: rejected ? 0 : participation.earnings,
                submissionDetails: {
                    ...details,
                    checks: checks as any,
                    ...(rejected
                        ? {
                            rejectionCode: 'CONTENT_RULES_FAILED',
                            rejectionReason:
                                dto.note ?? `Failed manual review: ${check.label}`,
                        }
                        : {}),
                    reviewedAt: new Date().toISOString(),
                },
            },
        });
    }
}
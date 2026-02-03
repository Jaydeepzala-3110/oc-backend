import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReelsDto } from './dto/create-reels.dto';

@Injectable()
export class ReelsService {
    constructor(private prisma: PrismaService) { }

    async createReels(userId: number, dto: CreateReelsDto) {
        // 1. Verify participation
        const participation = await this.prisma.participation.findFirst({
            where: {
                campaignId: dto.campaignId,
                clipperId: userId,
            },
        });

        if (!participation) {
            throw new BadRequestException('You must join the campaign before submitting reels.');
        }

        // 2. Create reels in bulk
        const reelsData = dto.urls.map((url) => ({
            url,
            participationId: participation.id,
            status: 'PENDING', // Default status
        }));

        await this.prisma.reel.createMany({
            data: reelsData,
        });

        return { message: 'Reels submitted successfully', count: reelsData.length };
    }

    async getUserReels(userId: number) {
        return this.prisma.reel.findMany({
            where: {
                participation: {
                    clipperId: userId,
                },
            },
            include: {
                participation: {
                    include: {
                        campaign: {
                            select: {
                                title: true,
                                description: true,
                                image: true
                            }
                        },
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
    }
}

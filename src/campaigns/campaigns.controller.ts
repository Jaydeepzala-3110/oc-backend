import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { SubmitContentDto } from './dto/submit-content.dto';
import { ReviewCheckDto } from './dto/review-check.dto';
import { GetCurrentUser, Roles } from '../common/decorators';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { Request } from 'express';

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) { }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getCampaigns(@GetCurrentUser('sub') userId: number) {
    return this.campaignsService.getCampaigns(userId);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async createCampaign(@Body() createCampaignDto: CreateCampaignDto) {
    return this.prismaCreateCampaign(createCampaignDto); // Helper or service call
  }

  @Get('admin/overview')
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async adminOverview() {
    return this.campaignsService.adminOverview();
  }

  @Get('admin/list')
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async adminListCampaigns() {
    return this.campaignsService.adminListCampaigns();
  }

  @Get('admin/submissions')
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async adminListSubmissions(
    @Req() req: Request,
  ) {
    const { status, campaignId } = req.query as {
      status?: string;
      campaignId?: string;
    };
    return this.campaignsService.adminListSubmissions(
      status,
      campaignId ? Number(campaignId) : undefined,
    );
  }

  // Debug catch-all for GET /campaigns/*
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getCampaignById(
    @Param('id', ParseIntPipe) id: number,
    @GetCurrentUser('sub') userId: number,
  ) {
    return this.campaignsService.getCampaignById(id, userId);
  }

  @Post(':id/join')
  @Roles(UserRole.CLIPPER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async joinCampaign(
    @Param('id', ParseIntPipe) id: number,
    @GetCurrentUser('sub') userId: number,
  ) {
    return await this.campaignsService.joinCampaign(id, userId);
  }

  @Post(':id/submit')
  @Roles(UserRole.CLIPPER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async submitContent(
    @Param('id', ParseIntPipe) id: number,
    @GetCurrentUser('sub') userId: number,
    @Body() dto: SubmitContentDto,
  ) {
    return await this.campaignsService.submitContent(id, userId, dto);
  }

  /** Admin: resolve an "in review" validation check (sound/duration/content rules). */
  @Patch('participations/:participationId/review')
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async reviewCheck(
    @Param('participationId', ParseIntPipe) participationId: number,
    @Body() dto: ReviewCheckDto,
  ) {
    return this.campaignsService.reviewSubmissionCheck(participationId, dto);
  }

  private prismaCreateCampaign(dto: CreateCampaignDto) {
    return this.campaignsService.createCampaign(dto);
  }
}

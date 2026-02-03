import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { GetCurrentUser } from '../common/decorators/get-current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateReelsDto } from './dto/create-reels.dto';
import { ReelsService } from './reels.service';

@UseGuards(JwtAuthGuard)
@Controller('reels')
export class ReelsController {
    constructor(private readonly reelsService: ReelsService) { }

    @Post()
    async createReels(@GetCurrentUser('id') userId: number, @Body() dto: CreateReelsDto) {
        return this.reelsService.createReels(userId, dto);
    }

    @Get()
    async getUserReels(@GetCurrentUser('id') userId: number) {
        return this.reelsService.getUserReels(userId);
    }
}

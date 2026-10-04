import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { GetCurrentUser } from '../common/decorators/get-current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { InitSocialAccountDto } from './dto/init-social-account.dto';
import { VerifySocialAccountDto } from './dto/verify-social-account.dto';
import { SocialAccountsService } from './social-accounts.service';

@UseGuards(JwtAuthGuard)
@Controller('social-accounts')
export class SocialAccountsController {
    constructor(private readonly socialAccountsService: SocialAccountsService) { }

    @Post('init')
    async initVerification(@GetCurrentUser('id') userId: number, @Body() dto: InitSocialAccountDto) {
        return this.socialAccountsService.initVerification(userId, dto);
    }

    @Post('verify')
    async verifyAccount(@GetCurrentUser('id') userId: number, @Body() dto: VerifySocialAccountDto) {
        return this.socialAccountsService.verifyAccount(userId, dto);
    }

    @Get()
    async getUserAccounts(@GetCurrentUser('id') userId: number) {
        return this.socialAccountsService.getUserAccounts(userId);
    }

    @Delete(':id')
    async removeAccount(@GetCurrentUser('id') userId: number, @Param('id', ParseIntPipe) accountId: number) {
        return this.socialAccountsService.removeAccount(userId, accountId);
    }
}
